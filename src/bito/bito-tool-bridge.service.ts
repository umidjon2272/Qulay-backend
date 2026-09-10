import { Injectable, NotFoundException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { assertToolObject } from '../ai-tools/types/ai-tool.types';
import { BitoIntegrationService } from './bito-integration.service';
import { BitoMcpTool } from './bito-mcp.client';
import { bitoToolSideEffect } from './bito-tool-policy';
import { unwrapBitoMcpResult } from './bito-mcp-payload';
import { selectVerifiedInventoryTools } from './bito-inventory-tools';
import { selectRelevantBitoTools } from './bito-tool-selector';
import { bitoResponseShape, bitoSafeToolName } from './bito-shape-debug';

export type BitoModelTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  sideEffect: 'READ' | 'WRITE';
};

type InventoryItem = {
  name: string;
  quantity: number;
  unit?: string;
  warehouse?: string;
  cost?: number;
  price?: number;
};

export const BITO_INVENTORY_TOOL_NAME = 'bito__inventory_snapshot';
const MAX_AUTO_PAGES = 200;
const MAX_AUTO_RECORDS = 20_000;
const TOOL_SCHEMA_CACHE_TTL_MS = 45_000;
const MAX_TOOL_SCHEMA_CACHE_USERS = 500;

@Injectable()
export class BitoToolBridgeService {
  private readonly logger = new Logger(BitoToolBridgeService.name);
  private readonly toolSchemaCache = new Map<string, { expiresAt: number; tools: BitoMcpTool[] }>();
  private readonly toolSchemaLoads = new Map<string, Promise<BitoMcpTool[]>>();

  constructor(private readonly bito: BitoIntegrationService, private readonly activityLog: ActivityLogService, private readonly config: ConfigService) {}

  private diagnostic(event: string, fields: Record<string, unknown>) {
    if (this.config.get<boolean>('bito.debugShapes', false)) this.logger.log(JSON.stringify({ event, ...fields }));
  }

  isBitoAlias(name: string): boolean {
    return name.startsWith('bito__');
  }

  async listModelTools(userId: string): Promise<BitoModelTool[]> {
    const tools = await this.toolsForUser(userId);
    return this.toModelTools(tools, true);
  }

  /**
   * Query-scoped MCP shortlist. Bito can expose hundreds of tools; sending the
   * whole registry to the model hurts latency and tool accuracy. This keeps
   * every Bito domain reachable while exposing only the live tools relevant to
   * the current user request.
   */
  async listRelevantModelTools(userId: string, query: string, options: { inventory?: boolean; limit?: number } = {}): Promise<BitoModelTool[]> {
    const tools = await this.toolsForUser(userId);
    if (options.inventory) {
      const verified = selectVerifiedInventoryTools(tools);
      if (!verified) throw new NotFoundException('BITO_INVENTORY_TOOLS_UNAVAILABLE');
      return [this.inventoryModelTool()];
    }
    const selected = selectRelevantBitoTools(tools, query, options.limit ?? 16).tools;
    return this.toModelTools(selected, false);
  }

  private toModelTools(tools: BitoMcpTool[], includeInventory: boolean): BitoModelTool[] {
    const modelTools = tools.map((tool) => this.toModelTool(tool));
    if (includeInventory && selectVerifiedInventoryTools(tools)) modelTools.unshift(this.inventoryModelTool());
    return modelTools;
  }

  private toModelTool(tool: BitoMcpTool): BitoModelTool {
    const sideEffect = this.sideEffect(tool);
    return {
      name: this.alias(tool.name),
      description: this.description(tool),
      parameters: this.inputSchema(tool),
      requiresConfirmation: sideEffect === 'WRITE',
      sideEffect,
    };
  }

  private inventoryModelTool(): BitoModelTool {
    return {
      name: BITO_INVENTORY_TOOL_NAME,
      description:
        'Bito ERPdagi joriy ombor qoldiqlarini real mahsulot nomi, miqdor va birlik bilan qaytaradi. '
        + 'User ombor, qoldiq, mahsulot mavjudligi yoki aniq mahsulot qoldig‘ini so‘rasa shu READ toolni ishlating. '
        + 'Barcha sahifalar serverda avtomatik yig‘iladi; tasdiqlash talab qilinmaydi.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Optional product-name search, for example Cola.' },
          includeZero: { type: 'boolean', description: 'Include zero-stock products. Default false.' },
          includeSummary: { type: 'boolean', description: 'Fetch aggregate product-count/stock summary when the user asks for totals.' },
        },
        additionalProperties: false,
      },
      requiresConfirmation: false,
      sideEffect: 'READ',
    };
  }

  async execute(userId: string, alias: string, input: unknown, confirmed: boolean, requestId: string) {
    try {
      return await this.executeResolved(userId, alias, input, confirmed, requestId);
    } catch (error) {
      const code = error instanceof Error ? error.message.match(/BITO_[A-Z0-9_]+/)?.[0] : undefined;
      if (code === 'BITO_NOT_CONNECTED' || code === 'BITO_AUTH_FAILED' || code === 'BITO_TOKEN_REFRESH_FAILED') {
        this.toolSchemaCache.delete(userId);
      }
      this.logger.warn({ code: code ?? 'BITO_TOOL_FAILED', requestId });
      throw error;
    }
  }

  private async executeResolved(userId: string, alias: string, input: unknown, confirmed: boolean, requestId: string) {
    assertToolObject(input);
    const toolInput = input as Record<string, unknown>;

    if (alias === BITO_INVENTORY_TOOL_NAME) {
      const data = sanitize(await this.getFullInventorySnapshot(userId, toolInput));
      return {
        status: 'success' as const,
        tool: alias,
        data,
        meta: { executedAt: new Date().toISOString(), requestId },
      };
    }

    const tool = await this.resolve(userId, alias);
    const sideEffect = this.sideEffect(tool);
    if (sideEffect === 'WRITE' && !confirmed) {
      return {
        status: 'confirmation_required' as const,
        tool: alias,
        input: toolInput,
        preview: { provider: 'Bito ERP', operation: tool.title ?? tool.name, input: redact(toolInput) },
        meta: { requestId },
      };
    }

    const raw = sideEffect === 'READ'
      ? await this.readToolFully(userId, tool, toolInput)
      : await this.bito.callToolForUser(userId, tool.name, toolInput);
    const data = sanitize(raw);

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

  private async resolve(userId: string, alias: string): Promise<BitoMcpTool> {
    const tools = await this.toolsForUser(userId);
    const found = tools.find((tool) => this.alias(tool.name) === alias);
    if (!found) throw new NotFoundException('Bito MCP tool topilmadi yoki o‘zgargan');
    return found;
  }

  private toolsForUser(userId: string): Promise<BitoMcpTool[]> {
    const now = Date.now();
    const cached = this.toolSchemaCache.get(userId);
    if (cached && cached.expiresAt > now) return Promise.resolve(cached.tools);
    if (cached) this.toolSchemaCache.delete(userId);

    const inFlight = this.toolSchemaLoads.get(userId);
    if (inFlight) return inFlight;

    const load = this.bito.listToolsForUser(userId)
      .then((tools) => {
        if (this.toolSchemaCache.size >= MAX_TOOL_SCHEMA_CACHE_USERS && !this.toolSchemaCache.has(userId)) {
          const oldest = this.toolSchemaCache.keys().next().value as string | undefined;
          if (oldest) this.toolSchemaCache.delete(oldest);
        }
        this.toolSchemaCache.set(userId, { expiresAt: Date.now() + TOOL_SCHEMA_CACHE_TTL_MS, tools });
        return tools;
      })
      .finally(() => this.toolSchemaLoads.delete(userId));
    this.toolSchemaLoads.set(userId, load);
    return load;
  }

  private alias(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 38) || 'tool';
    const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
    return `bito__${base}_${hash}`;
  }

  /**
   * Bito READ operations must be instant for the user. We keep an explicit
   * deny-by-default boundary for writes, but understand the multilingual names
   * and schemas Bito exposes for reports/catalog/stock reads.
   */
  private sideEffect(tool: BitoMcpTool): 'READ' | 'WRITE' { return bitoToolSideEffect(tool); }

  private description(tool: BitoMcpTool): string {
    const detail = (tool.description?.trim() || tool.title?.trim() || tool.name).slice(0, 1100);
    const sideEffect = this.sideEffect(tool);
    const readInstruction = sideEffect === 'READ'
      ? ' This is a READ operation: execute immediately without asking the user for confirmation. If the response is paginated, Qulay automatically expands supported pages.'
      : '';
    return `Bito ERP operation ${tool.name}: ${detail}. Use only real Bito data returned by this tool.${readInstruction}`;
  }

  private inputSchema(tool: BitoMcpTool): Record<string, unknown> {
    const schema = tool.inputSchema;
    if (!schema || schema.type !== 'object') return { type: 'object', properties: {}, additionalProperties: true };
    return schema;
  }

  private async readToolFully(userId: string, tool: BitoMcpTool, input: Record<string, unknown>): Promise<unknown> {
    this.diagnostic('BITO_SELECTED_TOOL', { tool: bitoSafeToolName(tool.name), operation: 'read' });
    const collectionRead = this.isCollectionReadTool(tool);
    const firstInput = collectionRead ? preferredReadInput(tool.inputSchema, input) : input;
    const firstPayload = await this.readPayload(userId, tool, firstInput, 1);
    if (!collectionRead) return firstPayload;
    const firstRecords = bestRecordArray(firstPayload);
    if (firstRecords.length > MAX_AUTO_RECORDS) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
    if (!firstRecords.length) {
      if ((recordTotal(firstPayload) ?? 0) > 0 || findMetaValue(firstPayload, ['hasMore', 'nextCursor'])) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
      return firstPayload;
    }

    const pager = detectPager(tool.inputSchema, firstInput, firstPayload, firstRecords.length);
    if (!pager) {
      if ((recordTotal(firstPayload) ?? firstRecords.length) > firstRecords.length || findMetaValue(firstPayload, ['hasMore', 'nextCursor', 'next'])) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
      return firstPayload;
    }

    const merged: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    addUniqueRecords(merged, seen, firstRecords, MAX_AUTO_RECORDS);
    let pagesFetched = 1;
    let payload = firstPayload;
    let records = firstRecords;
    let state = pager.initialState;
    const requests = new Set([stableJson(firstInput)]);

    while (pagesFetched < MAX_AUTO_PAGES && merged.length < MAX_AUTO_RECORDS) {
      if (!pager.hasNext(payload, records, merged.length, state)) break;
      const nextInput = pager.nextInput(firstInput, payload, records, state);
      if (!nextInput) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
      const signature = stableJson(nextInput);
      if (requests.has(signature)) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
      requests.add(signature);

      const nextPayload = await this.readPayload(userId, tool, nextInput, pagesFetched + 1);
      const nextRecords = bestRecordArray(nextPayload);
      pagesFetched += 1;
      if (!nextRecords.length) {
        const total = recordTotal(payload);
        if ((total !== undefined && merged.length < total) || findMetaValue(nextPayload, ['hasMore', 'nextCursor'])) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
        records = [];
        break;
      }
      const before = merged.length;
      addUniqueRecords(merged, seen, nextRecords, MAX_AUTO_RECORDS);
      if (merged.length === before) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
      state = pager.advanceState(state, nextInput, nextPayload, nextRecords);
      payload = nextPayload;
      records = nextRecords;
    }

    const total = recordTotal(payload);
    if ((total !== undefined && merged.length < total)
      || (records.length > 0 && pager.hasNext(payload, records, merged.length, state))) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
    if (pagesFetched === 1) return firstPayload;
    return {
      provider: 'Bito ERP',
      tool: tool.name,
      autoPaginated: true,
      complete: true,
      pagesFetched,
      recordCount: merged.length,
      records: merged,
    };
  }

  private async readPayload(userId: string, tool: BitoMcpTool, input: Record<string, unknown>, pageOrdinal: number) {
    const payload = unwrapBitoMcpResult(await this.bito.callToolForUser(userId, tool.name, input, true));
    const toolName = bitoSafeToolName(tool.name);
    this.diagnostic('BITO_UNWRAPPED_PAYLOAD_SHAPE', { tool: toolName, shape: bitoResponseShape(payload) });
    this.diagnostic('BITO_PAGINATION_META', {
      tool: toolName, pageOrdinal, recordCount: bestRecordArray(payload).length,
      hasMore: typeof findMetaValue(payload, ['hasMore']) === 'boolean' ? findMetaValue(payload, ['hasMore']) : undefined,
      hasCursor: Boolean(findMetaValue(payload, ['nextCursor', 'next'])),
      // Presence/type only. Generic root `total` may be monetary and is not
      // trusted as a record count by the pager.
      genericTotalType: typeof findMetaValue(payload, ['total']),
      recordTotalType: typeof recordTotal(payload),
      totalPagesType: typeof findMetaValue(payload, ['totalPages', 'pages']),
    });
    return payload;
  }

  private isCollectionReadTool(tool: BitoMcpTool): boolean {
    if (this.sideEffect(tool) !== 'READ') return false;
    const text = normalizeText(`${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`);
    return COLLECTION_PATTERN.test(text) || hasPaginationProperty(tool.inputSchema);
  }

  async getFullInventorySnapshot(userId: string, input: Record<string, unknown> = {}) {
    const tools = await this.toolsForUser(userId);
    const verified = selectVerifiedInventoryTools(tools);
    if (!verified) {
      this.diagnostic('BITO_SELECTED_TOOL', { intent: 'inventory', status: 'unavailable', reason: 'verified_inventory_tool_missing' });
      throw new NotFoundException('BITO_INVENTORY_TOOLS_UNAVAILABLE');
    }

    this.diagnostic('BITO_SELECTED_TOOL', {
      intent: 'inventory',
      list: bitoSafeToolName(verified.list.name),
      ...(verified.summary ? { summary: bitoSafeToolName(verified.summary.name) } : {}),
    });

    const requestedSearch = typeof input.search === 'string' ? input.search.trim() : '';
    const listInput = defaultReadInput(verified.list.inputSchema);
    if (requestedSearch && schemaHasProperty(verified.list.inputSchema, 'search')) listInput.search = requestedSearch;

    let listResult = await this.readToolFully(userId, verified.list, listInput);
    let records = recordsFromExpandedResult(listResult);

    // Some provider-side search implementations are stricter than users expect.
    // If a search returns no rows, fetch the verified full stock list and filter
    // locally rather than incorrectly claiming the product does not exist.
    if (requestedSearch && records.length === 0) {
      const retryInput = defaultReadInput(verified.list.inputSchema);
      listResult = await this.readToolFully(userId, verified.list, retryInput);
      records = recordsFromExpandedResult(listResult);
    }

    if (!records.length && !hasEmptyCollection(listResult)) throw new ServiceUnavailableException('BITO_MAPPING_FAILED');

    const normalized = normalizeSingleInventory(records);
    const includeZero = input.includeZero === true;
    const search = requestedSearch.toLocaleLowerCase();
    const items = normalized
      .filter(item => includeZero || item.quantity !== 0)
      .filter(item => !search || item.name.toLocaleLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name, 'uz'));

    // Summary is useful for aggregate counts/alerts but must never make the
    // inventory list fail. Bito business/report tools may independently error.
    let summary: unknown = undefined;
    if (input.includeSummary === true && verified.summary) {
      try { summary = sanitize(await this.readToolFully(userId, verified.summary, defaultReadInput(verified.summary.inputSchema))); }
      catch { this.diagnostic('BITO_INVENTORY_SUMMARY', { status: 'unavailable' }); }
    }

    const unmapped = Math.max(0, records.length - normalized.length);
    this.diagnostic('BITO_INVENTORY_NORMALIZATION', {
      sourceRecordCount: records.length,
      normalizedCount: normalized.length,
      unmappedCount: unmapped,
      missingUnitCount: normalized.filter(item => !item.unit).length,
      complete: true,
    });

    // Do not fail closed merely because Bito adds/renames a display field. The
    // safe raw rows let the model still answer from real provider data while
    // diagnostics reveal only shape. IDs/secrets are stripped from raw rows.
    const rawRows = unmapped > 0 ? records.filter(record => !normalizeSingleInventory([record]).length).slice(0, 500).map(compactBusinessRecord) : undefined;
    return {
      provider: 'Bito ERP',
      source: 'BITO',
      intent: 'inventory',
      complete: true,
      sourceOfTruth: true,
      normalizationComplete: unmapped === 0,
      totalPositions: records.length,
      matchedCount: items.length,
      items,
      ...(summary !== undefined ? { summary } : {}),
      ...(rawRows ? { rawRows, unmappedCount: unmapped, rawRowsTruncated: unmapped > rawRows.length } : {}),
      note: 'Bito MCP current-stock report is the source of truth. Internal identifiers are intentionally not exposed.',
    };
  }

}

function redact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => /token|secret|password|authorization|api.?key/i.test(key) ? [key, '[REDACTED]'] : [key, value]));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 9) return '[truncated]';
  if (typeof value === 'string') return value.length > 18_000 ? `${value.slice(0, 18_000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, MAX_AUTO_RECORDS).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 180);
    return Object.fromEntries(entries.map(([key, item]) => [key, /token|secret|password|authorization|api.?key/i.test(key) ? '[REDACTED]' : sanitize(item, depth + 1)]));
  }
  return value;
}

const COLLECTION_PATTERN = /\b(?:list|search|products?|catalog|stock|inventory|warehouse|customers?|orders?|sales|transactions?|items?|goods|mahsulot|qoldiq|ombor|royxat|ro'yxat|товар|остат|склад|список)/iu;

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[‐‑–—]/g, '-').replace(/[_./:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9а-яёўқғҳ]+/giu, '');
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stableJson(value: unknown): string {
  try { return JSON.stringify(value, Object.keys(objectOf(value)).sort()); } catch { return String(value); }
}

function bestRecordArray(value: unknown): Array<Record<string, unknown>> {
  const parts = objectOf(value).mcpPayloads;
  if (Array.isArray(parts)) return parts.flatMap(bestRecordArray);
  const candidates: Array<{ score: number; items: Array<Record<string, unknown>> }> = [];
  const visit = (node: unknown, keyHint = '', depth = 0) => {
    if (depth > 7) return;
    if (Array.isArray(node)) {
      const objects = node.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
      if (objects.length) {
        const hint = normalizeKey(keyHint);
        let score = objects.length;
        if (/(items|data|results|records|products|stocks|balances|goods|list|rows|mahsulot|qoldiq)/.test(hint)) score += 1000;
        const keys = new Set(objects.slice(0, 5).flatMap((item) => Object.keys(item).map(normalizeKey)));
        if ([...keys].some((key) => /(?:id|name|title|product|quantity|qty|stock|balance|amount|count|qoldiq)/.test(key))) score += 500;
        candidates.push({ score, items: objects });
      }
      node.forEach((item) => visit(item, keyHint, depth + 1));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, item] of Object.entries(node as Record<string, unknown>)) visit(item, key, depth + 1);
    }
  };
  visit(value);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.items ?? [];
}

function recordIdentity(record: Record<string, unknown>): string {
  const warehouseId = pickValue(record, ['warehouseId', 'warehouse_id', 'storeId', 'store_id', 'branchId', 'branch_id']);
  const ownId = pickValue(record, ['id', 'uuid', 'rowId', 'row_id', 'recordId', 'record_id']);
  if (ownId !== undefined && ownId !== null) return `id:${String(ownId)}:warehouse:${String(warehouseId ?? '')}`;
  const productId = pickValue(record, ['productId', 'product_id', 'itemId', 'item_id', 'goodsId', 'goods_id', 'code', 'sku']);
  if (productId !== undefined && productId !== null) return `product:${String(productId)}:warehouse:${String(warehouseId ?? '')}`;
  try { return `json:${JSON.stringify(record)}`; } catch { return `obj:${Object.keys(record).join(',')}`; }
}

function addUniqueRecords(target: Array<Record<string, unknown>>, seen: Set<string>, records: Array<Record<string, unknown>>, max: number): void {
  for (const record of records) {
    const key = recordIdentity(record);
    if (seen.has(key)) continue;
    if (target.length >= max) throw new ServiceUnavailableException('BITO_PAGINATION_FAILED');
    seen.add(key);
    target.push(record);
  }
}

type Pager = {
  initialState: Record<string, unknown>;
  hasNext: (payload: unknown, records: Array<Record<string, unknown>>, mergedCount: number, state: Record<string, unknown>) => boolean;
  nextInput: (base: Record<string, unknown>, payload: unknown, records: Array<Record<string, unknown>>, state: Record<string, unknown>) => Record<string, unknown> | null;
  advanceState: (state: Record<string, unknown>, nextInput: Record<string, unknown>, payload: unknown, records: Array<Record<string, unknown>>) => Record<string, unknown>;
};

function detectPager(schema: Record<string, unknown> | undefined, input: Record<string, unknown>, firstPayload: unknown, firstCount: number): Pager | null {
  const properties = objectOf(schema?.properties);
  const keys = Object.keys(properties);
  const findKey = (...candidates: string[]) => keys.find((key) => candidates.includes(normalizeKey(key)));
  const pageKey = findKey('page', 'pagenumber', 'pageindex');
  const offsetKey = findKey('offset', 'skip');
  const cursorKey = findKey('cursor', 'nextcursor', 'after');
  const limitKey = findKey('limit', 'pagesize', 'perpage', 'take');

  if (cursorKey) {
    return {
      initialState: {},
      hasNext: (payload) => findMetaValue(payload, ['hasMore', 'has_more']) !== false && Boolean(findMetaValue(payload, ['nextCursor', 'next_cursor', 'next'])),
      nextInput: (base, payload) => {
        const cursor = findMetaValue(payload, ['nextCursor', 'next_cursor', 'next']);
        return cursor ? { ...base, [cursorKey]: cursor, ...(limitKey && base[limitKey] === undefined ? { [limitKey]: 100 } : {}) } : null;
      },
      advanceState: (state) => state,
    };
  }

  if (pageKey) {
    const initialPage = numberOf(input[pageKey]) ?? numberOf(findMetaValue(firstPayload, ['page', 'currentPage', 'current_page', 'pageNumber'])) ?? 1;
    const pageSize = numberOf(input[limitKey ?? '']) ?? numberOf(findMetaValue(firstPayload, ['limit', 'pageSize', 'page_size', 'perPage', 'per_page'])) ?? firstCount;
    return {
      initialState: { page: initialPage, pageSize },
      hasNext: (payload, records, mergedCount, state) => {
        if (findMetaValue(payload, ['hasMore', 'has_more']) === false) return false;
        const totalPages = numberOf(findMetaValue(payload, ['totalPages', 'total_pages', 'lastPage', 'last_page', 'pages']));
        const total = recordTotal(payload);
        const page = numberOf(state.page) ?? initialPage;
        if (totalPages !== undefined) return page < totalPages;
        if (total !== undefined) return mergedCount < total;
        return records.length >= Math.max(1, numberOf(state.pageSize) ?? pageSize);
      },
      nextInput: (base, _payload, _records, state) => {
        const page = (numberOf(state.page) ?? initialPage) + 1;
        return { ...base, [pageKey]: page, ...(limitKey && base[limitKey] === undefined ? { [limitKey]: Math.max(50, pageSize || 50) } : {}) };
      },
      advanceState: (_state, nextInput) => ({ page: numberOf(nextInput[pageKey]) ?? initialPage + 1, pageSize }),
    };
  }

  if (offsetKey) {
    const initialOffset = numberOf(input[offsetKey]) ?? 0;
    const pageSize = numberOf(input[limitKey ?? '']) ?? numberOf(findMetaValue(firstPayload, ['limit', 'pageSize', 'page_size', 'perPage', 'per_page'])) ?? firstCount;
    return {
      initialState: { offset: initialOffset, pageSize },
      hasNext: (payload, records, mergedCount, state) => {
        if (findMetaValue(payload, ['hasMore', 'has_more']) === false) return false;
        const total = recordTotal(payload);
        if (total !== undefined) return mergedCount < total;
        return records.length >= Math.max(1, numberOf(state.pageSize) ?? pageSize);
      },
      nextInput: (base, _payload, records, state) => {
        const offset = (numberOf(state.offset) ?? initialOffset) + Math.max(1, records.length || pageSize);
        return { ...base, [offsetKey]: offset, ...(limitKey && base[limitKey] === undefined ? { [limitKey]: Math.max(50, pageSize || 50) } : {}) };
      },
      advanceState: (_state, nextInput) => ({ offset: numberOf(nextInput[offsetKey]) ?? initialOffset, pageSize }),
    };
  }

  return null;
}

function findMetaValue(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return undefined;
  const normalized = new Set(keys.map(normalizeKey));
  // Never mistake a product's count/cursor/total for collection metadata.
  if (Array.isArray(value)) return undefined;
  if (typeof value !== 'object') return undefined;
  const parts = objectOf(value).mcpPayloads;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const found = findMetaValue(part, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (normalized.has(normalizeKey(key)) && (typeof item !== 'object' || item === null)) return item;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!['meta', 'pagination', 'paging', 'pageInfo', 'data', 'result'].includes(key)) continue;
    const found = findMetaValue(item, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Record totals are intentionally stricter than generic `total`. Bito report
 * payloads can use a root-level `total` for money/cost, which must never drive
 * pagination. We accept explicit count-shaped keys anywhere and plain `total`
 * only inside a pagination/meta container.
 */
function recordTotal(value: unknown, depth = 0, inPaginationMeta = false): number | undefined {
  if (depth > 7 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = recordTotal(item, depth + 1, inPaginationMeta);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  const object = value as Record<string, unknown>;
  const explicitCountKeys = new Set([
    'totalcount', 'recordstotal', 'recordcount', 'itemcount', 'itemscount', 'resultcount', 'rowcount',
  ]);
  for (const [key, item] of Object.entries(object)) {
    const normalized = normalizeKey(key);
    if (explicitCountKeys.has(normalized)) {
      const count = numberOf(item);
      if (count !== undefined && count >= 0) return count;
    }
  }
  if (inPaginationMeta) {
    for (const [key, item] of Object.entries(object)) {
      if (normalizeKey(key) !== 'total') continue;
      const count = numberOf(item);
      if (count !== undefined && count >= 0) return count;
    }
  }

  const parts = object.mcpPayloads;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const found = recordTotal(part, depth + 1, inPaginationMeta);
      if (found !== undefined) return found;
    }
  }

  for (const [key, item] of Object.entries(object)) {
    if (!item || typeof item !== 'object') continue;
    const normalized = normalizeKey(key);
    const meta = inPaginationMeta || ['meta', 'pagination', 'paging', 'pageinfo'].includes(normalized);
    const found = recordTotal(item, depth + 1, meta);
    if (found !== undefined) return found;
  }
  return undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function preferredReadInput(schema: Record<string, unknown> | undefined, input: Record<string, unknown>): Record<string, unknown> {
  const properties = objectOf(schema?.properties);
  const next = { ...input };
  for (const key of Object.keys(properties)) {
    const normalized = normalizeKey(key);
    if (/^(?:limit|pagesize|perpage|take)$/.test(normalized) && next[key] === undefined) next[key] = Math.min(200, numberOf(objectOf(properties[key]).maximum) ?? 200);
    if (/^(?:page|pagenumber|pageindex)$/.test(normalized) && next[key] === undefined) next[key] = numberOf(objectOf(properties[key]).default) ?? (normalized === 'pageindex' ? 0 : 1);
    if (/^(?:offset|skip)$/.test(normalized) && next[key] === undefined) next[key] = 0;
  }
  return next;
}

function hasPaginationProperty(schema: Record<string, unknown> | undefined): boolean {
  const keys = Object.keys(objectOf(schema?.properties)).map(normalizeKey);
  return keys.some((key) => /^(?:page|pagenumber|pageindex|offset|skip|cursor|nextcursor|after|limit|pagesize|perpage|take)$/.test(key));
}

function defaultReadInput(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  return preferredReadInput(schema, {});
}

function recordsFromExpandedResult(value: unknown): Array<Record<string, unknown>> {
  const object = objectOf(value);
  if (Array.isArray(object.records)) return object.records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  return bestRecordArray(value);
}

function hasEmptyCollection(value: unknown, depth = 0): boolean {
  if (depth > 7) return false;
  if (Array.isArray(value)) return value.length === 0;
  const object = objectOf(value);
  if (Array.isArray(object.mcpPayloads)) return object.mcpPayloads.some(item => hasEmptyCollection(item, depth + 1));
  return Object.entries(object).some(([key, item]) => /^(?:items|data|results|records|products|stocks|balances|goods|list|rows|result)$/.test(key) && hasEmptyCollection(item, depth + 1));
}

function pickValue(record: Record<string, unknown>, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(record)) if (wanted.has(normalizeKey(key))) return value;
  return undefined;
}

function nestedRecord(record: Record<string, unknown>, aliases: string[]): Record<string, unknown> | null {
  const value = pickValue(record, aliases);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function schemaHasProperty(schema: Record<string, unknown> | undefined, wanted: string): boolean {
  return Object.keys(objectOf(schema?.properties)).some(key => normalizeKey(key) === normalizeKey(wanted));
}

function normalizeSingleInventory(records: Array<Record<string, unknown>>): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const record of records) {
    const name = deepScalar(record, [
      'productName', 'product_name', 'productTitle', 'product_title', 'name', 'title', 'label', 'fullName', 'full_name',
      'itemName', 'item_name', 'goodsName', 'goods_name', 'tovarName', 'tovar_name', 'nomi', 'product', 'goods', 'item',
    ], ['product', 'goods', 'item', 'tovar', 'mahsulot', 'nomenclature']);
    const quantity = deepNumber(record, [
      'quantity', 'qty', 'stock', 'stockQty', 'stock_qty', 'balance', 'remainder', 'remaining', 'remainingQuantity',
      'remaining_quantity', 'remain', 'rest', 'residue', 'onHand', 'on_hand', 'count', 'amount', 'qoldiq', 'ostatok',
      'available', 'availableQty', 'available_qty', 'availableStock', 'available_stock', 'currentStock', 'current_stock',
    ], ['stock', 'inventory', 'balance', 'remainder', 'product']);
    if (!name || quantity === undefined) continue;
    const unit = deepScalar(record, ['unit', 'unitName', 'unit_name', 'unitTitle', 'unit_title', 'measure', 'measureName', 'measure_name', 'uom', 'birlik'], ['unit', 'measure', 'uom', 'product']);
    const warehouse = deepScalar(record, ['warehouseName', 'warehouse_name', 'storeName', 'store_name', 'omborNomi', 'skladName'], ['warehouse', 'store', 'ombor', 'sklad']);
    const cost = deepNumber(record, ['cost', 'stockCost', 'stock_cost', 'totalCost', 'total_cost', 'costValue', 'cost_value'], ['cost', 'product']);
    const price = deepNumber(record, ['price', 'salePrice', 'sale_price', 'retailPrice', 'retail_price'], ['price', 'product']);
    items.push({ name, quantity: roundNumber(quantity), ...(unit ? { unit } : {}), ...(warehouse ? { warehouse } : {}), ...(cost !== undefined ? { cost: roundNumber(cost) } : {}), ...(price !== undefined ? { price: roundNumber(price) } : {}) });
  }
  return items;
}

function deepScalar(record: Record<string, unknown>, aliases: string[], preferredContainers: string[], depth = 0): string | undefined {
  const direct = scalarText(pickValue(record, aliases));
  if (direct && !looksLikeOpaqueId(direct)) return direct;
  if (depth >= 4) return undefined;
  for (const container of preferredContainers) {
    const nested = nestedRecord(record, [container]);
    if (!nested) continue;
    const found = deepScalar(nested, aliases, preferredContainers, depth + 1);
    if (found) return found;
  }
  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const found = deepScalar(value as Record<string, unknown>, aliases, preferredContainers, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function deepNumber(record: Record<string, unknown>, aliases: string[], preferredContainers: string[], depth = 0): number | undefined {
  const direct = numberOf(pickValue(record, aliases));
  if (direct !== undefined) return direct;
  if (depth >= 4) return undefined;
  for (const container of preferredContainers) {
    const nested = nestedRecord(record, [container]);
    if (!nested) continue;
    const found = deepNumber(nested, aliases, preferredContainers, depth + 1);
    if (found !== undefined) return found;
  }
  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const found = deepNumber(value as Record<string, unknown>, aliases, preferredContainers, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function looksLikeOpaqueId(value: string): boolean {
  const text = value.trim();
  return /^[a-f0-9]{24,}$/i.test(text) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text);
}

function compactBusinessRecord(record: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 3) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record).slice(0, 60)) {
    if (/token|secret|password|authorization|api.?key/i.test(key)) continue;
    if (/^(?:_?id|.*(?:_id|Id|uuid|guid|uid))$/i.test(key)) continue;
    if (typeof value === 'string') output[key] = value.slice(0, 500);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) output[key] = value;
    else if (Array.isArray(value)) output[key] = value.slice(0, 20).map(item => item && typeof item === 'object' && !Array.isArray(item) ? compactBusinessRecord(item as Record<string, unknown>, depth + 1) : item);
    else if (value && typeof value === 'object') output[key] = compactBusinessRecord(value as Record<string, unknown>, depth + 1);
  }
  return output;
}

function roundNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
