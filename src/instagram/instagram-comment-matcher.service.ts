import { Injectable } from '@nestjs/common';
import { AiProviderService, ProviderTool } from '../ai-agent/ai-provider.service';
import { AiUsageService } from '../usage/usage.service';

@Injectable()
export class InstagramCommentMatcherService {
  constructor(private readonly provider: AiProviderService, private readonly usage: AiUsageService) {}

  async matches(userId: string, comment: string, trigger: string, semanticMatch: boolean, sourceContext?: string | null): Promise<boolean> {
    const quick = quickSemanticMatch(comment, trigger);
    if (quick === true) return true;
    if (!semanticMatch || !comment.trim() || !trigger.trim()) return false;

    const tool: ProviderTool = {
      type: 'function',
      function: {
        name: 'classify_instagram_comment_trigger',
        description: 'Decide whether the Instagram comment expresses the requested trigger intent. Return only the classification.',
        parameters: {
          type: 'object',
          properties: { matches: { type: 'boolean' }, confidence: { type: 'number' } },
          required: ['matches', 'confidence'],
        },
      },
    };
    const prompt = `Classify an Instagram comment for an automation. The trigger can be a word, typo-tolerant keyword, phrase, or semantic intent. A comment should match only when it reasonably expresses the trigger intent; unrelated chatter must not match. Common Uzbek/Russian/English typos and slang are allowed. Post context can disambiguate short comments like “menga ham”, but never match unrelated comments merely because the post mentions the trigger.\n\nTRIGGER INTENT:\n${trigger.slice(0, 1500)}\n\nPOST CONTEXT:\n${(sourceContext || '(none)').slice(0, 1800)}\n\nCOMMENT:\n${comment.slice(0, 1500)}`;
    try {
      const result = await this.provider.complete(
        [{ role: 'system', content: prompt }, { role: 'user', content: comment }],
        [tool], undefined, undefined, 'required',
      );
      void this.usage.logTextUsage({ userId, model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }).catch(() => undefined);
      const call = result.message.tool_calls?.find(item => item.function.name === 'classify_instagram_comment_trigger');
      if (!call) return false;
      const parsed = JSON.parse(call.function.arguments || '{}') as { matches?: unknown; confidence?: unknown };
      return parsed.matches === true && typeof parsed.confidence === 'number' && parsed.confidence >= 0.62;
    } catch {
      return false;
    }
  }
}

function quickSemanticMatch(comment: string, trigger: string): boolean | null {
  const left = normalize(comment);
  const right = normalize(trigger);
  if (!left || !right) return false;
  if (left === right || left.includes(right)) return true;
  const triggerTokens = right.split(' ').filter(token => token.length >= 2 && !STOP.has(token));
  const commentTokens = left.split(' ').filter(token => token.length >= 2 && !STOP.has(token));
  if (!triggerTokens.length) return null;
  const hits = triggerTokens.filter(token => commentTokens.some(candidate => similarity(token, candidate) >= 0.72)).length;
  if (hits === triggerTokens.length) return true;
  if (triggerTokens.length === 1 && hits === 1) return true;
  return null;
}

const STOP = new Set(['deb', 'yozgan', 'yozsa', 'comment', 'kament', 'izoh', 'odam', 'kim', 'hamma', 'menga', 'ham']);
function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[‘’ʻʼ`]/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}
function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}
