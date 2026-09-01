import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { AiUsageService } from '../usage/usage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

export type VoiceUpload = { buffer: Buffer; size: number; mimetype: string };

@Injectable()
export class AiVoiceService {
  constructor(private readonly config: ConfigService, private readonly usage: AiUsageService, private readonly subscriptions: SubscriptionsService, private readonly prisma: PrismaService) {}

  private client() {
    const apiKey = this.config.get<string>('ai.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('Ovozli AI hali sozlanmagan.');
    return new OpenAI({ apiKey, baseURL: this.config.get<string>('ai.baseUrl'), timeout: 60_000, maxRetries: 0 });
  }

  async transcribe(userId: string, file: VoiceUpload | undefined, durationSeconds: number) {
    if (!file?.buffer?.length || file.size > 6 * 1024 * 1024) throw new BadRequestException('Ovoz fayli bo‘sh yoki juda katta.');
    const extensions: Record<string, string> = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' };
    const mime = file.mimetype.split(';')[0];
    const ext = extensions[mime];
    if (!ext) throw new BadRequestException('Ovoz formati qo‘llab-quvvatlanmaydi.');
    await this.subscriptions.assertVoiceAllowed(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
    const model = this.config.get<string>('ai.transcribeModel', 'gpt-4o-mini-transcribe');
    try {
      const result = await this.client().audio.transcriptions.create({
        model, file: await toFile(file.buffer, `voice.${ext}`, { type: mime }), response_format: 'json',
        prompt: user?.language === 'ru' ? 'Русская речь. Запишите только услышанные слова, сохраните имена, числа и валюты.' : 'O‘zbekcha nutq. Faqat eshitilgan gapni yozing; ismlar, summalar, so‘m, ming, million va sanalarni saqlang. Jimlikda hech narsa qo‘shmang.',
      });
      await this.usage.logVoiceUsage({ userId, model, audioSeconds: Math.ceil(durationSeconds) });
      return { text: result.text.trim() };
    } catch (error) { throw this.safeError(error); }
  }

  async speak(userId: string, text: string) {
    await this.subscriptions.assertVoiceAllowed(userId);
    const model = this.config.get<string>('ai.ttsModel', 'gpt-4o-mini-tts');
    try {
      const response = await this.client().audio.speech.create({
        model, voice: this.config.get<string>('ai.ttsVoice', 'coral'), input: text,
        response_format: 'mp3',
        ...(!model.startsWith('tts-1') ? { instructions: 'Speak naturally and clearly in the language of the text. Preserve names and numbers. Use a calm conversational pace.' } : {}),
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      await this.usage.logVoiceUsage({ userId, model, audioSeconds: Math.max(1, Math.ceil(text.length / 14)) });
      return { audio: buffer.toString('base64'), mimeType: 'audio/mpeg' };
    } catch (error) { throw this.safeError(error); }
  }

  private safeError(error: unknown) {
    if (error instanceof ServiceUnavailableException) return error;
    if (error instanceof OpenAI.RateLimitError) return new ServiceUnavailableException('Ovozli AI limiti vaqtincha tugadi.');
    return new ServiceUnavailableException('Ovozli xizmatga ulanib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.');
  }
}
