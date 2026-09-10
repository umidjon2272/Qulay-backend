import { selectRelevantBitoTools } from '../src/bito/bito-tool-selector';

const read = (name: string, description = '') => ({ name, description, annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' } } } });
const write = (name: string, description = '') => ({ name, description, annotations: { readOnlyHint: false }, inputSchema: { type: 'object', properties: {} } });
const registry = [
  read('bito_employee_get_paging', 'Paginated employees and staff'),
  read('bito_employee_get_by_id', 'One employee by id'),
  read('bito_customer_get_paging', 'Paginated customers'),
  read('bito_supplier_get_paging', 'Paginated suppliers'),
  read('bito_purchase_get_paging', 'Paginated purchases'),
  read('bito_report_pos_sale_summary', 'POS sales summary'),
  read('bito_report_pos_product_top', 'Top-selling POS products'),
  read('bito_report_dashboard_summary_product_chart_paging', 'Current product stock list'),
  read('bito_report_dashboard_summary_profit', 'Profit summary'),
  read('bito_report_dashboard_summary_debt_paging', 'Customer debts'),
  read('bito_production_task_get_paging', 'Production tasks'),
  read('bito_internal_transfer_get_paging', 'Warehouse transfer history'),
  read('bito_revision_get_paging', 'Warehouse revisions'),
  read('bito_device_get_paging', 'Devices'),
  read('bito_kpi_settings_get_paging', 'KPI settings'),
  read('bito_reason_get_paging', 'Reasons'),
  read('bito_pipeline_action_get_paging', 'Pipeline actions'),
  read('bito_sms_template_get_paging', 'SMS templates'),
  read('bito_export_records_get_paging', 'Export records'),
  read('bito_states_settings_get_paging', 'State settings'),
  write('bito_order_create', 'Create order'),
  write('bito_internal_transfer_create', 'Create warehouse transfer'),
  write('bito_employee_update', 'Update employee'),
] as never;

describe('query-scoped Bito MCP selector', () => {
  it.each([
    ['xodimlarni ko‘rsat', 'bito_employee_get_paging'],
    ['mijozlar ro‘yxati', 'bito_customer_get_paging'],
    ['yetkazib beruvchilarni ayt', 'bito_supplier_get_paging'],
    ['xaridlar ro‘yxati', 'bito_purchase_get_paging'],
    ['bugungi savdo qancha', 'bito_report_pos_sale_summary'],
    ['qarzdor mijozlarni ko‘rsat', 'bito_report_dashboard_summary_debt_paging'],
    ['ishlab chiqarish topshiriqlari', 'bito_production_task_get_paging'],
    ['transferlar tarixini ko‘rsat', 'bito_internal_transfer_get_paging'],
    ['reviziyalarni ko‘rsat', 'bito_revision_get_paging'],
    ['qurilmalarni ko‘rsat', 'bito_device_get_paging'],
    ['KPI sozlamalarini ko‘rsat', 'bito_kpi_settings_get_paging'],
    ['Bito sabablarini ko‘rsat', 'bito_reason_get_paging'],
    ['Bito pipeline amallarini ko‘rsat', 'bito_pipeline_action_get_paging'],
    ['Bito SMS shablonlarini ko‘rsat', 'bito_sms_template_get_paging'],
    ['Bito eksportlarini ko‘rsat', 'bito_export_records_get_paging'],
    ['Bito holat sozlamalarini ko‘rsat', 'bito_states_settings_get_paging'],
  ])('finds the relevant live READ tool for %s', (query, expected) => {
    const selected = selectRelevantBitoTools(registry, query as string, 8).tools.map(tool => tool.name);
    expect(selected).toContain(expected);
  });

  it('does not expose writes to a read-only request', () => {
    const selected = selectRelevantBitoTools(registry, 'xodimlarni ko‘rsat', 20).tools.map(tool => tool.name);
    expect(selected).not.toContain('bito_employee_update');
    expect(selected).not.toContain('bito_order_create');
  });

  it('can expose an intended write plus related reads for safe ID resolution', () => {
    const selected = selectRelevantBitoTools(registry, 'Bito order yarat', 20).tools.map(tool => tool.name);
    expect(selected).toContain('bito_order_create');
  });

  it('recognizes non-CRUD Bito write wording such as transfer qil', () => {
    const selected = selectRelevantBitoTools(registry, 'Bito transfer qil', 20).tools.map(tool => tool.name);
    expect(selected).toContain('bito_internal_transfer_create');
  });

  it('does not leak unrelated READ tools into a known domain with no MCP capability', () => {
    const onlyReports = [
      read('bito_report_dashboard_summary', 'General dashboard summary'),
      read('bito_report_analysis_abc_by_product', 'Product ABC thresholds and profit share'),
    ] as never;
    expect(selectRelevantBitoTools(onlyReports, 'yetkazib beruvchilarni ko‘rsat', 8).tools).toEqual([]);
  });

  it('does not match the short hr token inside unrelated description words', () => {
    const tools = [
      read('bito_report_analysis_abc_by_product', 'Threshold-based product share report'),
      read('bito_employee_get_paging', 'Employees'),
    ] as never;
    expect(selectRelevantBitoTools(tools, 'xodimlarni ko‘rsat', 8).tools.map(tool => tool.name)).toEqual(['bito_employee_get_paging']);
  });

  it('prefers a paging/search read over get_by_id when the user did not supply an id', () => {
    const selected = selectRelevantBitoTools(registry, 'xodimlarni ko‘rsat', 2).tools.map(tool => tool.name);
    expect(selected[0]).toBe('bito_employee_get_paging');
  });

  it('keeps domain-scoped writes isolated from unrelated create operations', () => {
    const selected = selectRelevantBitoTools(registry, 'Bito transfer qil', 20).tools.map(tool => tool.name);
    expect(selected).toContain('bito_internal_transfer_create');
    expect(selected).not.toContain('bito_order_create');
  });

  it('does not offer inventory/production tools for a top-selling product question', () => {
    const selected = selectRelevantBitoTools(registry, 'eng ko‘p sotilgan mahsulot qaysi', 20).tools.map(tool => tool.name);
    expect(selected[0]).toBe('bito_report_pos_product_top');
    expect(selected).not.toContain('bito_report_dashboard_summary_product_chart_paging');
    expect(selected).not.toContain('bito_production_task_get_paging');
  });

});
