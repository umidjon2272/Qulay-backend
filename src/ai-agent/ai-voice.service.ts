import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { createHash } from 'node:crypto';
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

  async speak(userId: string, text: string, requestedVoice?: 'marin' | 'cedar') {
    await this.subscriptions.assertVoiceAllowed(userId);
    const model = this.config.get<string>('ai.ttsModel', 'gpt-4o-mini-tts');
    try {
      const response = await this.client().audio.speech.create({
        model, voice: requestedVoice ?? this.config.get<string>('ai.ttsVoice', 'coral'), input: prepareUzbekSpeech(text),
        response_format: 'wav',
        ...(!model.startsWith('tts-1') ? { instructions: 'O‘zbekcha matnni muloyim, tiniq va tabiiy suhbat ohangida, normal tezlikda ayting. Ismlar, sanalar va asl moliyaviy qiymatlarni o‘zgartirmang. Qisqartmalarni ma’nosiga mos o‘qing; UZS ni so‘m deb ayting. Sun’iy diktor ohangidan va keraksiz cho‘zishdan saqlaning.' } : {}),
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      await this.usage.logVoiceUsage({ userId, model, audioSeconds: Math.max(1, Math.ceil(text.length / 14)) });
      return { audio: buffer.toString('base64'), mimeType: 'audio/wav' };
    } catch (error) { throw this.safeError(error); }
  }

  async createRealtimeSession(userId: string) {
    await this.subscriptions.assertVoiceAllowed(userId);
    const model = this.config.get<string>('ai.realtimeModel');
    if (!model) return { enabled: false as const };
    const apiKey = this.config.get<string>('ai.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('Ovozli AI hali sozlanmagan.');
    const response = await fetch(`${this.config.get<string>('ai.baseUrl', 'https://api.openai.com/v1')}/realtime/client_secrets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Safety-Identifier': createHash('sha256').update(userId).digest('hex') },
      body: JSON.stringify({ session: {
        type: 'realtime', model,
        instructions: 'Transcribe the user accurately. Do not answer or execute actions; Qulay AI server agent handles every response and tool.',
        audio: {
          input: {
            transcription: { model: this.config.get<string>('ai.transcribeModel', 'gpt-4o-mini-transcribe'), language: 'uz' },
            turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: false, interrupt_response: true },
          },
          output: { voice: this.config.get<string>('ai.realtimeVoice', 'marin') },
        },
      } }),
    });
    if (!response.ok) throw new ServiceUnavailableException('Realtime ovoz sessiyasi ochilmadi.');
    const data = await response.json() as { value?: string; expires_at?: number };
    if (!data.value) throw new ServiceUnavailableException('Realtime sessiya kaliti olinmadi.');
    return { enabled: true as const, clientSecret: data.value, expiresAt: data.expires_at, model, voice: this.config.get<string>('ai.realtimeVoice', 'marin') };
  }

  private safeError(error: unknown) {
    if (error instanceof ServiceUnavailableException) return error;
    if (error instanceof OpenAI.RateLimitError) return new ServiceUnavailableException('Ovozli AI limiti vaqtincha tugadi.');
    return new ServiceUnavailableException('Ovozli xizmatga ulanib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.');
  }
}

const UZBEK_SMALL = ['nol', 'bir', 'ikki', 'uch', 'to‘rt', 'besh', 'olti', 'yetti', 'sakkiz', 'to‘qqiz'];
function uzbekInteger(value: number): string {
  if (value < 10) return UZBEK_SMALL[value];
  if (value < 20) return value === 10 ? 'o‘n' : `o‘n ${UZBEK_SMALL[value - 10]}`;
  if (value < 100) return `${['', '', 'yigirma', 'o‘ttiz', 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', 'to‘qson'][Math.floor(value / 10)]}${value % 10 ? ` ${UZBEK_SMALL[value % 10]}` : ''}`;
  if (value < 1000) return `${UZBEK_SMALL[Math.floor(value / 100)]} yuz${value % 100 ? ` ${uzbekInteger(value % 100)}` : ''}`;
  if (value < 1_000_000) return `${uzbekInteger(Math.floor(value / 1000))} ming${value % 1000 ? ` ${uzbekInteger(value % 1000)}` : ''}`;
  if (value < 1_000_000_000) return `${uzbekInteger(Math.floor(value / 1_000_000))} million${value % 1_000_000 ? ` ${uzbekInteger(value % 1_000_000)}` : ''}`;
  return String(value);
}
export function prepareUzbekSpeech(text: string): string {
  const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (original, year: string, month: string, day: string) => {
    const monthName = months[Number(month) - 1];
    const dayValue = Number(day);
    if (!monthName || dayValue < 1 || dayValue > 31) return original;
    return `${uzbekInteger(Number(year))}-yil ${uzbekInteger(dayValue)}-${monthName}`;
  }).replace(/\b(\d{1,3}(?:[ ,.]\d{3})*|\d+)\s*(UZS|so['‘’]?m)\b/gi, (_match, raw: string) => {
    const amount = Number(raw.replace(/[ ,.]/g, ''));
    return Number.isSafeInteger(amount) && amount >= 0 && amount < 1_000_000_000 ? `${uzbekInteger(amount)} so‘m` : `${raw} so‘m`;
  });
}
