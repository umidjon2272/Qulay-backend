import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const responsesCreateMock = jest.fn();

jest.mock('openai', () => {
  const actual = jest.requireActual('openai');
  const MockOpenAI = jest.fn().mockImplementation(() => ({ responses: { create: responsesCreateMock } }));
  Object.assign(MockOpenAI, actual.default);
  return { __esModule: true, default: MockOpenAI };
});

// eslint-disable-next-line import/first
import OpenAI from 'openai';
// eslint-disable-next-line import/first
import { AiProviderService } from '../src/ai-agent/ai-provider.service';

function fakeConfig(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((key: string, fallback?: unknown) => (key in values ? values[key] : fallback)) } as unknown as ConfigService;
}

describe('AiProviderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configured', () => {
    it('reports false when OPENAI_API_KEY is not set', () => {
      const service = new AiProviderService(fakeConfig({ 'ai.apiKey': undefined }));
      expect(service.configured()).toBe(false);
    });

    it('reports true when OPENAI_API_KEY is set', () => {
      const service = new AiProviderService(fakeConfig({ 'ai.apiKey': 'sk-test-key-0123456789' }));
      expect(service.configured()).toBe(true);
    });
  });

  describe('missing API key', () => {
    it('fails fast with a safe message and never calls OpenAI', async () => {
      const service = new AiProviderService(fakeConfig({ 'ai.apiKey': undefined }));
      await expect(service.complete([], [])).rejects.toThrow(ServiceUnavailableException);
      expect(responsesCreateMock).not.toHaveBeenCalled();
      expect(OpenAI as unknown as jest.Mock).not.toHaveBeenCalled();
    });
  });

  describe('complete (Responses API mapping)', () => {
    const config = fakeConfig({ 'ai.apiKey': 'sk-test-key-0123456789', 'ai.model': 'gpt-5-mini', 'ai.baseUrl': 'https://api.openai.com/v1', 'ai.timeoutMs': 45_000 });

    it('maps a plain text reply into a ProviderMessage with no tool calls', async () => {
      responsesCreateMock.mockResolvedValue({ error: null, output: [], output_text: 'Salom! Sizga qanday yordam bera olaman?', usage: { input_tokens: 120, output_tokens: 18 }, model: 'gpt-5-mini' });
      const service = new AiProviderService(config);
      const result = await service.complete([{ role: 'user', content: 'salom' }], []);
      expect(result).toEqual({
        message: { role: 'assistant', content: 'Salom! Sizga qanday yordam bera olaman?' },
        usage: { inputTokens: 120, outputTokens: 18 },
        model: 'gpt-5-mini',
      });
    });

    it('forwards real provider deltas and returns the completed response', async () => {
      const completed = { error: null, output: [], output_text: 'Salom', usage: { input_tokens: 2, output_tokens: 1 }, model: 'gpt-5-mini' };
      responsesCreateMock.mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          yield { type: 'response.created' };
          yield { type: 'response.output_text.delta', delta: 'Sa' };
          yield { type: 'response.output_text.delta', delta: 'lom' };
          yield { type: 'response.completed', response: completed };
        },
      });
      const events: unknown[] = [];
      const service = new AiProviderService(config);
      const result = await service.complete([{ role: 'user', content: 'salom' }], [], event => events.push(event));
      expect(events).toEqual([{ type: 'response_started' }, { type: 'text_delta', delta: 'Sa' }, { type: 'text_delta', delta: 'lom' }]);
      expect(result.message.content).toBe('Salom');
      expect(responsesCreateMock.mock.calls[0][0].stream).toBe(true);
    });

    it('maps function_call output items into ProviderToolCall entries', async () => {
      responsesCreateMock.mockResolvedValue({
        error: null,
        output: [{ type: 'function_call', call_id: 'call_abc123', name: 'create_task', arguments: '{"title":"Hisobotni tayyorlash"}' }],
        output_text: '',
        usage: { input_tokens: 200, output_tokens: 40 },
        model: 'gpt-5-mini',
      });
      const service = new AiProviderService(config);
      const result = await service.complete([{ role: 'user', content: 'vazifa qo‘sh' }], [{ type: 'function', function: { name: 'create_task', description: 'Create a task', parameters: { type: 'object', properties: {}, required: [] } } }]);
      expect(result.message).toEqual({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_abc123', type: 'function', function: { name: 'create_task', arguments: '{"title":"Hisobotni tayyorlash"}' } }],
      });
    });

    it('translates ProviderTool into the flat Responses API tool shape', async () => {
      responsesCreateMock.mockResolvedValue({ error: null, output: [], output_text: 'ok', usage: { input_tokens: 1, output_tokens: 1 }, model: 'gpt-5-mini' });
      const service = new AiProviderService(config);
      await service.complete([], [{ type: 'function', function: { name: 'get_tasks', description: 'List tasks', parameters: { type: 'object', properties: {}, required: [] } } }]);
      const call = responsesCreateMock.mock.calls[0][0];
      expect(call.tools).toEqual([{ type: 'function', name: 'get_tasks', description: 'List tasks', parameters: { type: 'object', properties: {}, required: [] }, strict: false }]);
    });

    it('round-trips a prior tool call and its result into function_call / function_call_output input items', async () => {
      responsesCreateMock.mockResolvedValue({ error: null, output: [], output_text: 'Bajarildi.', usage: { input_tokens: 5, output_tokens: 2 }, model: 'gpt-5-mini' });
      const service = new AiProviderService(config);
      await service.complete([
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'vazifa yarat' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'create_task', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: '{"status":"success"}' },
      ], []);
      const call = responsesCreateMock.mock.calls[0][0];
      expect(call.input).toEqual([
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'vazifa yarat' },
        { type: 'function_call', call_id: 'call_1', name: 'create_task', arguments: '{}' },
        { type: 'function_call_output', call_id: 'call_1', output: '{"status":"success"}' },
      ]);
    });

    it('never forwards the API key inside the request payload', async () => {
      responsesCreateMock.mockResolvedValue({ error: null, output: [], output_text: 'ok', usage: { input_tokens: 1, output_tokens: 1 }, model: 'gpt-5-mini' });
      const service = new AiProviderService(config);
      await service.complete([{ role: 'user', content: 'salom' }], []);
      const call = responsesCreateMock.mock.calls[0][0];
      expect(JSON.stringify(call)).not.toContain('sk-test-key');
    });
  });

  describe('error handling', () => {
    const config = fakeConfig({ 'ai.apiKey': 'sk-test-key-0123456789' });

    it('maps an authentication error to a safe message without leaking the key', async () => {
      responsesCreateMock.mockRejectedValue(new OpenAI.AuthenticationError(401, { error: { message: 'Incorrect API key provided: sk-test-key-0123456789' } }, 'Incorrect API key provided: sk-test-key-0123456789', new Headers()));
      const service = new AiProviderService(config);
      await expect(service.complete([], [])).rejects.toMatchObject({ message: 'AI API kaliti noto‘g‘ri.' });
    });

    it('maps a rate-limit error to a safe message', async () => {
      responsesCreateMock.mockRejectedValue(new OpenAI.RateLimitError(429, {}, 'Rate limit reached', new Headers()));
      const service = new AiProviderService(config);
      await expect(service.complete([], [])).rejects.toMatchObject({ message: 'AI limiti vaqtincha tugagan.' });
    });

    it('maps a connection timeout to a safe message', async () => {
      responsesCreateMock.mockRejectedValue(new OpenAI.APIConnectionTimeoutError());
      const service = new AiProviderService(config);
      await expect(service.complete([], [])).rejects.toMatchObject({ message: 'AI javob berish vaqtidan oshdi. Qayta urinib ko‘ring.' });
    });

    it('maps a generic connection error to a safe message', async () => {
      responsesCreateMock.mockRejectedValue(new OpenAI.APIConnectionError({ message: 'ECONNRESET' }));
      const service = new AiProviderService(config);
      await expect(service.complete([], [])).rejects.toMatchObject({ message: 'AI xizmatiga ulanib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' });
    });

    it('maps any other OpenAI API error to a generic safe message', async () => {
      responsesCreateMock.mockRejectedValue(new OpenAI.InternalServerError(500, {}, 'boom', new Headers()));
      const service = new AiProviderService(config);
      await expect(service.complete([], [])).rejects.toMatchObject({ message: 'AI xizmatida vaqtinchalik xatolik.' });
    });

    it('logs the precise 400 invalid-request reason (status/code/type/param/message) without leaking secrets', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      responsesCreateMock.mockRejectedValue(new OpenAI.BadRequestError(400, {
        message: 'Invalid value for \'temperature\': must be between 0 and 2. Key sk-should-not-appear-1234567890 is unrelated.',
        code: 'invalid_value',
        type: 'invalid_request_error',
        param: 'temperature',
      }, 'Invalid value for temperature', new Headers()));
      const service = new AiProviderService(config);
      await expect(service.complete([], [])).rejects.toMatchObject({ message: 'AI xizmatida vaqtinchalik xatolik.' });
      const logged = errorSpy.mock.calls.map((args) => String(args[0])).join('\n');
      expect(logged).toContain('status=400');
      expect(logged).toContain('code=invalid_value');
      expect(logged).toContain('type=invalid_request_error');
      expect(logged).toContain('param=temperature');
      expect(logged).toContain('must be between 0 and 2');
      expect(logged).not.toContain('sk-should-not-appear-1234567890');
      expect(logged).toContain('[REDACTED]');
      errorSpy.mockRestore();
    });

    it('redacts an API-key-shaped substring even if a third-party error message contains one', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      responsesCreateMock.mockRejectedValue(new Error('upstream proxy rejected sk-abcdefghijklmno1234567890'));
      const service = new AiProviderService(config);
      await service.complete([], []).catch(() => undefined);
      const logged = errorSpy.mock.calls.map((args) => String(args[0])).join('\n');
      expect(logged).not.toContain('sk-abcdefghijklmno1234567890');
      expect(logged).toContain('[REDACTED]');
      errorSpy.mockRestore();
    });

    it('never leaks a raw unexpected error message to the caller', async () => {
      responsesCreateMock.mockRejectedValue(new Error('sk-test-key-0123456789 leaked in a stack trace'));
      const service = new AiProviderService(config);
      const error = await service.complete([], []).catch((err: Error) => err);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as Error).message).not.toContain('sk-test-key');
    });

    it('treats a response-level error object as a failure with a safe message', async () => {
      responsesCreateMock.mockResolvedValue({ error: { code: 'server_error', message: 'internal failure' }, output: [], output_text: '', usage: undefined, model: 'gpt-5-mini' });
      const service = new AiProviderService(config);
      await expect(service.complete([], [])).rejects.toMatchObject({ message: 'AI xizmatida vaqtinchalik xatolik.' });
    });
  });
  it('preserves opaque reasoning output between function-call rounds', async () => {
    const output = [{ type: 'reasoning', id: 'r1', summary: [], encrypted_content: 'opaque-test' }, { type: 'function_call', id: 'fc1', call_id: 'c1', name: 'get_tasks', arguments: '{}' }];
    responsesCreateMock.mockResolvedValueOnce({ output, output_text: '', model: 'test' }).mockResolvedValueOnce({ output: [], output_text: 'ok', model: 'test' });
    const service = new AiProviderService(fakeConfig({ 'ai.apiKey': 'test' }));
    const first = await service.complete([{ role: 'user', content: 'tasks' }], []);
    await service.complete([first.message, { role: 'tool', tool_call_id: 'c1', content: '[]' }], []);
    expect(responsesCreateMock.mock.calls[1][0].input).toEqual([...output, { type: 'function_call_output', call_id: 'c1', output: '[]' }]);
    expect(responsesCreateMock.mock.calls[0][0].store).toBe(false);
  });

});
