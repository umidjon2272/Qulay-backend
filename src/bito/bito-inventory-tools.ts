import type { BitoMcpTool } from './bito-mcp.client';
import { bitoToolSideEffect } from './bito-tool-policy';

/** Exact names copied from production BITO_TOOL_SCHEMA, ordered best first. */
export type BitoInventoryAllowlist = { products: readonly string[]; stock: readonly string[] };

export function selectInventoryTools(tools: BitoMcpTool[], allowlist: BitoInventoryAllowlist) {
  const eligible = tools.filter(tool => {
    const name = tool.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_./:-]+/g, ' ');
    // Even an erroneous allowlist entry must never admit a sales report.
    if (/(?:sales?|revenue|profit|savdo|sotuv|продаж|прибыл)/iu.test(name)) return false;
    if (bitoToolSideEffect(tool) !== 'READ') return false;
    const required = tool.inputSchema?.required;
    return !Array.isArray(required) || required.every(key => typeof key === 'string' && /^(?:page|pageNumber|pageIndex|offset|skip|limit|pageSize|perPage|take)$/i.test(key));
  });
  const pick = (names: readonly string[]) => names.map(name => eligible.find(tool => tool.name === name)).find(Boolean);
  const products = pick(allowlist.products), stock = pick(allowlist.stock);
  return products && stock ? { products, stock } : null;
}
