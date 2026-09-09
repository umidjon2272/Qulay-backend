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
