import { Injectable } from '@nestjs/common';
import { FinanceCurrency, SalesKnowledgeAvailability } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { authoritativeKnowledgeMatch, knowledgeDiscoveryScore } from './sales-product-knowledge-match';

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
  authoritative: boolean;
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
      .map(row => ({
        row,
        score: knowledgeDiscoveryScore(row.canonicalName, row.productFamily, row.aliases, row.description, row.attributes, clean),
        authoritative: authoritativeKnowledgeMatch(row.canonicalName, row.productFamily, row.aliases, row.attributes, clean),
      }))
      .filter(item => item.score >= 0.56)
      .sort((a, b) => b.score - a.score || a.row.canonicalName.localeCompare(b.row.canonicalName, 'uz'))
      .slice(0, Math.max(1, Math.min(50, limit)))
      .map(({ row, score, authoritative }) => ({
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
        authoritative,
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
    authoritative: item.authoritative,
  }));
  return `OWNER-TAUGHT PRODUCT KNOWLEDGE (customer-facing facts explicitly saved by the business owner): ${JSON.stringify(safe).slice(0, 18000)}\nRULES: These facts may describe products that are not in Bito. If live Bito returns a confident match for the SAME product/variant, live Bito price/stock/availability wins. Bito NOT_FOUND alone does not invalidate an owner-taught off-Bito product. Never invent a field that is absent from both sources.`;
}
