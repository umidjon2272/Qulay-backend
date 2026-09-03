import { ConfigService } from '@nestjs/config';
import { AiVoiceService, prepareUzbekSpeech } from '../src/ai-agent/ai-voice.service';

const transcribe = jest.fn();
const speak = jest.fn();
jest.mock('openai', () => {
  const actual = jest.requireActual('openai');
  const Client = jest.fn().mockImplementation(() => ({ audio: { transcriptions: { create: transcribe }, speech: { create: speak } } }));
  Object.assign(Client, actual.default);
  return { ...actual, __esModule: true, default: Client };
});

describe('Voice service', () => {
  const usage = { logVoiceUsage: jest.fn().mockResolvedValue({}) };
  const subscriptions = { assertVoiceAllowed: jest.fn() };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ language: 'uz' }) } };
  let service: AiVoiceService;
  beforeEach(() => { jest.clearAllMocks(); service = new AiVoiceService(new ConfigService({ ai: { apiKey: 'test-only-key' } }), usage as any, subscriptions as any, prisma as any); });
  it('transcribes within the authenticated account, preserves the transcript, and meters audio', async () => {
    transcribe.mockResolvedValue({ text: '  bugunga besh yuz ming daromad qo‘sh  ' });
    const result = await service.transcribe('owner-a', { buffer: Buffer.from('test recording'), size: 14, mimetype: 'audio/webm;codecs=opus' }, 3.2);
    expect(result.text).toBe('bugunga besh yuz ming daromad qo‘sh');
    expect(subscriptions.assertVoiceAllowed).toHaveBeenCalledWith('owner-a');
    expect(usage.logVoiceUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-a', audioSeconds: 4 }));
  });
  it('rejects empty and non-audio files before calling the provider', async () => {
    await expect(service.transcribe('a', undefined, 1)).rejects.toThrow();
    await expect(service.transcribe('a', { buffer: Buffer.from('html'), size: 4, mimetype: 'text/html' }, 1)).rejects.toThrow();
    expect(transcribe).not.toHaveBeenCalled();
  });
  it('returns real provider audio without an API key in the browser response', async () => {
    speak.mockResolvedValue({ arrayBuffer: async () => Buffer.from('audio bytes') });
    const result = await service.speak('owner-a', 'Amal bajarildi.');
    expect(result.mimeType).toBe('audio/wav');
    expect(Buffer.from(result.audio, 'base64').toString()).toBe('audio bytes');
    expect(JSON.stringify(result)).not.toContain('test-only-key');
  });
  it('prepares Uzbek currency for speech without changing the stored value', () => {
    const original = '2026-09-02 kuni 500 000 UZS daromad';
    expect(prepareUzbekSpeech(original)).toBe('ikki ming yigirma olti-yil ikki-sentabr kuni besh yuz ming so‘m daromad');
    expect(original).toContain('500 000 UZS');
  });
  it('keeps Russian speech in Russian without Uzbek numeral rewriting', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ language: 'ru' });
    speak.mockResolvedValue({ arrayBuffer: async () => Buffer.from('audio') });
    await service.speak('owner-a', 'Доход 500000 UZS');
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ input: 'Доход 500000 UZS', instructions: expect.stringContaining('по-русски') }));
  });
  it('creates an authenticated, bounded VAD session without enabling automatic actions', async () => {
    service = new AiVoiceService(new ConfigService({ ai: { apiKey: 'test-only-key', realtimeModel: 'configured-model' } }), usage as any, subscriptions as any, prisma as any);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ value: 'ephemeral-only', expires_at: 999 }) } as any);
    try {
      const result = await service.createRealtimeSession('owner-a');
      const options = fetchMock.mock.calls[0][1]!;
      const body = JSON.parse(options.body as string);
      expect(body.session.audio.input.turn_detection).toEqual({ type: 'semantic_vad', eagerness: 'high', create_response: false, interrupt_response: true });
      expect(options.signal).toBeDefined();
      expect(result).toMatchObject({ clientSecret: 'ephemeral-only', enabled: true });
      expect(JSON.stringify(result)).not.toContain('test-only-key');
    } finally { fetchMock.mockRestore(); }
  });
});
