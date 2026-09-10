import type { BitoMcpTool } from './bito-mcp.client';
import { bitoToolSideEffect } from './bito-tool-policy';

/** Exact names verified from production BITO_TOOL_SCHEMA on 2026-09-10. */
export const BITO_INVENTORY_PRIMARY_TOOL = 'bito_report_dashboard_summary_product_chart_paging';
export const BITO_INVENTORY_SUMMARY_TOOL = 'bito_report_pos_product_stock_summary';
export const BITO_INVENTORY_FALLBACK_TOOL = 'bito_report_pos_summary_product_chart_paging';

export type VerifiedInventoryTools = {
  list: BitoMcpTool;
  summary?: BitoMcpTool;
};

/**
 * Inventory is deliberately exact, not fuzzy. Production evidence shows that
 * Bito exposes current product stock in one paginated report; a separate
 * catalog↔stock pair is not required and was the source of the previous bug.
 */
export function selectVerifiedInventoryTools(tools: BitoMcpTool[]): VerifiedInventoryTools | null {
  const readByName = new Map(tools.filter(tool => bitoToolSideEffect(tool) === 'READ').map(tool => [tool.name, tool]));
  const list = readByName.get(BITO_INVENTORY_PRIMARY_TOOL) ?? readByName.get(BITO_INVENTORY_FALLBACK_TOOL);
  if (!list) return null;
  return { list, ...(readByName.get(BITO_INVENTORY_SUMMARY_TOOL) ? { summary: readByName.get(BITO_INVENTORY_SUMMARY_TOOL)! } : {}) };
}

export function isVerifiedInventoryToolName(name: string): boolean {
  return name === BITO_INVENTORY_PRIMARY_TOOL || name === BITO_INVENTORY_FALLBACK_TOOL || name === BITO_INVENTORY_SUMMARY_TOOL;
}
