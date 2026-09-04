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
    const [, user] = await Promise.all([
      this.subscriptions.assertVoiceAllowed(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } }),
    ]);
    const model = this.config.get<string>('ai.transcribeModel', 'gpt-4o-mini-transcribe');
    try {
      const result = await this.client().audio.transcriptions.create({
        model, file: await toFile(file.buffer, `voice.${ext}`, { type: mime }), response_format: 'json',
        prompt: user?.language === 'ru' ? 'Русская речь. Запишите только услышанные слова, сохраните имена, числа и валюты.' : 'O‘zbekcha nutq. Faqat eshitilgan gapni yozing; ismlar, summalar, so‘m, ming, million va sanalarni saqlang. Jimlikda hech narsa qo‘shmang.',
      });
      void this.usage.logVoiceUsage({ userId, model, audioSeconds: Math.ceil(durationSeconds) }).catch(() => undefined);
      return { text: result.text.trim() };
    } catch (error) { throw this.safeError(error); }
  }

  async speak(userId: string, text: string, requestedVoice?: 'marin' | 'cedar') {
    const [, user] = await Promise.all([
      this.subscriptions.assertVoiceAllowed(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } }),
    ]);
    const russian = user?.language === 'ru';
    const model = this.config.get<string>('ai.ttsModel', 'gpt-4o-mini-tts');
    try {
      const response = await this.client().audio.speech.create({
        model, voice: requestedVoice ?? this.config.get<string>('ai.ttsVoice', 'coral'), input: russian ? text : prepareUzbekSpeech(text),
        response_format: 'wav',
        ...(!model.startsWith('tts-1') ? { instructions: russian
          ? 'Говорите по-русски естественно, быстро и разговорно. Темп должен быть примерно на 35–40 процентов быстрее обычной спокойной речи. Начинайте сразу. Не растягивайте гласные и окончания, не превращайте «привет» в протяжное слово. Между фразами делайте только очень короткие естественные паузы; не оставляйте секундных пауз после точек и запятых. Не используйте медленный дикторский тон. Сохраняйте имена, даты и суммы без изменений.'
          : 'O‘zbekcha matnni tabiiy, tez va ravon suhbat ohangida ayting. Odatdagi sokin suhbatdan taxminan 35–40 foiz tezroq gapiring. Darhol boshlang. So‘z va unlilarni hech qachon cho‘zmang: masalan, «salom»ni «salooom» demang. Gaplar, nuqta va vergullar orasida faqat juda qisqa tabiiy pauza qiling; bir soniyalik yoki undan uzun tanaffus qilmang. Sekin diktor ohangida gapirmang. Ismlar, sanalar va moliyaviy qiymatlarni o‘zgartirmang. UZS ni so‘m deb ayting.' } : {}),
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      void this.usage.logVoiceUsage({ userId, model, audioSeconds: Math.max(1, Math.ceil(text.length / 14)) }).catch(() => undefined);
      return { audio: buffer.toString('base64'), mimeType: 'audio/wav' };
    } catch (error) { throw this.safeError(error); }
  }

  async createRealtimeSession(userId: string) {
    const model = this.config.get<string>('ai.realtimeModel');
    if (!model) return { enabled: false as const };
    const apiKey = this.config.get<string>('ai.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('Ovozli AI hali sozlanmagan.');
    const [, user] = await Promise.all([
      this.subscriptions.assertVoiceAllowed(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } }),
    ]);
    const response = await fetch(`${this.config.get<string>('ai.baseUrl', 'https://api.openai.com/v1')}/realtime/client_secrets`, {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Safety-Identifier': createHash('sha256').update(userId).digest('hex') },
      body: JSON.stringify({ session: {
        type: 'realtime', model,
        instructions: 'Transcribe the user accurately. Do not answer or execute actions; Qulay AI server agent handles every response and tool.',
        audio: {
          input: {
            transcription: {
              model: this.config.get<string>('ai.transcribeModel', 'gpt-4o-mini-transcribe'),
              language: user?.language === 'ru' ? 'ru' : 'uz',
              prompt: user?.language === 'ru'
                ? 'Русская разговорная речь. Точно сохраняйте имена, числа, даты, валюты и команды.'
                : 'O‘zbekcha kundalik suhbat. Sheva va tez aytilgan gapni tabiiy matnga yozing; ism, sana, summa, so‘m, ming, million va buyruqlarni aniq saqlang.',
            },
            // Fast command mode: commit the turn shortly after the user stops talking.
            turn_detection: { type: 'server_vad', threshold: 0.40, prefix_padding_ms: 180, silence_duration_ms: 240, create_response: false, interrupt_response: true },
          },
          output: { voice: this.config.get<string>('ai.realtimeVoice', 'marin') },
        },
      } }),
    }).catch(() => { throw new ServiceUnavailableException('Realtime ovoz xizmatiga ulanib bo‘lmadi.'); });
    if (!response.ok) throw new ServiceUnavailableException('Realtime ovoz sessiyasi ochilmadi.');
    const data = await response.json().catch(() => { throw new ServiceUnavailableException('Realtime sessiya javobi olinmadi.'); }) as { value?: string; expires_at?: number };
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
