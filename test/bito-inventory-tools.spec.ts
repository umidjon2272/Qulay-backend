import { selectInventoryTools } from '../src/bito/bito-inventory-tools';

// All fixture_* tools below are synthetic, not production tool names.
const read = (name: string) => ({ name, annotations: { readOnlyHint: true } });
describe('exact inventory allowlist', () => {
  it('never discovers a route by fuzzy name or description matching', () => {
    expect(selectInventoryTools([read('fixture_products'), read('fixture_stock')], { products: [], stock: [] })).toBeNull();
  });
  it('uses configured ranking independent of discovery order and requires live tools', () => {
    const tools = [read('fixture_stock'), read('fixture_products_fallback'), read('fixture_products')];
    const allowlist = { products: ['fixture_products', 'fixture_products_fallback'], stock: ['fixture_stock'] };
    expect(selectInventoryTools(tools, allowlist)?.products.name).toBe('fixture_products');
    expect(selectInventoryTools(tools.slice(0, 2), allowlist)?.products.name).toBe('fixture_products_fallback');
    expect(selectInventoryTools([], allowlist)).toBeNull();
  });
  it.each(['bito_report_sales_by_item_pagin', 'bito_report_sales_by_item_top'])('rejects the observed wrong production tool even if mistakenly allowlisted: %s', name => {
    expect(selectInventoryTools([read(name), read('fixture_stock')], { products: [name], stock: ['fixture_stock'] })).toBeNull();
  });
  it('rejects writes and unknown required business inputs', () => {
    for (const product of [{ ...read('fixture_products'), annotations: { readOnlyHint: false } }, { ...read('fixture_products'), inputSchema: { required: ['warehouseId'] } }]) {
      expect(selectInventoryTools([product, read('fixture_stock')], { products: ['fixture_products'], stock: ['fixture_stock'] })).toBeNull();
    }
  });
});
