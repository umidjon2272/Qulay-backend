import type { BitoMcpTool } from './bito-mcp.client';

/** Unknown operations are writes. Filter-shaped arguments alone never prove safety. */
export function bitoToolSideEffect(tool: BitoMcpTool): 'READ' | 'WRITE' {
  const name = tool.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_./:-]/g, ' ').toLowerCase();
  if (tool.annotations?.destructiveHint === true
    || /(?:^|\s)(?:create|update|delete|remove|send|set|add|change|adjust|transfer|write|insert|post|put|patch|confirm|cancel|refund|pay|archive|move|reserve|release|close|open|issue|yarat|yangila|созд|удал|измен)(?:\s|$)/iu.test(name)) return 'WRITE';
  if (tool.annotations?.readOnlyHint === true) return 'READ';
  if (tool.annotations?.readOnlyHint === false) return 'WRITE';
  if (/^(?:(?:bito|erp|api)\s+)*(?:get|list|search|find|read|query|fetch|retrieve|lookup|view|show|calculate|report|summary|analytics|statistics)(?:\s|$)/iu.test(name)) return 'READ';
  if (/^(?:products?|catalog|stock|warehouse stock|warehouses?|prices?|sales|profit|revenue|reports?|customers?|analytics|inventory|balances?)(?:\s+(?:list|read|report|summary|balances?|statistics))?$/iu.test(name)) return 'READ';
  return 'WRITE';
}
