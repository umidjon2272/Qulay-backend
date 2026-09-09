import { bitoToolSideEffect } from '../src/bito/bito-tool-policy';

describe('Bito read/write boundary', () => {
  it.each(['list_products', 'warehouse_stock', 'get_prices', 'get_sales', 'profit', 'get_reports', 'list_customers', 'analytics', 'get_payment_report', 'get_expenses'])('reads automatically: %s', name => expect(bitoToolSideEffect({ name })).toBe('READ'));
  it.each(['create_order', 'update_order', 'create_customer', 'stock_transfer', 'delete_product', 'expense_create', 'custom_operation'])('confirms writes or unknown operations: %s', name => expect(bitoToolSideEffect({ name, inputSchema: { type: 'object', properties: { id: { type: 'string' } } } })).toBe('WRITE'));
  it('rejects contradictory safety hints', () => expect(bitoToolSideEffect({ name: 'delete_product', annotations: { readOnlyHint: true, destructiveHint: true } })).toBe('WRITE'));
  it('honors a read hint on an unfamiliar provider name', () => expect(bitoToolSideEffect({ name: 'ostatki', annotations: { readOnlyHint: true } })).toBe('READ'));
});
