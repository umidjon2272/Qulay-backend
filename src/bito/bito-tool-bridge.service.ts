import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { assertToolObject } from '../ai-tools/types/ai-tool.types';
import { BitoIntegrationService } from './bito-integration.service';
import { BitoMcpTool } from './bito-mcp.client';

export type BitoModelTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  sideEffect: 'READ' | 'WRITE';
};

@Injectable()
export class BitoToolBridgeService {
  private readonly cache = new Map<string, { expiresAt: number; tools: BitoMcpTool[] }>();
  private readonly cacheMs = 2 * 60 * 1000;

  constructor(private readonly bito: BitoIntegrationService, private readonly activityLog: ActivityLogService) {}

  isBitoAlias(name: string): boolean {
    return name.startsWith('bito__');
  }

  async listModelTools(userId: string): Promise<BitoModelTool[]> {
    const tools = await this.toolsForUser(userId);
    return tools.map((tool) => {
      const sideEffect = this.sideEffect(tool);
      return {
        name: this.alias(tool.name),
        description: this.description(tool),
        parameters: this.inputSchema(tool),
        requiresConfirmation: sideEffect === 'WRITE',
        sideEffect,
      };
    });
  }

  async execute(userId: string, alias: string, input: unknown, confirmed: boolean, requestId: string) {
    assertToolObject(input);
    const tool = await this.resolve(userId, alias);
    const sideEffect = this.sideEffect(tool);
    if (sideEffect === 'WRITE' && !confirmed) {
      return {
        status: 'confirmation_required' as const,
        tool: alias,
        input,
        preview: { provider: 'Bito ERP', operation: tool.title ?? tool.name, input: redact(input) },
        meta: { requestId },
      };
    }
    const data = sanitize(await this.bito.callToolForUser(userId, tool.name, input));
    if (sideEffect === 'WRITE') {
      void this.activityLog.record({
        userId,
        action: ACTIVITY_ACTIONS.BITO_TOOL_EXECUTED,
        entityType: 'BITO_TOOL',
        metadata: { tool: tool.name, alias, sideEffect },
      }).catch(() => undefined);
    }
    return { status: 'success' as const, tool: alias, data, meta: { executedAt: new Date().toISOString(), requestId } };
  }

  clearUserCache(userId: string): void {
    this.cache.delete(userId);
  }

  private async resolve(userId: string, alias: string): Promise<BitoMcpTool> {
    const tools = await this.toolsForUser(userId, true);
    const found = tools.find((tool) => this.alias(tool.name) === alias);
    if (!found) throw new NotFoundException('Bito MCP tool topilmadi yoki o‘zgargan');
    return found;
  }

  private async toolsForUser(userId: string, refreshIfMissing = false): Promise<BitoMcpTool[]> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.tools;
    try {
      const tools = await this.bito.listToolsForUser(userId);
      this.cache.set(userId, { expiresAt: Date.now() + this.cacheMs, tools });
      return tools;
    } catch (error) {
      if (refreshIfMissing) this.cache.delete(userId);
      throw error;
    }
  }

  private alias(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 38) || 'tool';
    const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
    return `bito__${base}_${hash}`;
  }

  private sideEffect(tool: BitoMcpTool): 'READ' | 'WRITE' {
    if (tool.annotations?.readOnlyHint === true) return 'READ';
    if (tool.annotations?.destructiveHint === true) return 'WRITE';
    const text = `${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`.toLowerCase();
    if (/\b(create|update|delete|remove|send|set|add|change|adjust|transfer|write|insert|post|put|patch|confirm|cancel|refund|payment|pay|archive|move|order_create|create_order)\b/.test(text)) return 'WRITE';
    if (/\b(get|list|search|find|read|query|report|summary|analytics|stock|inventory|warehouse|sales|profit|revenue|product|customer|catalog|balance|expense)\b/.test(text)) return 'READ';
    return 'WRITE';
  }

  private description(tool: BitoMcpTool): string {
    const detail = (tool.description?.trim() || tool.title?.trim() || tool.name).slice(0, 1100);
    return `Bito ERP: ${detail}. Use only real Bito data returned by this tool.`;
  }

  private inputSchema(tool: BitoMcpTool): Record<string, unknown> {
    const schema = tool.inputSchema;
    if (!schema || schema.type !== 'object') return { type: 'object', properties: {}, additionalProperties: true };
    return schema;
  }
}

function redact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => /token|secret|password|authorization|api.?key/i.test(key) ? [key, '[REDACTED]'] : [key, value]));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (typeof value === 'string') return value.length > 12_000 ? `${value.slice(0, 12_000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 120);
    return Object.fromEntries(entries.map(([key, item]) => [key, sanitize(item, depth + 1)]));
  }
  return value;
}
