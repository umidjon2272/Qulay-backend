const INTENT_STOPWORDS = new Set([
  'bormi', 'bor', 'mavjud', 'narx', 'narxi', 'qancha', 'nech', 'pul', 'kerak', 'kere', 'olaman', 'bering',
  'price', 'stock', 'available', 'availability', 'order', 'buy', 'есть', 'цена', 'сколько', 'наличии', 'товар',
]);

export function normalizeKnowledgeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[‘’ʻʼ`]/g, "'")
    .replace(/\b(?:a+y+fon|ayfon|aifon|aiphon|iphon)\b/giu, 'iphone')
    .replace(/\b(?:por|proo)\b/giu, 'pro')
    .replace(/\bkoka\b/giu, 'coca')
    .replace(/\bkola\b/giu, 'cola')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function knowledgeDiscoveryScore(
  name: string,
  family: string | null,
  aliases: string[],
  description: string | null,
  attributes: unknown,
  query: string,
): number {
  const needle = normalizeKnowledgeText(query);
  if (!needle) return 0;
  const candidates = [
    name,
    family ?? '',
    ...aliases,
    description?.slice(0, 300) ?? '',
    attributesText(attributes),
  ].map(normalizeKnowledgeText).filter(Boolean);
  let best = 0;
  for (const haystack of candidates) {
    if (haystack === needle) best = Math.max(best, 1);
    if (haystack.includes(needle) || needle.includes(haystack)) {
      best = Math.max(best, Math.min(0.98, 0.82 + Math.min(haystack.length, needle.length) / Math.max(haystack.length, needle.length) * 0.16));
    }
    const needleTokens = [...new Set(needle.split(' ').filter(Boolean))];
    const hayTokens = haystack.split(' ').filter(Boolean);
    if (needleTokens.length) {
      const scores = needleTokens.map(token => Math.max(0, ...hayTokens.map(candidate => tokenSimilarity(token, candidate))));
      const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      const weakest = Math.min(...scores);
      if (weakest >= 0.6) best = Math.max(best, average * 0.92);
      const exactHits = needleTokens.filter(token => hayTokens.includes(token)).length;
      if (exactHits) best = Math.max(best, 0.55 + 0.4 * exactHits / needleTokens.length);
    }
  }
  return best;
}

/**
 * Decides whether an owner-taught row is precise enough to overrule Bito
 * NOT_FOUND for the current selection. Family-only similarity is deliberately
 * insufficient: "iPhone 13 Pro" must never authorize "iPhone 16 Pro".
 */
export function authoritativeKnowledgeMatch(
  name: string,
  family: string | null,
  aliases: string[],
  attributes: unknown,
  query: string,
): boolean {
  const needle = normalizeKnowledgeText(query);
  if (!needle) return false;
  const familyTokens = new Set(normalizeKnowledgeText(family ?? '').split(' ').filter(Boolean));
  const queryTokens = needle.split(' ').filter(token => token && !INTENT_STOPWORDS.has(token));
  const specificTokens = queryTokens.filter(token => !familyTokens.has(token));
  const candidates = [name, ...aliases, attributesText(attributes)].map(normalizeKnowledgeText).filter(Boolean);

  // Exact saved name/alias remains authoritative even when it is a family-level
  // product intentionally sold outside Bito.
  if (candidates.some(candidate => candidate === needle)) return true;

  // A family-only query must not promote one concrete saved variant to truth
  // for the entire family.
  if (!specificTokens.length) return false;

  for (const candidate of candidates) {
    const tokens = candidate.split(' ').filter(Boolean);
    if (specificTokens.every(token => tokenSatisfied(token, tokens))) return true;
  }
  return false;
}

function tokenSatisfied(token: string, candidates: string[]): boolean {
  // Numeric/model/storage tokens are identity-bearing and require exact token
  // equality; fuzzy 16↔13 or 128↔256 would be a factual product substitution.
  if (/\d/u.test(token)) return candidates.includes(token);
  return candidates.some(candidate => tokenSimilarity(token, candidate) >= 0.84);
}

function attributesText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const pieces: string[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 3 || node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number') {
      pieces.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 20)) visit(item, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, item] of Object.entries(node as Record<string, unknown>).slice(0, 40)) {
        pieces.push(key);
        visit(item, depth + 1);
      }
    }
  };
  visit(value, 0);
  return pieces.join(' ');
}

function tokenSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  if (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left))) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string): number {
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = prev[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return prev[right.length];
}
