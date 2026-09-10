import {
  BITO_INVENTORY_FALLBACK_TOOL,
  BITO_INVENTORY_PRIMARY_TOOL,
  BITO_INVENTORY_SUMMARY_TOOL,
  selectVerifiedInventoryTools,
} from '../src/bito/bito-inventory-tools';

const tool = (name: string) => ({ name, inputSchema: { type: 'object', properties: {} } });

describe('verified Bito inventory route', () => {
  it('selects the production-verified current-stock list and optional summary', () => {
    const selected = selectVerifiedInventoryTools([
      tool(BITO_INVENTORY_SUMMARY_TOOL),
      tool(BITO_INVENTORY_PRIMARY_TOOL),
      tool('bito_report_sales_by_item_pagin'),
    ] as never);
    expect(selected?.list.name).toBe(BITO_INVENTORY_PRIMARY_TOOL);
    expect(selected?.summary?.name).toBe(BITO_INVENTORY_SUMMARY_TOOL);
  });

  it('uses the verified POS fallback only when the primary is absent', () => {
    expect(selectVerifiedInventoryTools([tool(BITO_INVENTORY_FALLBACK_TOOL)] as never)?.list.name).toBe(BITO_INVENTORY_FALLBACK_TOOL);
  });

  it.each([
    'bito_report_sales_by_item_pagin',
    'bito_report_sales_by_item_top',
    'bito_report_pos_product_top',
    'bito_production_order_get_paging',
  ])('never treats unrelated product/sales/production tools as current inventory: %s', (name) => {
    expect(selectVerifiedInventoryTools([tool(name)] as never)).toBeNull();
  });

  it('fails closed if a verified name is explicitly annotated as a write', () => {
    expect(selectVerifiedInventoryTools([{ ...tool(BITO_INVENTORY_PRIMARY_TOOL), annotations: { readOnlyHint: false } }] as never)).toBeNull();
  });
});
