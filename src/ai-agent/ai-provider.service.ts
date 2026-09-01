import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  Response as OpenAIResponse,
  ResponseFunctionToolCall,
  ResponseInputItem,
  Tool as OpenAIResponseTool,
} from 'openai/resources/responses/responses';

export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ProviderToolCall[];
  responseItems?: ResponseInputItem[];
};

export type ProviderToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ProviderTool = {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
};

export type ProviderResponse = {
  message: ProviderMessage;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

/**
 * Thin seam over the OpenAI Responses API. Keeps the Chat-Completions-shaped
 * ProviderMessage/ProviderTool/ProviderResponse contract so AiAgentService's
 * rolling transcript and tool-call bookkeeping don't need to know which
 * OpenAI API generates them.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('ai.apiKey'));
  }

  async complete(messages: ProviderMessage[], tools: ProviderTool[]): Promise<ProviderResponse> {
    const apiKey = this.config.get<string>('ai.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('AI hali sozlanmagan. OPENAI_API_KEY ni Render Environment’ga qo‘ying.');
    const model = this.config.get<string>('ai.model', 'gpt-5-mini');
    const baseURL = this.config.get<string>('ai.baseUrl', 'https://api.openai.com/v1');
    const timeout = this.config.get<number>('ai.timeoutMs', 45_000);
    const client = new OpenAI({ apiKey, baseURL, timeout, maxRetries: 2 });

    try {
      const response = await client.responses.create({
        model,
        input: toResponseInput(messages),
        tools: tools.map(toResponseTool),
        tool_choice: 'auto',
        store: false,
        include: ['reasoning.encrypted_content'],
      });
      if (response.error) {
        this.logger.error(`OpenAI Responses API returned an error: ${response.error.code} ${response.error.message}`);
        throw new ServiceUnavailableException('AI xizmatida vaqtinchalik xatolik.');
      }
      return {
        message: toProviderMessage(response),
        usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 },
        model: response.model ?? model,
      };
    } catch (error) {
      throw this.toSafeError(error);
    }
  }

  private toSafeError(error: unknown): ServiceUnavailableException {
    if (error instanceof ServiceUnavailableException) return error;
    if (error instanceof OpenAI.AuthenticationError) {
      this.logger.error('OpenAI authentication failed: the configured API key was rejected');
      return new ServiceUnavailableException('AI API kaliti noto‘g‘ri.');
    }
    if (error instanceof OpenAI.RateLimitError) {
      return new ServiceUnavailableException('AI limiti vaqtincha tugagan.');
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return new ServiceUnavailableException('AI javob berish vaqtidan oshdi. Qayta urinib ko‘ring.');
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return new ServiceUnavailableException('AI xizmatiga ulanib bo‘lmadi. Keyinroq qayta urinib ko‘ring.');
    }
    if (error instanceof OpenAI.APIError) {
      this.logger.error(
        `OpenAI API error status=${error.status ?? 'unknown'} name=${error.name} code=${error.code ?? 'null'} `
        + `type=${error.type ?? 'null'} param=${error.param ?? 'null'} message=${redactSecrets(error.message ?? '')}`,
      );
      return new ServiceUnavailableException('AI xizmatida vaqtinchalik xatolik.');
    }
    this.logger.error(`Unexpected AI provider error: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
    return new ServiceUnavailableException('AI xizmatiga ulanib bo‘lmadi. Keyinroq qayta urinib ko‘ring.');
  }
}

/** Defense in depth: never let a raw API key reach the logs, even via an unexpected third-party error message. */
function redactSecrets(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
}

function toResponseInput(messages: ProviderMessage[]): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  for (const message of messages) {
    if (message.responseItems?.length) { items.push(...message.responseItems); continue; }
    if (message.role === 'tool') {
      items.push({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content ?? '' });
      continue;
    }
    if (message.tool_calls?.length) {
      for (const call of message.tool_calls) {
        items.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
      }
      continue;
    }
    items.push({ role: message.role, content: message.content ?? '' });
  }
  return items;
}

function toResponseTool(tool: ProviderTool): OpenAIResponseTool {
  return {
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters as Record<string, unknown>,
    strict: false,
  };
}

function toProviderMessage(response: OpenAIResponse): ProviderMessage {
  const functionCalls = response.output.filter((item): item is ResponseFunctionToolCall => item.type === 'function_call');
  if (functionCalls.length > 0) {
    return {
      role: 'assistant',
      content: null,
      ...(response.output.some(item => item.type === 'reasoning') ? { responseItems: response.output as ResponseInputItem[] } : {}),
      tool_calls: functionCalls.map((call) => ({ id: call.call_id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
    };
  }
  return { role: 'assistant', content: response.output_text || null };
}
