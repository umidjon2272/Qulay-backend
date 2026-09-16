import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiUsageService } from '../usage/usage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export type SalesImageUnderstanding = {
  summary: string;
  searchQuery: string;
  category?: string;
  brand?: string;
  model?: string;
  color?: string;
  variant?: string;
  confidence: number;
};

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class SalesVisionService {
  constructor(
    private readonly config: ConfigService,
    private readonly usage: AiUsageService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async understandProductImage(
    userId: string,
    input: { buffer: Buffer; mimeType: string; caption?: string | null },
  ): Promise<SalesImageUnderstanding> {
    const mimeType = input.mimeType.split(';')[0].toLocaleLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) throw new BadRequestException('Rasm formati qo‘llab-quvvatlanmaydi. JPG, PNG yoki WEBP yuboring.');
    if (!input.buffer?.length || input.buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('Rasm bo‘sh yoki juda katta.');
    await Promise.all([
      this.subscriptions.assertAiAllowed(userId),
      this.subscriptions.assertFeatureAllowed(userId, 'AI_CHAT'),
    ]);

    const apiKey = this.config.get<string>('ai.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('Rasmni tushunish uchun AI hali sozlanmagan.');
    const model = this.config.get<string>('ai.visionModel') || this.config.get<string>('ai.model', 'gpt-5-mini');
    const client = new OpenAI({
      apiKey,
      baseURL: this.config.get<string>('ai.baseUrl', 'https://api.openai.com/v1'),
      timeout: Math.max(30_000, this.config.get<number>('ai.timeoutMs', 45_000)),
      maxRetries: 1,
    });
    const caption = input.caption?.trim().slice(0, 1200) || '';
    const instruction = `You are the visual understanding layer for a sales agent. Look at the customer's product photo and return ONLY a compact JSON object. Do not invent an exact model/SKU if the image is not clear enough. The next backend step will verify every product against the business catalog or owner-taught product knowledge.\n\nJSON keys: summary, searchQuery, category, brand, model, color, variant, confidence.\n- summary: short Uzbek description of what is visibly in the photo.\n- searchQuery: safest catalog search phrase. Prefer a family/category when exact model is uncertain.\n- brand/model/color/variant: include only if visually supported.\n- confidence: number 0..1.\n- Never infer price, stock, storage capacity, authenticity or hidden attributes from appearance alone.\nCustomer caption: ${caption || '(none)'}`;

    try {
      const response = await client.responses.create({
        model,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: instruction },
            { type: 'input_image', image_url: `data:${mimeType};base64,${input.buffer.toString('base64')}`, detail: 'low' },
          ],
        }],
        store: false,
        ...(/^gpt-5(?:-|$)/.test(model) ? { reasoning: { effort: 'low' as const } } : {}),
      });
      void this.usage.logTextUsage({
        userId,
        model: response.model ?? model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      }).catch(() => undefined);
      const text = response.output_text || response.output.flatMap(item => item.type === 'message'
        ? item.content.flatMap(part => part.type === 'output_text' ? [part.text] : [])
        : []).join('');
      return this.parse(text);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      if (error instanceof OpenAI.RateLimitError) throw new ServiceUnavailableException('Rasmli AI limiti vaqtincha tugagan.');
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new ServiceUnavailableException('Rasmni tushunish biroz kechikdi. Qayta urinib ko‘ring.');
      throw new ServiceUnavailableException('Rasmni hozir tushunib bo‘lmadi.');
    }
  }

  private parse(raw: string): SalesImageUnderstanding {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
    let value: Record<string, unknown> = {};
    try { value = JSON.parse(cleaned) as Record<string, unknown>; }
    catch {
      const match = cleaned.match(/\{[\s\S]*\}/u);
      if (match) {
        try { value = JSON.parse(match[0]) as Record<string, unknown>; } catch { value = {}; }
      }
    }
    const string = (key: string, max: number) => typeof value[key] === 'string' && value[key].trim() ? value[key].trim().slice(0, max) : undefined;
    const summary = string('summary', 700) ?? 'Mijoz mahsulot rasmini yubordi.';
    const searchQuery = string('searchQuery', 240) ?? string('model', 160) ?? string('brand', 120) ?? string('category', 120) ?? summary.slice(0, 180);
    const numericConfidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence) ? value.confidence : 0.5;
    return {
      summary,
      searchQuery,
      ...(string('category', 120) ? { category: string('category', 120) } : {}),
      ...(string('brand', 120) ? { brand: string('brand', 120) } : {}),
      ...(string('model', 160) ? { model: string('model', 160) } : {}),
      ...(string('color', 100) ? { color: string('color', 100) } : {}),
      ...(string('variant', 160) ? { variant: string('variant', 160) } : {}),
      confidence: Math.max(0, Math.min(1, numericConfidence)),
    };
  }
}
