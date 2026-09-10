import { bitoToolSideEffect } from '../src/bito/bito-tool-policy';

describe('Bito read/write boundary', () => {
  it.each([
    'bito_employee_get_paging',
    'bito_customer_get_by_id',
    'bito_internal_transfer_get_paging',
    'bito_write_off_get_paging',
    'bito_open_ticket_get_paging',
    'bito_report_dashboard_summary_product_chart_paging',
    'bito_report_pos_product_stock_summary',
  ])('executes provider reads without confirmation: %s', name => expect(bitoToolSideEffect({ name })).toBe('READ'));

  it.each([
    'bito_order_create',
    'bito_customer_update',
    'bito_product_delete',
    'bito_internal_transfer_receive',
    'bito_write_off_create',
    'bito_production_task_produce',
    'bito_file_attach',
    'custom_operation',
  ])('requires confirmation for writes or unknown operations: %s', name => expect(bitoToolSideEffect({ name, inputSchema: { type: 'object', properties: {} } })).toBe('WRITE'));

  it('destructive annotation wins over a contradictory read hint', () => {
    expect(bitoToolSideEffect({ name: 'bito_product_delete', annotations: { readOnlyHint: true, destructiveHint: true } })).toBe('WRITE');
  });

  it('honors an explicit provider read-only annotation', () => {
    expect(bitoToolSideEffect({ name: 'provider_ostatki', annotations: { readOnlyHint: true } })).toBe('READ');
  });
});
