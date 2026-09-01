import { ConfigService } from '@nestjs/config';
import { AiVoiceService } from '../src/ai-agent/ai-voice.service';

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
    expect(result.mimeType).toBe('audio/mpeg');
    expect(Buffer.from(result.audio, 'base64').toString()).toBe('audio bytes');
    expect(JSON.stringify(result)).not.toContain('test-only-key');
  });
});
