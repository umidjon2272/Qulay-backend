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

type InventoryItem = {
  name: string;
  quantity: number;
  unit?: string;
  warehouse?: string;
};

export const BITO_INVENTORY_TOOL_NAME = 'bito__inventory_snapshot';
const MAX_AUTO_PAGES = 20;
const MAX_AUTO_RECORDS = 500;

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
    const modelTools = tools.map((tool) => {
      const sideEffect = this.sideEffect(tool);
      return {
        name: this.alias(tool.name),
        description: this.description(tool),
        parameters: this.inputSchema(tool),
        requiresConfirmation: sideEffect === 'WRITE',
        sideEffect,
      } satisfies BitoModelTool;
    });

    const inventory = this.inventoryTools(tools);
    if (inventory) {
      modelTools.unshift({
        name: BITO_INVENTORY_TOOL_NAME,
        description:
          'Bito ERP omboridagi mahsulotlarni inson o‘qiydigan nomlari va real qoldig‘i bilan qaytaradi. '
          + 'Mahsulot katalogi va ombor qoldiqlarining barcha sahifalarini avtomatik yuklaydi, Product ID bo‘yicha birlashtiradi. '
          + 'User “omborda nima bor?”, “qaysi mahsulot qancha qoldi?”, “Cola bormi?” kabi savol bersa shu toolni birinchi tanlang. '
          + 'Bu faqat READ amal; tasdiqlash so‘ralmaydi.',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Optional product-name search, for example Cola.' },
            includeZero: { type: 'boolean', description: 'Include zero-stock products. Default false.' },
          },
          additionalProperties: false,
        },
        requiresConfirmation: false,
        sideEffect: 'READ',
      });
    }

    return modelTools;
  }

  async execute(userId: string, alias: string, input: unknown, confirmed: boolean, requestId: string) {
    assertToolObject(input);
    const toolInput = input as Record<string, unknown>;

    if (alias === BITO_INVENTORY_TOOL_NAME) {
      const data = sanitize(await this.inventorySnapshot(userId, toolInput));
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

  /**
   * Bito READ operations must be instant for the user. We keep an explicit
   * deny-by-default boundary for writes, but understand the multilingual names
   * and schemas Bito exposes for reports/catalog/stock reads.
   */
  private sideEffect(tool: BitoMcpTool): 'READ' | 'WRITE' {
    if (tool.annotations?.readOnlyHint === true) return 'READ';
    if (tool.annotations?.destructiveHint === true) return 'WRITE';

    const text = normalizeText(`${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`);
    if (WRITE_PATTERN.test(text)) return 'WRITE';
    if (READ_PATTERN.test(text)) return 'READ';
    if (this.looksReadOnlyBySchema(tool.inputSchema)) return 'READ';
    return 'WRITE';
  }

  private looksReadOnlyBySchema(schema: Record<string, unknown> | undefined): boolean {
    if (!schema || schema.type !== 'object') return false;
    const properties = objectOf(schema.properties);
    const keys = Object.keys(properties).map(normalizeKey);
    if (!keys.length) return false;
    if (keys.some((key) => MUTATING_INPUT_KEYS.has(key))) return false;
    return keys.every((key) => READ_FILTER_KEYS.has(key) || /(?:id|ids|date|from|to|start|end|page|limit|offset|cursor|search|query|filter|sort|status|type|warehouse|product|customer|branch)/.test(key));
  }

  private description(tool: BitoMcpTool): string {
    const detail = (tool.description?.trim() || tool.title?.trim() || tool.name).slice(0, 1100);
    const sideEffect = this.sideEffect(tool);
    const readInstruction = sideEffect === 'READ'
      ? ' This is a READ operation: execute immediately without asking the user for confirmation. If the response is paginated, Qulay automatically expands supported pages.'
      : '';
    return `Bito ERP: ${detail}. Use only real Bito data returned by this tool.${readInstruction}`;
  }

  private inputSchema(tool: BitoMcpTool): Record<string, unknown> {
    const schema = tool.inputSchema;
    if (!schema || schema.type !== 'object') return { type: 'object', properties: {}, additionalProperties: true };
    return schema;
  }

  private async readToolFully(userId: string, tool: BitoMcpTool, input: Record<string, unknown>): Promise<unknown> {
    const collectionRead = this.isCollectionReadTool(tool);
    const firstInput = collectionRead ? preferredReadInput(tool.inputSchema, input) : input;
    const firstRaw = await this.bito.callToolForUser(userId, tool.name, firstInput);
    if (!collectionRead) return firstRaw;

    const firstPayload = parseMcpPayload(firstRaw);
    const firstRecords = bestRecordArray(firstPayload);
    if (!firstRecords.length) return firstRaw;

    const pager = detectPager(tool.inputSchema, firstInput, firstPayload, firstRecords.length);
    if (!pager) return firstRaw;

    const merged: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    addUniqueRecords(merged, seen, firstRecords, MAX_AUTO_RECORDS);
    let pagesFetched = 1;
    let payload = firstPayload;
    let records = firstRecords;
    let state = pager.initialState;

    while (pagesFetched < MAX_AUTO_PAGES && merged.length < MAX_AUTO_RECORDS) {
      if (!pager.hasNext(payload, records, merged.length, state)) break;
      const nextInput = pager.nextInput(firstInput, payload, records, state);
      if (!nextInput) break;
      const signature = stableJson(nextInput);
      if (signature === stableJson(firstInput) && pagesFetched > 0) break;

      const nextRaw = await this.bito.callToolForUser(userId, tool.name, nextInput);
      const nextPayload = parseMcpPayload(nextRaw);
      const nextRecords = bestRecordArray(nextPayload);
      if (!nextRecords.length) break;
      const before = merged.length;
      addUniqueRecords(merged, seen, nextRecords, MAX_AUTO_RECORDS);
      pagesFetched += 1;
      if (merged.length === before) break;
      state = pager.advanceState(state, nextInput, nextPayload, nextRecords);
      payload = nextPayload;
      records = nextRecords;
    }

    if (pagesFetched === 1) return firstRaw;
    return {
      provider: 'Bito ERP',
      tool: tool.name,
      autoPaginated: true,
      pagesFetched,
      recordCount: merged.length,
      records: merged,
    };
  }

  private isCollectionReadTool(tool: BitoMcpTool): boolean {
    if (this.sideEffect(tool) !== 'READ') return false;
    const text = normalizeText(`${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`);
    return COLLECTION_PATTERN.test(text) || hasPaginationProperty(tool.inputSchema);
  }

  private inventoryTools(tools: BitoMcpTool[]): { products: BitoMcpTool; stock: BitoMcpTool } | null {
    const readable = tools.filter((tool) => this.sideEffect(tool) === 'READ' && canCallWithoutBusinessRequiredInput(tool.inputSchema));
    const products = pickBestTool(readable, PRODUCT_TOOL_PATTERN, STOCK_TOOL_PATTERN);
    const stock = pickBestTool(readable, STOCK_TOOL_PATTERN, PRODUCT_DETAIL_ONLY_PATTERN);
    if (!products || !stock || products.name === stock.name) return null;
    return { products, stock };
  }

  private async inventorySnapshot(userId: string, input: Record<string, unknown>) {
    const tools = await this.toolsForUser(userId);
    const pair = this.inventoryTools(tools);
    if (!pair) throw new NotFoundException('Bito mahsulot va ombor qoldiq READ tool’lari topilmadi');

    const [productsResult, stockResult] = await Promise.all([
      this.readToolFully(userId, pair.products, defaultReadInput(pair.products.inputSchema)),
      this.readToolFully(userId, pair.stock, defaultReadInput(pair.stock.inputSchema)),
    ]);

    const productRecords = recordsFromExpandedResult(productsResult);
    const stockRecords = recordsFromExpandedResult(stockResult);
    const productMap = buildProductMap(productRecords);
    const normalized = normalizeInventory(stockRecords, productMap);
    const search = typeof input.search === 'string' ? input.search.trim().toLocaleLowerCase() : '';
    const includeZero = input.includeZero === true;
    const filtered = normalized
      .filter((item) => includeZero || item.quantity !== 0)
      .filter((item) => !search || item.name.toLocaleLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name, 'uz'));

    return {
      provider: 'Bito ERP',
      sourceOfTruth: true,
      productCount: productRecords.length,
      stockPositionCount: stockRecords.length,
      matchedCount: filtered.length,
      items: filtered,
      note: 'Internal Product ID values were used only for joining and are intentionally not exposed to the user.',
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
    return Object.fromEntries(entries.map(([key, item]) => [key, sanitize(item, depth + 1)]));
  }
  return value;
}

const WRITE_PATTERN = /\b(?:create|update|delete|remove|send|set|add|change|adjust|transfer|write|insert|post|put|patch|confirm|cancel|refund|payment|pay|archive|move|reserve|release|close|open|issue|create_order|order_create|update_order|customer_create|stock_transfer|stock_adjust|yarat|yaratish|tahrir|ozgartir|o'zgartir|yangila|ochir|o'chir|yubor|jonat|jo'nat|kochirish|ko'chirish|tasdiq|bekor|tolov|to'lov|qaytar|buyurtma yarat|sotuv yarat|создат|изменит|обновит|удалит|отправит|переместит|подтвердит|отменит|возврат|оплат)/iu;
const READ_PATTERN = /\b(?:get|list|search|find|read|query|report|summary|analytics|stock|inventory|warehouse|sales|profit|revenue|product|products|customer|catalog|balance|expense|fetch|retrieve|lookup|view|show|select|calculate|statistics|statistic|hisobot|korish|ko'rish|korsat|ko'rsat|olish|topish|qidir|royxat|ro'yxat|qoldiq|ombor|mahsulot|sotuv|foyda|daromad|xarajat|получ|список|найт|поиск|показ|просмотр|отчет|отчёт|остат|склад|товар|продаж|прибыл|выручк|расход)/iu;
const COLLECTION_PATTERN = /\b(?:list|search|products?|catalog|stock|inventory|warehouse|customers?|orders?|sales|transactions?|items?|goods|mahsulot|qoldiq|ombor|royxat|ro'yxat|товар|остат|склад|список)/iu;
const PRODUCT_TOOL_PATTERN = /(?:product|products|catalog|item|items|goods|mahsulot|tovar|товар|номенклат)/iu;
const STOCK_TOOL_PATTERN = /(?:stock|inventory|warehouse|balance|remainder|qoldiq|ombor|ostat|остат|склад)/iu;
const PRODUCT_DETAIL_ONLY_PATTERN = /(?:detail|single|one product|by id|карточк)/iu;

const MUTATING_INPUT_KEYS = new Set([
  'data', 'body', 'payload', 'changes', 'change', 'newvalue', 'value', 'quantitydelta', 'delta', 'recipient', 'message',
  'text', 'amounttopay', 'priceupdate', 'statusupdate', 'confirm', 'delete', 'remove', 'create', 'update',
]);
const READ_FILTER_KEYS = new Set([
  'page', 'pagenumber', 'pageindex', 'limit', 'pagesize', 'perpage', 'offset', 'skip', 'cursor', 'nextcursor',
  'search', 'query', 'q', 'filter', 'filters', 'sort', 'orderby', 'order', 'status', 'type', 'from', 'to', 'date',
  'startdate', 'enddate', 'warehouseid', 'productid', 'customerid', 'branchid', 'id', 'ids', 'includezero',
]);

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

function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try { return JSON.parse(trimmed) as unknown; } catch { return value; }
}

function parseMcpPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(parseMcpPayload);
  if (!value || typeof value !== 'object') return parseJsonish(value);
  const record = value as Record<string, unknown>;
  if (record.structuredContent !== undefined) return parseMcpPayload(record.structuredContent);
  if (Array.isArray(record.content)) {
    const parsed = record.content.flatMap((entry) => {
      const item = objectOf(entry);
      const text = typeof item.text === 'string' ? parseJsonish(item.text) : undefined;
      return text !== undefined ? [parseMcpPayload(text)] : [];
    });
    if (parsed.length === 1) return parsed[0];
    if (parsed.length > 1) return parsed;
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, parseMcpPayload(item)]));
}

function bestRecordArray(value: unknown): Array<Record<string, unknown>> {
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
  const ownId = pickValue(record, ['id', 'uuid', 'rowId', 'row_id', 'recordId', 'record_id']);
  if (ownId !== undefined && ownId !== null) return `id:${String(ownId)}`;
  const productId = pickValue(record, ['productId', 'product_id', 'itemId', 'item_id', 'goodsId', 'goods_id', 'code', 'sku']);
  const warehouseId = pickValue(record, ['warehouseId', 'warehouse_id', 'storeId', 'store_id', 'branchId', 'branch_id']);
  if (productId !== undefined && productId !== null) return `product:${String(productId)}:warehouse:${String(warehouseId ?? '')}`;
  try { return `json:${JSON.stringify(record)}`; } catch { return `obj:${Object.keys(record).join(',')}`; }
}

function addUniqueRecords(target: Array<Record<string, unknown>>, seen: Set<string>, records: Array<Record<string, unknown>>, max: number): void {
  for (const record of records) {
    if (target.length >= max) return;
    const key = recordIdentity(record);
    if (seen.has(key)) continue;
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
      hasNext: (payload) => Boolean(findMetaValue(payload, ['nextCursor', 'next_cursor', 'cursor', 'next'])),
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
        const totalPages = numberOf(findMetaValue(payload, ['totalPages', 'total_pages', 'lastPage', 'last_page', 'pages']));
        const total = numberOf(findMetaValue(payload, ['total', 'totalCount', 'total_count', 'recordsTotal', 'records_total']));
        const page = numberOf(state.page) ?? initialPage;
        if (totalPages !== undefined) return page < totalPages;
        if (total !== undefined) return mergedCount < total;
        return records.length > 0;
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
        const total = numberOf(findMetaValue(payload, ['total', 'totalCount', 'total_count', 'recordsTotal', 'records_total']));
        if (total !== undefined) return mergedCount < total;
        return records.length > 0;
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
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMetaValue(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (normalized.has(normalizeKey(key)) && (typeof item !== 'object' || item === null)) return item;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    const found = findMetaValue(item, keys, depth + 1);
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
    if (/^(?:limit|pagesize|perpage|take)$/.test(normalized) && next[key] === undefined) next[key] = 100;
    if (/^(?:page|pagenumber|pageindex)$/.test(normalized) && next[key] === undefined) next[key] = 1;
    if (/^(?:offset|skip)$/.test(normalized) && next[key] === undefined) next[key] = 0;
  }
  return next;
}

function hasPaginationProperty(schema: Record<string, unknown> | undefined): boolean {
  const keys = Object.keys(objectOf(schema?.properties)).map(normalizeKey);
  return keys.some((key) => /^(?:page|pagenumber|pageindex|offset|skip|cursor|nextcursor|after|limit|pagesize|perpage|take)$/.test(key));
}

function canCallWithoutBusinessRequiredInput(schema: Record<string, unknown> | undefined): boolean {
  if (!schema || schema.type !== 'object') return true;
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
  return required.every((key) => /^(?:page|pageNumber|pageIndex|offset|skip|cursor|limit|pageSize|perPage|take)$/i.test(key));
}

function defaultReadInput(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const properties = objectOf(schema?.properties);
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    const normalized = normalizeKey(key);
    if (/^(?:page|pagenumber|pageindex)$/.test(normalized)) input[key] = 1;
    else if (/^(?:limit|pagesize|perpage|take)$/.test(normalized)) input[key] = 100;
    else if (/^(?:offset|skip)$/.test(normalized)) input[key] = 0;
  }
  return input;
}

function pickBestTool(tools: BitoMcpTool[], positive: RegExp, negative?: RegExp): BitoMcpTool | undefined {
  return tools
    .map((tool) => {
      const text = normalizeText(`${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`);
      let score = 0;
      if (positive.test(text)) score += 10;
      if (/(?:list|get|search|report|read|fetch|show|query|royxat|ro'yxat|получ|список|показ)/iu.test(text)) score += 3;
      if (negative?.test(text)) score -= 5;
      return { tool, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.tool;
}

function recordsFromExpandedResult(value: unknown): Array<Record<string, unknown>> {
  const object = objectOf(value);
  if (Array.isArray(object.records)) return object.records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  return bestRecordArray(parseMcpPayload(value));
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

function productIdentity(record: Record<string, unknown>): string | undefined {
  const directRef = pickValue(record, ['product', 'item', 'goods', 'tovar', 'mahsulot']);
  const nested = directRef && typeof directRef === 'object' && !Array.isArray(directRef) ? directRef as Record<string, unknown> : null;
  const scalarRef = typeof directRef === 'string' || typeof directRef === 'number' ? directRef : undefined;
  const raw = pickValue(record, ['productId', 'product_id', 'productGuid', 'product_guid', 'itemId', 'item_id', 'goodsId', 'goods_id', 'tovarId', 'nomenclatureId', 'entityId', 'entity_id'])
    ?? scalarRef
    ?? (nested ? pickValue(nested, ['id', 'productId', 'product_id', 'code', 'uuid', 'guid', 'entityId', 'entity_id']) : undefined)
    ?? pickValue(record, ['id']);
  return scalarText(raw);
}

function productName(record: Record<string, unknown>): string | undefined {
  const directRef = pickValue(record, ['product', 'item', 'goods', 'tovar', 'mahsulot']);
  const nested = directRef && typeof directRef === 'object' && !Array.isArray(directRef) ? directRef as Record<string, unknown> : null;
  const directName = typeof directRef === 'string' && !/^\d+$/.test(directRef.trim()) ? directRef : undefined;
  const raw = pickValue(record, ['productName', 'product_name', 'productTitle', 'product_title', 'name', 'title', 'label', 'fullName', 'full_name', 'itemName', 'goodsName', 'tovarName', 'nomi'])
    ?? (nested ? pickValue(nested, ['name', 'title', 'label', 'productName', 'product_name', 'fullName', 'full_name', 'nomi']) : undefined)
    ?? directName;
  return scalarText(raw);
}

function buildProductMap(records: Array<Record<string, unknown>>): Map<string, string> {
  const map = new Map<string, string>();
  for (const record of records) {
    const id = productIdentity(record);
    const name = productName(record);
    if (id && name) map.set(id, name);
  }
  return map;
}

function normalizeInventory(records: Array<Record<string, unknown>>, products: Map<string, string>): InventoryItem[] {
  const aggregate = new Map<string, InventoryItem>();
  for (const record of records) {
    const id = productIdentity(record);
    const directName = productName(record);
    const name = directName ?? (id ? products.get(id) : undefined);
    if (!name) continue;
    const quantity = quantityValue(record);
    if (quantity === undefined) continue;
    const unit = scalarText(pickValue(record, ['unit', 'unitName', 'unit_name', 'unitTitle', 'unit_title', 'measure', 'measureName', 'measure_name', 'uom', 'birlik']));
    const warehouse = warehouseName(record);
    const key = `${name}\u0000${unit ?? ''}`;
    const current = aggregate.get(key);
    if (current) {
      current.quantity += quantity;
      if (!current.warehouse && warehouse) current.warehouse = warehouse;
      else if (current.warehouse && warehouse && current.warehouse !== warehouse) delete current.warehouse;
    } else {
      aggregate.set(key, { name, quantity, ...(unit ? { unit } : {}), ...(warehouse ? { warehouse } : {}) });
    }
  }
  return [...aggregate.values()].map((item) => ({ ...item, quantity: roundNumber(item.quantity) }));
}

function quantityValue(record: Record<string, unknown>): number | undefined {
  const raw = pickValue(record, [
    'quantity', 'qty', 'stock', 'stockQty', 'stock_qty', 'balance', 'remainder', 'remaining', 'remainingQuantity', 'remaining_quantity', 'remain', 'rest', 'residue', 'onHand', 'on_hand', 'count', 'amount', 'qoldiq', 'ostatok', 'available', 'availableQty', 'available_qty', 'availableStock', 'available_stock',
  ]);
  const direct = numberOf(raw);
  if (direct !== undefined) return direct;
  const nested = nestedRecord(record, ['stock', 'inventory', 'balance', 'remainder']);
  if (!nested) return undefined;
  return numberOf(pickValue(nested, ['quantity', 'qty', 'amount', 'count', 'value', 'balance', 'remainder']));
}

function warehouseName(record: Record<string, unknown>): string | undefined {
  const nested = nestedRecord(record, ['warehouse', 'store', 'ombor', 'sklad']);
  return scalarText(pickValue(record, ['warehouseName', 'warehouse_name', 'storeName', 'omborNomi', 'skladName']))
    ?? (nested ? scalarText(pickValue(nested, ['name', 'title'])) : undefined);
}

function roundNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
