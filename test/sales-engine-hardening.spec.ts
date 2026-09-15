import { ConfigService } from '@nestjs/config';
import {
  customerSafeSalesAnswer,
  planSalesNextAction,
  reconcileUniversalSalesStateFromInventory,
  salesCatalogLookupQuery,
  updateUniversalSalesState,
} from '../src/ai-agent/universal-sales-context';
import { extractBusinessSalesProfilePatch } from '../src/ai-agent/business-sales-profile';
import {
  bufferSalesTextFragment,
  consumeSalesTextFragments,
  isSalesTurnCurrent,
  reserveSalesInboundTurn,
  runSalesTurnSequential,
  waitForSalesTurnDebounce,
} from '../src/ai-agent/sales-turn-coordinator';
import { bitoInventorySearchTerm } from '../src/bito/bito-intent';
import { BitoToolBridgeService } from '../src/bito/bito-tool-bridge.service';
import { BITO_INVENTORY_PRIMARY_TOOL } from '../src/bito/bito-inventory-tools';
import { isWhatsAppSalesRelevant } from '../src/whatsapp/whatsapp-sales-policy';
import type { BitoMcpTool } from '../src/bito/bito-mcp.client';

describe('universal sales engine hardening', () => {

  it('keeps the exact Telegram production flow in one coherent sales context', () => {
    let state = updateUniversalSalesState(undefined, 'Salom ayfon bormi?');
    state = updateUniversalSalesState(state, 'Qanaqa ayfonlar bor?');
    expect(state.product).toBe('iphone');
    state = updateUniversalSalesState(state, '13 pro bormi?');
    expect(state.model).toBe('13 pro');
    state = updateUniversalSalesState(state, 'Ayfon 13 pro narxi qancha');
    expect(state.lastIntent).toBe('PRICE');
    state = updateUniversalSalesState(state, '2ta olsam qancha?');
    expect(state.quantity).toBe(2);
    expect(state.product).toBe('iphone');
    expect(salesCatalogLookupQuery(state, '2ta olsam qancha?')).toBe('iphone 13 pro');
    state = updateUniversalSalesState(state, 'iPhone 13 pro qizil rangidan bormi?');
    expect(state.model).toBe('13 pro');
    expect(state.color).toBe('qizil');

    let cola = updateUniversalSalesState(undefined, 'Kola kola bormi?');
    cola = updateUniversalSalesState(cola, '1.5 ltr bormi?');
    expect(cola.product).toBe('coca cola');
    expect(cola.variant).toBe('1.5L');
    const continued = updateUniversalSalesState(cola, 'Alo sotuvchi');
    expect(continued.product).toBe('coca cola');
    expect(continued.variant).toBe('1.5L');
  });

  it('recognizes broad family and natural need phrases on WhatsApp too', () => {
    expect(isWhatsAppSalesRelevant('Qanaqa ayfonlar bor?', false, 'text')).toBe(true);
    expect(isWhatsAppSalesRelevant('Coca Cola kerak', false, 'text')).toBe(true);
    expect(isWhatsAppSalesRelevant('futbol yangiliklari', false, 'text')).toBe(false);
  });

  it('resolves compact typo/model forms and preserves family context on short follow-ups', () => {
    expect(bitoInventorySearchTerm('iphone13por bormi?')).toBe('iphone 13 pro');
    expect(bitoInventorySearchTerm('1.5ltr kere')).toBeUndefined();
    expect(bitoInventorySearchTerm('5ta olaman')).toBeUndefined();

    const first = updateUniversalSalesState(undefined, 'ayfon bormi');
    const second = updateUniversalSalesState(first, '13por kere');
    const third = updateUniversalSalesState(second, 'qorasi?');
    expect(third.product).toBe('iphone');
    expect(third.model).toBe('13 pro');
    expect(third.color).toBe('qora');
    expect(salesCatalogLookupQuery(third, '2ta')).toBe('iphone 13 pro qora');
  });

  it('keeps verified public price and calculates quantity totals deterministically', () => {
    let state = updateUniversalSalesState(undefined, 'iphone 13 pro bormi?');
    state = reconcileUniversalSalesStateFromInventory(state, {
      availabilityStatus: 'IN_STOCK',
      items: [{ name: 'Iphone 13 por', quantity: 3, price: 4_800_000 }],
    });
    state = updateUniversalSalesState(state, '2ta olsam qancha?');
    expect(state.unitPrice).toBe(4_800_000);
    expect(state.totalPrice).toBe(9_600_000);
    expect(state.lastIntent).toBe('PRICE');
  });

  it('understands a debounced split quantity/volume phrase as one semantic turn', () => {
    let state = updateUniversalSalesState(undefined, 'Coca Cola bormi?');
    state = updateUniversalSalesState(state, '1 litridan 5ta olaman');
    expect(state.variant).toBe('1L');
    expect(state.quantity).toBe(5);
  });

  it('keeps customer-selected unavailable variants instead of silently switching alternatives', () => {
    let state = updateUniversalSalesState(undefined, 'Coca Cola bormi?');
    state = reconcileUniversalSalesStateFromInventory(state, {
      availabilityStatus: 'IN_STOCK',
      items: [{ name: 'Coca Cola 1L', quantity: 5 }],
    });
    state = updateUniversalSalesState(state, '1.5 litr kere');
    expect(state.factStatus?.variant?.status).toBe('PROPOSED');

    const exhausted = reconcileUniversalSalesStateFromInventory(state, {
      availabilityStatus: 'OUT_OF_STOCK',
      outOfStockItems: [{ name: 'Coca Cola 1.5L', quantity: 0 }],
      familyAlternatives: [{ name: 'Coca Cola 1L', quantity: 5 }],
    });
    expect(exhausted.variant).toBe('1.5L');
    expect(exhausted.factStatus?.variant?.status).toBe('UNAVAILABLE');
    expect(exhausted.variant).not.toBe('1L');
    expect(planSalesNextAction(exhausted, '5ta olaman').nextBestAction).toBe('OFFER_ALTERNATIVE');
  });

  it('removes implementation language and hides unasked exact stock counts', () => {
    const state = updateUniversalSalesState(undefined, 'Coca Cola bormi?');
    const answer = customerSafeSalesAnswer(
      'Bito MCP tool orqali tekshirdim: omborda 472 dona mavjud. Operatorga qoldiraymi?',
      state,
    );
    expect(answer.toLowerCase()).not.toMatch(/bito|mcp|tool|operator|tekshirdim/);
    expect(answer).not.toContain('472');
  });

  it('extracts persistent customer-facing business sales facts from owner teaching messages', () => {
    expect(extractBusinessSalesProfilePatch("Do'kon manzilimiz Chilonzor 12-kvartal, 18-uy")).toMatchObject({
      storeAddress: 'Chilonzor 12-kvartal, 18-uy',
    });
    expect(extractBusinessSalesProfilePatch('Ish vaqtimiz 9:00–21:00')).toMatchObject({
      businessHours: '9:00–21:00',
    });
    expect(extractBusinessSalesProfilePatch("Naqd, karta, Click va Payme to'lovlarini qabul qilamiz").paymentMethods)
      .toEqual(expect.arrayContaining(['CASH', 'CARD', 'CLICK', 'PAYME']));
    expect(extractBusinessSalesProfilePatch("Toshkent bo'ylab yetkazamiz, 100 mingdan yuqori bepul dastavka")).toMatchObject({
      deliveryEnabled: true,
    });
    expect(extractBusinessSalesProfilePatch("Do'kon manzilimiz qayerda edi?")).toEqual({});
  });

  it('serializes one customer chat without cancelling a reply that is already being prepared', async () => {
    const prisma = {
      salesInboundReceipt: { create: jest.fn().mockResolvedValue({}) },
    } as never;
    const first = await reserveSalesInboundTurn(prisma, 'TELEGRAM', 'user-1', 'peer-1', '1');
    expect(first).not.toBeNull();

    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>(resolve => { releaseFirst = resolve; });
    const firstTask = runSalesTurnSequential(first!, async () => {
      order.push('first:start');
      await firstBlocked;
      // A later customer message must not abort this already-started reply.
      expect(first!.signal.aborted).toBe(false);
      order.push('first:end');
    });

    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await reserveSalesInboundTurn(prisma, 'TELEGRAM', 'user-1', 'peer-1', '2');
    expect(second).not.toBeNull();
    expect(first!.signal.aborted).toBe(false);
    expect(isSalesTurnCurrent(first!)).toBe(false); // newer pending turn exists
    expect(isSalesTurnCurrent(second!)).toBe(true);

    const secondTask = runSalesTurnSequential(second!, async () => {
      order.push('second:start');
      order.push('second:end');
    });
    releaseFirst();
    await Promise.all([firstTask, secondTask]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('coalesces quick text fragments before AI starts, without cancelling an in-flight seller reply', async () => {
    const prisma = { salesInboundReceipt: { create: jest.fn().mockResolvedValue({}) } } as never;
    const first = await reserveSalesInboundTurn(prisma, 'TELEGRAM', 'user-fragment', 'peer-fragment', '1');
    expect(first).not.toBeNull();
    bufferSalesTextFragment(first!, '1');
    const firstTask = runSalesTurnSequential(first!, async () => expect(await waitForSalesTurnDebounce(first!, 100)).toBe(false));
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await reserveSalesInboundTurn(prisma, 'TELEGRAM', 'user-fragment', 'peer-fragment', '2');
    expect(second).not.toBeNull();
    bufferSalesTextFragment(second!, 'litridan 5ta olaman');
    const secondTask = runSalesTurnSequential(second!, async () => {
      expect(await waitForSalesTurnDebounce(second!, 10)).toBe(true);
      expect(consumeSalesTextFragments(second!)).toBe('1\nlitridan 5ta olaman');
    });
    await Promise.all([firstTask, secondTask]);
  });

  it('finds a compact iPhone model through full-list fallback and typo normalization', async () => {
    const inventoryTool: BitoMcpTool = {
      name: BITO_INVENTORY_PRIMARY_TOOL,
      description: 'Paginated product stock list with current quantity',
      inputSchema: {
        type: 'object',
        properties: { page: { type: 'integer' }, limit: { type: 'integer', maximum: 200 }, search: { type: 'string' } },
      },
    };
    const rows = [
      { product: { name: 'Iphone 13 por', unit: { name: 'dona' } }, quantity: 3, price: 4_800_000 },
      { product: { name: 'Iphone 14', unit: { name: 'dona' } }, quantity: 2, price: 5_800_000 },
    ];
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([inventoryTool]),
      callToolForUser: jest.fn(async (_user: string, _tool: string, input: Record<string, unknown>) => {
        if (input.search) return { items: [], meta: { total: 0, page: 1 } };
        return { items: rows, meta: { total: rows.length, page: 1 } };
      }),
    };
    const activity = { record: jest.fn().mockResolvedValue({}) };
    const service = new BitoToolBridgeService(bito as never, activity as never, new ConfigService({ bito: { debugShapes: false } }));
    const result = await service.getFullInventorySnapshot('user-1', { search: 'iphone13pro' });
    expect(result.availabilityStatus).toBe('IN_STOCK');
    expect(result.items).toEqual([expect.objectContaining({ name: 'Iphone 13 por', quantity: 3 })]);
  });
});
