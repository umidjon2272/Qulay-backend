import { BitoToolBridgeService, BITO_INVENTORY_TOOL_NAME } from '../src/bito/bito-tool-bridge.service';
import type { BitoMcpTool } from '../src/bito/bito-mcp.client';

const schema = {
  type: 'object',
  properties: {
    page: { type: 'integer' },
    limit: { type: 'integer' },
  },
};

const productTool: BitoMcpTool = {
  name: 'list_products',
  description: 'List product catalog records',
  inputSchema: schema,
};
const stockTool: BitoMcpTool = {
  name: 'warehouse_stock',
  description: 'Get warehouse stock balances',
  inputSchema: schema,
};
const writeTool: BitoMcpTool = {
  name: 'create_order',
  description: 'Create a new sales order',
  inputSchema: { type: 'object', properties: { customerId: { type: 'string' } }, required: ['customerId'] },
};

describe('BitoToolBridgeService', () => {
  it('reloads tools for each user and does not retain a disconnected tool list', async () => {
    const bito = { listToolsForUser: jest.fn().mockResolvedValueOnce([productTool]).mockResolvedValueOnce([stockTool]).mockRejectedValueOnce(new Error('BITO_NOT_CONNECTED')) };
    const service = new BitoToolBridgeService(bito as never, {} as never);
    expect((await service.listModelTools('a'))[0].name).toContain('list_products');
    expect((await service.listModelTools('b'))[0].name).toContain('warehouse_stock');
    await expect(service.listModelTools('a')).rejects.toThrow('BITO_NOT_CONNECTED');
    expect(bito.listToolsForUser.mock.calls).toEqual([['a'], ['b'], ['a']]);
  });

  it('fetches all 78 catalog records and all 46 stock positions (synthetic schema fixture)', async () => {
    const products = Array.from({ length: 78 }, (_, id) => ({ id, name: `Product ${id}` }));
    const stocks = Array.from({ length: 46 }, (_, id) => ({ id: id + 1000, product_id: id, quantity: id + 1, unit: 'dona' }));
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([productTool, stockTool]),
      callToolForUser: jest.fn(async (_user: string, tool: string, input: Record<string, unknown>) => {
        const rows = tool === productTool.name ? products : stocks;
        const page = Number(input.page);
        return { structuredContent: { items: rows.slice((page - 1) * 20, page * 20), pagination: { total: rows.length, page, hasMore: page * 20 < rows.length } } };
      }),
    };
    const service = new BitoToolBridgeService(bito as never, {} as never);
    const result = await service.getFullInventorySnapshot('a');
    expect(result).toMatchObject({ productCount: 78, stockPositionCount: 46, complete: true });
    expect(result.items).toHaveLength(46);
    expect(bito.callToolForUser).toHaveBeenCalledTimes(7);
  });

  it.each(['cursor', 'offset'])('fully collects %s pages', async mode => {
    const tool = { name: 'list_products', inputSchema: { type: 'object', properties: { [mode]: { type: mode === 'cursor' ? 'string' : 'integer' }, limit: { type: 'integer', maximum: 2 } } } };
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([tool]),
      callToolForUser: jest.fn(async (_user: string, _tool: string, input: Record<string, unknown>) => input[mode]
        ? { items: [{ id: 3 }], meta: { total: 3, hasMore: false, nextCursor: null } }
        : { items: [{ id: 1 }, { id: 2 }], meta: { total: 3, hasMore: true, ...(mode === 'cursor' ? { nextCursor: 'opaque-page-2' } : {}) } }),
    };
    const service = new BitoToolBridgeService(bito as never, {} as never);
    const [modelTool] = await service.listModelTools('a');
    const result = await service.execute('a', modelTool.name, {}, false, 'r');
    expect(result).toMatchObject({ status: 'success', data: { recordCount: 3, complete: true } });
    expect(bito.callToolForUser.mock.calls[1][2]).toMatchObject({ [mode]: mode === 'cursor' ? 'opaque-page-2' : 2, limit: 2 });
  });

  it('rejects repeated pages and partial mappings instead of reporting success', async () => {
    const bito = { listToolsForUser: jest.fn().mockResolvedValue([productTool, stockTool]), callToolForUser: jest.fn().mockResolvedValue({ items: [{ id: 1, name: 'Cola' }], meta: { total: 78 } }) };
    const service = new BitoToolBridgeService(bito as never, {} as never);
    await expect(service.getFullInventorySnapshot('a')).rejects.toThrow('BITO_PAGINATION_FAILED');
    bito.callToolForUser.mockImplementation(async (_user: string, tool: string) => ({ items: tool === productTool.name ? [{ id: 1, name: 'Cola' }] : [{ id: 1, product_id: 'unmatched', quantity: 3 }], meta: { total: 1 } }));
    await expect(service.getFullInventorySnapshot('a')).rejects.toThrow('BITO_MAPPING_FAILED');
  });

  it('does not call a write before confirmation', async () => {
    const bito = { listToolsForUser: jest.fn().mockResolvedValue([writeTool]), callToolForUser: jest.fn().mockResolvedValue({ ok: true }) };
    const service = new BitoToolBridgeService(bito as never, { record: jest.fn().mockResolvedValue({}) } as never);
    const [tool] = await service.listModelTools('a');
    expect((await service.execute('a', tool.name, { customerId: 'c' }, false, 'r')).status).toBe('confirmation_required');
    expect(bito.callToolForUser).not.toHaveBeenCalled();
    expect((await service.execute('a', tool.name, { customerId: 'c' }, true, 'r')).status).toBe('success');
    expect(bito.callToolForUser).toHaveBeenCalledTimes(1);
  });
  it('exposes Bito reads without confirmation and keeps writes behind confirmation', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([productTool, stockTool, writeTool]),
      callToolForUser: jest.fn(),
    };
    const service = new BitoToolBridgeService(bito as never, { record: jest.fn() } as never);

    const tools = await service.listModelTools('user-1');
    expect(tools.find((tool) => tool.name === BITO_INVENTORY_TOOL_NAME)).toMatchObject({
      sideEffect: 'READ',
      requiresConfirmation: false,
    });
    expect(tools.find((tool) => tool.name.includes('list_products'))).toMatchObject({ sideEffect: 'READ', requiresConfirmation: false });
    expect(tools.find((tool) => tool.name.includes('warehouse_stock'))).toMatchObject({ sideEffect: 'READ', requiresConfirmation: false });
    expect(tools.find((tool) => tool.name.includes('create_order'))).toMatchObject({ sideEffect: 'WRITE', requiresConfirmation: true });
  });

  it('auto-paginates products and stock, joins Product ID internally, and returns names', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([productTool, stockTool]),
      callToolForUser: jest.fn(async (_userId: string, toolName: string, input: Record<string, unknown>) => {
        const page = Number(input.page ?? 1);
        if (toolName === 'list_products') {
          const items = page === 1
            ? [{ id: 1, name: 'Coca-Cola' }, { id: 2, name: 'Shaftoli' }]
            : [{ id: 3, name: 'Pepsi' }];
          return { content: [{ type: 'text', text: JSON.stringify({ items, meta: { page, total: 3, totalPages: 2 } }) }] };
        }
        const items = page === 1
          ? [{ product_id: 1, quantity: 499, unit: 'dona' }, { product_id: 2, quantity: 30, unit: 'kg' }]
          : [{ product_id: 3, quantity: 0, unit: 'dona' }];
        return { content: [{ type: 'text', text: JSON.stringify({ items, meta: { page, total: 3, totalPages: 2 } }) }] };
      }),
    };
    const service = new BitoToolBridgeService(bito as never, { record: jest.fn() } as never);

    const result = await service.execute('user-1', BITO_INVENTORY_TOOL_NAME, {}, false, 'req-1');
    expect(result.status).toBe('success');
    const data = result.status === 'success' ? result.data as { productCount: number; stockPositionCount: number; items: Array<Record<string, unknown>> } : null;
    expect(data?.productCount).toBe(3);
    expect(data?.stockPositionCount).toBe(3);
    expect(data?.items).toEqual([
      { name: 'Coca-Cola', quantity: 499, unit: 'dona' },
      { name: 'Shaftoli', quantity: 30, unit: 'kg' },
    ]);
    expect(JSON.stringify(data)).not.toContain('product_id');
    expect(bito.callToolForUser).toHaveBeenCalledTimes(4);
  });

  it('does not confuse a stock-row id with the product id and can join UUID/code aliases', async () => {
    const productsByUuid: BitoMcpTool = {
      name: 'list_products',
      description: 'List product catalog records',
      inputSchema: schema,
    };
    const stockByUuid: BitoMcpTool = {
      name: 'warehouse_stock',
      description: 'Get warehouse stock balances',
      inputSchema: schema,
    };
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([productsByUuid, stockByUuid]),
      callToolForUser: jest.fn(async (_userId: string, toolName: string) => {
        if (toolName === 'list_products') {
          return { content: [{ type: 'text', text: JSON.stringify({ items: [
            { id: 9001, uuid: 'prod-cola', name: 'Coca-Cola' },
            { id: 9002, product_code: 'SHAFTOLI-1', name: 'Shaftoli' },
          ], meta: { page: 1, total: 2, totalPages: 1 } }) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ items: [
          { id: 9002, product_uuid: 'prod-cola', quantity: 499, unit: 'dona' },
          { id: 7777, product_code: 'SHAFTOLI-1', quantity: 30, unit: 'kg' },
        ], meta: { page: 1, total: 2, totalPages: 1 } }) }] };
      }),
    };
    const service = new BitoToolBridgeService(bito as never, { record: jest.fn() } as never);

    const result = await service.execute('user-1', BITO_INVENTORY_TOOL_NAME, { includeZero: true }, false, 'req-uuid');
    expect(result.status).toBe('success');
    const data = result.status === 'success' ? result.data as { items: Array<Record<string, unknown>> } : null;
    expect(data?.items).toEqual([
      { name: 'Coca-Cola', quantity: 499, unit: 'dona' },
      { name: 'Shaftoli', quantity: 30, unit: 'kg' },
    ]);
  });

});
