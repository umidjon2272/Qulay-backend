import { Injectable } from '@nestjs/common';
import { FinanceCurrency, SalesKnowledgeAvailability } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SalesKnowledgeMatch = {
  id: string;
  name: string;
  family: string | null;
  aliases: string[];
  description: string | null;
  publicPrice: string | null;
  currency: FinanceCurrency | null;
  availability: SalesKnowledgeAvailability;
  stockQuantity: string | null;
  unit: string | null;
  attributes: unknown;
  note: string | null;
  score: number;
};

@Injectable()
export class SalesProductKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, query: string, limit = 12): Promise<SalesKnowledgeMatch[]> {
    const clean = query.trim();
    if (!clean) return [];
    const rows = await this.prisma.salesProductKnowledge.findMany({
      where: { userId, active: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        id: true, canonicalName: true, productFamily: true, aliases: true, description: true,
        publicPrice: true, currency: true, availability: true, stockQuantity: true, unit: true,
        attributes: true, note: true,
      },
    }).catch(() => []);
    return rows
      .map(row => ({ row, score: knowledgeScore(row.canonicalName, row.productFamily, row.aliases, row.description, clean) }))
      .filter(item => item.score >= 0.56)
      .sort((a, b) => b.score - a.score || a.row.canonicalName.localeCompare(b.row.canonicalName, 'uz'))
      .slice(0, Math.max(1, Math.min(50, limit)))
      .map(({ row, score }) => ({
        id: row.id,
        name: row.canonicalName,
        family: row.productFamily,
        aliases: row.aliases,
        description: row.description,
        publicPrice: row.publicPrice?.toString() ?? null,
        currency: row.currency,
        availability: row.availability,
        stockQuantity: row.stockQuantity?.toString() ?? null,
        unit: row.unit,
        attributes: row.attributes,
        note: row.note,
        score: Math.round(score * 1000) / 1000,
      }));
  }

  async recent(userId: string, limit = 100) {
    return this.prisma.salesProductKnowledge.findMany({
      where: { userId, active: true },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
      select: {
        id: true, canonicalName: true, productFamily: true, aliases: true, description: true,
        publicPrice: true, currency: true, availability: true, stockQuantity: true, unit: true,
        attributes: true, note: true, active: true, updatedAt: true,
      },
    });
  }
}

export function salesProductKnowledgePrompt(matches: SalesKnowledgeMatch[]): string {
  if (!matches.length) return 'OWNER-TAUGHT PRODUCT KNOWLEDGE: no matching saved product fact.';
  const safe = matches.slice(0, 16).map(item => ({
    name: item.name,
    family: item.family,
    aliases: item.aliases.slice(0, 12),
    description: item.description?.slice(0, 700) ?? null,
    publicPrice: item.publicPrice,
    currency: item.currency,
    availability: item.availability,
    stockQuantity: item.stockQuantity,
    unit: item.unit,
    attributes: item.attributes,
    note: item.note?.slice(0, 700) ?? null,
    score: item.score,
  }));
  return `OWNER-TAUGHT PRODUCT KNOWLEDGE (customer-facing facts explicitly saved by the business owner): ${JSON.stringify(safe).slice(0, 18000)}\nRULES: These facts may describe products that are not in Bito. If live Bito returns a confident match for the SAME product/variant, live Bito price/stock/availability wins. Bito NOT_FOUND alone does not invalidate an owner-taught off-Bito product. Never invent a field that is absent from both sources.`;
}

function normalize(value: string): string {
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

function knowledgeScore(name: string, family: string | null, aliases: string[], description: string | null, query: string): number {
  const needle = normalize(query);
  if (!needle) return 0;
  const candidates = [name, family ?? '', ...aliases, description?.slice(0, 300) ?? ''].map(normalize).filter(Boolean);
  let best = 0;
  for (const haystack of candidates) {
    if (haystack === needle) best = Math.max(best, 1);
    if (haystack.includes(needle) || needle.includes(haystack)) best = Math.max(best, Math.min(0.98, 0.82 + Math.min(haystack.length, needle.length) / Math.max(haystack.length, needle.length) * 0.16));
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

function tokenSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  if (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left))) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
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
