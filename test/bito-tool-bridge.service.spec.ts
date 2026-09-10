import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitoToolBridgeService, BITO_INVENTORY_TOOL_NAME } from '../src/bito/bito-tool-bridge.service';
import {
  BITO_INVENTORY_PRIMARY_TOOL,
  BITO_INVENTORY_SUMMARY_TOOL,
} from '../src/bito/bito-inventory-tools';
import type { BitoMcpTool } from '../src/bito/bito-mcp.client';

const config = new ConfigService({ bito: { debugShapes: false } });
const pagedSchema = {
  type: 'object',
  properties: { page: { type: 'integer' }, limit: { type: 'integer', maximum: 200 }, search: { type: 'string' } },
};
const inventoryTool: BitoMcpTool = {
  name: BITO_INVENTORY_PRIMARY_TOOL,
  description: 'Paginated product stock list with current quantity and cost',
  inputSchema: pagedSchema,
};
const summaryTool: BitoMcpTool = {
  name: BITO_INVENTORY_SUMMARY_TOOL,
  description: 'Returns total product count and stock cost',
  inputSchema: { type: 'object', properties: {} },
};
const employeeTool: BitoMcpTool = {
  name: 'bito_employee_get_paging',
  description: 'Paginated employee list',
  inputSchema: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer', maximum: 2 } } },
};
const writeTool: BitoMcpTool = {
  name: 'bito_order_create',
  description: 'Create a new sales order',
  inputSchema: { type: 'object', properties: { customer_id: { type: 'string' } }, required: ['customer_id'] },
};

function activity() { return { record: jest.fn().mockResolvedValue({}) } as never; }

describe('BitoToolBridgeService', () => {
  it('uses the production-verified current-stock tool, unwraps MCP text and paginates to completion', async () => {
    const logger = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const bito = {
        listToolsForUser: jest.fn().mockResolvedValue([inventoryTool]),
        callToolForUser: jest.fn(async (_user: string, tool: string, input: Record<string, unknown>) => {
          expect(tool).toBe(BITO_INVENTORY_PRIMARY_TOOL);
          const page = Number(input.page);
          const limit = Number(input.limit);
          const count = page === 1 ? 200 : 1;
          const rows = Array.from({ length: count }, (_, index) => ({
            row_id: `${page}-${index}`,
            product: { name: `Private product ${(page - 1) * limit + index}`, unit: { name: 'dona' } },
            quantity: index === 0 && page === 1 ? 0 : 12,
            cost: 100,
          }));
          return { content: [
            { type: 'text', text: 'metadata ```json\n' + JSON.stringify({ meta: { total: 201, page, totalPages: 2 } }) + '\n```' },
            { type: 'text', text: '```json\n' + JSON.stringify({ items: rows }) + '\n```' },
          ] };
        }),
      };
      const diagnosticConfig = new ConfigService({ bito: { debugShapes: true } });
      const service = new BitoToolBridgeService(bito as never, activity(), diagnosticConfig);
      const result = await service.getFullInventorySnapshot('u', { includeZero: true });
      expect(result.totalPositions).toBe(201);
      expect(result.items).toHaveLength(201);
      expect(result.items[0]).toMatchObject({ name: 'Private product 0', quantity: 0, unit: 'dona', cost: 100 });
      expect(bito.callToolForUser.mock.calls.map(call => call[2])).toEqual([{ page: 1, limit: 200 }, { page: 2, limit: 200 }]);
      const logs = JSON.stringify(logger.mock.calls);
      for (const event of ['BITO_SELECTED_TOOL', 'BITO_UNWRAPPED_PAYLOAD_SHAPE', 'BITO_PAGINATION_META', 'BITO_INVENTORY_NORMALIZATION']) expect(logs).toContain(event);
      expect(logs).not.toMatch(/Private product|\"quantity\":12|\"cost\":100/);
    } finally { logger.mockRestore(); }
  });

  it('does not mistake a monetary root total for pagination record count', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([inventoryTool]),
      callToolForUser: jest.fn().mockResolvedValue({
        total: 9_500_000,
        items: [
          { row_id: 'a', product: { name: 'Cola', unit: { name: 'dona' } }, quantity: 7 },
          { row_id: 'b', product: { name: 'Fanta', unit: { name: 'dona' } }, quantity: 3 },
        ],
        page: 1,
      }),
    };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    const result = await service.getFullInventorySnapshot('u');
    expect(result.totalPositions).toBe(2);
    expect(result.items).toHaveLength(2);
    // page=1 + limit=200 yields only two rows, so root `total` must be treated
    // as a business aggregate rather than 9.5M records to paginate through.
    expect(bito.callToolForUser).toHaveBeenCalledTimes(1);
  });

  it('uses provider-side search when supported and never asks for confirmation for inventory READ', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([inventoryTool]),
      callToolForUser: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ items: [{ name: 'Coca-Cola', quantity: 9, unit: 'dona' }], meta: { total: 1, page: 1, totalPages: 1 } }) }] }),
    };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    const result = await service.execute('u', BITO_INVENTORY_TOOL_NAME, { search: 'Cola' }, false, 'r');
    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.data).toMatchObject({ matchedCount: 1, items: [{ name: 'Coca-Cola', quantity: 9, unit: 'dona' }] });
    expect(bito.callToolForUser).toHaveBeenCalledWith('u', BITO_INVENTORY_PRIMARY_TOOL, expect.objectContaining({ page: 1, limit: 200, search: 'Cola' }), true);
  });

  it('keeps a safe business-row fallback if Bito changes a display field instead of inventing a mapping', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([inventoryTool]),
      callToolForUser: jest.fn().mockResolvedValue({ structuredContent: { items: [{ _id: 'opaque-secret-id', display_label_new: 'Tea', qty_new: 5 }], meta: { total: 1, page: 1 } } }),
    };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    const result = await service.getFullInventorySnapshot('u', { includeZero: true });
    expect(result.items).toEqual([]);
    expect(result.unmappedCount).toBe(1);
    expect(result.rawRows).toEqual([{ display_label_new: 'Tea', qty_new: 5 }]);
    expect(JSON.stringify(result)).not.toContain('opaque-secret-id');
  });

  it('never substitutes sales/production tools when the verified inventory tool is absent', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([
        { name: 'bito_report_sales_by_item_pagin' },
        { name: 'bito_report_pos_product_top' },
        { name: 'bito_production_order_get_paging' },
      ]),
      callToolForUser: jest.fn(),
    };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    await expect(service.getFullInventorySnapshot('u')).rejects.toThrow('BITO_INVENTORY_TOOLS_UNAVAILABLE');
    expect(bito.callToolForUser).not.toHaveBeenCalled();
  });

  it('uses the optional summary independently; summary failure does not hide a valid stock list', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([inventoryTool, summaryTool]),
      callToolForUser: jest.fn(async (_user: string, name: string) => {
        if (name === BITO_INVENTORY_SUMMARY_TOOL) throw new Error('BITO_MCP_HTTP_500');
        return { items: [{ name: 'Shaftoli', quantity: 30, unit: 'kg' }], meta: { total: 1, page: 1 } };
      }),
    };
    const result = await new BitoToolBridgeService(bito as never, activity(), config).getFullInventorySnapshot('u', { includeSummary: true });
    expect(result.items).toEqual([{ name: 'Shaftoli', quantity: 30, unit: 'kg' }]);
    expect(result.summary).toBeUndefined();
  });

  it('does not call the aggregate summary for a normal inventory list request', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([inventoryTool, summaryTool]),
      callToolForUser: jest.fn(async (_user: string, name: string) => {
        if (name === BITO_INVENTORY_SUMMARY_TOOL) throw new Error('SUMMARY_SHOULD_NOT_BE_CALLED');
        return { items: [{ name: 'Shaftoli', quantity: 30, unit: 'kg' }], meta: { total: 1, page: 1 } };
      }),
    };
    const result = await new BitoToolBridgeService(bito as never, activity(), config).getFullInventorySnapshot('u');
    expect(result.items).toEqual([{ name: 'Shaftoli', quantity: 30, unit: 'kg' }]);
    expect(bito.callToolForUser).toHaveBeenCalledTimes(1);
  });

  it('auto-paginates generic Bito READ domains such as employees', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([employeeTool]),
      callToolForUser: jest.fn(async (_user: string, _name: string, input: Record<string, unknown>) => Number(input.page) === 1
        ? { items: [{ id: 'e1', name: 'A' }, { id: 'e2', name: 'B' }], meta: { total: 3, page: 1, totalPages: 2 } }
        : { items: [{ id: 'e3', name: 'C' }], meta: { total: 3, page: 2, totalPages: 2 } }),
    };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    const [modelTool] = await service.listRelevantModelTools('u', 'xodimlarni ko‘rsat');
    expect(modelTool.name).toContain('bito__bito_employee_get_paging');
    expect(modelTool.requiresConfirmation).toBe(false);
    const result = await service.execute('u', modelTool.name, {}, false, 'r');
    expect(result).toMatchObject({ status: 'success', data: { complete: true, recordCount: 3, pagesFetched: 2 } });
  });

  it('never calls a Bito write before confirmation', async () => {
    const bito = { listToolsForUser: jest.fn().mockResolvedValue([writeTool]), callToolForUser: jest.fn().mockResolvedValue({ ok: true }) };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    const [tool] = await service.listRelevantModelTools('u', 'Bito order yarat');
    expect(tool).toMatchObject({ sideEffect: 'WRITE', requiresConfirmation: true });
    expect((await service.execute('u', tool.name, { customer_id: 'c' }, false, 'r')).status).toBe('confirmation_required');
    expect(bito.callToolForUser).not.toHaveBeenCalled();
    expect((await service.execute('u', tool.name, { customer_id: 'c' }, true, 'r')).status).toBe('success');
    expect(bito.callToolForUser).toHaveBeenCalledTimes(1);
  });

  it('keeps a short user-scoped tool-schema cache without sharing another account registry', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValueOnce([employeeTool]).mockResolvedValueOnce([{ ...employeeTool, name: 'bito_customer_get_paging' }]),
    };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    expect((await service.listRelevantModelTools('a', 'xodimlar'))[0].name).toContain('employee');
    expect((await service.listRelevantModelTools('b', 'mijozlar'))[0].name).toContain('customer');
    expect((await service.listRelevantModelTools('a', 'xodimlar'))[0].name).toContain('employee');
    expect(bito.listToolsForUser.mock.calls).toEqual([['a'], ['b']]);
  });

  it('drops the cached schema after an auth failure so reconnect can refresh capabilities', async () => {
    const bito = {
      listToolsForUser: jest.fn().mockResolvedValue([employeeTool]),
      callToolForUser: jest.fn().mockRejectedValueOnce(new Error('BITO_AUTH_FAILED')).mockResolvedValueOnce({ items: [] }),
    };
    const service = new BitoToolBridgeService(bito as never, activity(), config);
    const [tool] = await service.listRelevantModelTools('u', 'xodimlarni ko‘rsat');
    await expect(service.execute('u', tool.name, {}, false, 'r1')).rejects.toThrow('BITO_AUTH_FAILED');
    await service.listRelevantModelTools('u', 'xodimlarni ko‘rsat');
    expect(bito.listToolsForUser).toHaveBeenCalledTimes(2);
  });
});
