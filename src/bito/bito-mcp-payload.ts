const MAX_TEXT_LENGTH = 2_000_000;
const SECRET_KEY = /token|secret|password|authorization|api.?key/i;

/** Fallback is data, never executable code or diagnostic log content. */
export function sanitizeMcpText(text: string): string {
  return text.slice(0, MAX_TEXT_LENGTH)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\bBearer\s+[^\s"'`,;]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:[\w-]*(?:token|secret|password|authorization|api[_-]?key)[\w-]*)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi, '$1[REDACTED]');
}

function jsonDocuments(text: string): unknown[] {
  if (text.length > MAX_TEXT_LENGTH) return [];
  // Scan balanced JSON objects/arrays, including fences and surrounding prose.
  // Strings and escapes are tracked so braces inside values are harmless.
  const documents: unknown[] = [];
  let start = -1, quoted = false, escaped = false;
  let stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0) {
      if (char === '{' || char === '[') { start = i; stack = [char]; }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) { start = -1; stack = []; continue; }
      if (!stack.length) {
        try { documents.push(JSON.parse(text.slice(start, i + 1)) as unknown); } catch { /* Plain text remains fallback. */ }
        start = -1;
      }
    }
  }
  return documents;
}

/** Multiple text items stay separate from row arrays and retain paging metadata. */
export function unwrapBitoMcpResult(value: unknown, depth = 0): unknown {
  if (depth > 20) return '[truncated]';
  if (typeof value === 'string') {
    const documents = jsonDocuments(value);
    return documents.length ? combine(documents.map(item => unwrapBitoMcpResult(item, depth + 1)), []) : sanitizeMcpText(value);
  }
  if (Array.isArray(value)) return value.map(item => sanitizeData(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.structuredContent !== undefined && record.structuredContent !== null) return unwrapBitoMcpResult(record.structuredContent, depth + 1);
  if (Array.isArray(record.content)) {
    const payloads: unknown[] = [], rawText: string[] = [];
    for (const entry of record.content) {
      if (!entry || typeof entry !== 'object' || entry.type !== 'text' || typeof entry.text !== 'string') continue;
      const documents = jsonDocuments(entry.text);
      payloads.push(...documents.map(item => unwrapBitoMcpResult(item, depth + 1)));
      // Retain sanitized prose/malformed text without treating it as a row.
      if (!documents.length) rawText.push(sanitizeMcpText(entry.text));
    }
    return combine(payloads, rawText);
  }
  return sanitizeData(record, depth);
}

function combine(payloads: unknown[], rawText: string[]): unknown {
  if (payloads.length === 1 && !rawText.length) return payloads[0];
  return { mcpPayloads: payloads, ...(rawText.length ? { rawText } : {}) };
}

function sanitizeData(value: unknown, depth: number): unknown {
  if (depth > 20) return '[truncated]';
  if (typeof value === 'string') return sanitizeMcpText(value);
  if (Array.isArray(value)) return value.map(item => sanitizeData(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeData(item, depth + 1)]));
  return value;
}
