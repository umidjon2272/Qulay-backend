import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ProviderToolCall[];
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

@Injectable()
export class AiProviderService {
  constructor(private readonly config: ConfigService) {}

  configured(): boolean { return Boolean(this.config.get<string>('ai.apiKey')); }

  async complete(messages: ProviderMessage[], tools: ProviderTool[]): Promise<ProviderResponse> {
    const apiKey = this.config.get<string>('ai.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('AI hali sozlanmagan. OPENAI_API_KEY ni Render Environment’ga qo‘ying.');
    const model = this.config.get<string>('ai.model', 'gpt-5-mini');
    const baseUrl = this.config.get<string>('ai.baseUrl', 'https://api.openai.com/v1').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get<number>('ai.timeoutMs', 45_000));
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
        signal: controller.signal,
      });
      const payload = await response.json() as {
        error?: { message?: string };
        choices?: Array<{ message?: ProviderMessage }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };
      if (!response.ok || !payload.choices?.[0]?.message) {
        const safeMessage = response.status === 401 ? 'AI API kaliti noto‘g‘ri.' : response.status === 429 ? 'AI limiti vaqtincha tugagan.' : 'AI xizmatida vaqtinchalik xatolik.';
        throw new ServiceUnavailableException(safeMessage);
      }
      return {
        message: payload.choices[0].message,
        usage: { inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 },
        model: payload.model ?? model,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('AI xizmatiga ulanib bo‘lmadi. Keyinroq qayta urinib ko‘ring.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
