import type { BitoMcpTool } from './bito-mcp.client';

/**
 * Security boundary for dynamic Bito MCP tools.
 *
 * Bito entity names can themselves contain words such as `transfer`, `open`
 * and `write_off`, so treating those nouns as write verbs blocks legitimate
 * reads (for example internal_transfer_get_paging). We therefore classify by
 * explicit MCP annotations first, then by concrete operation tokens. Unknown
 * operations remain WRITE (fail closed).
 */
export function bitoToolSideEffect(tool: BitoMcpTool): 'READ' | 'WRITE' {
  if (tool.annotations?.destructiveHint === true) return 'WRITE';
  if (tool.annotations?.readOnlyHint === true) return 'READ';
  if (tool.annotations?.readOnlyHint === false) return 'WRITE';

  const name = normalizeToolName(tool.name);
  const tokens = new Set(name.split(' ').filter(Boolean));

  const writeOps = [
    'create', 'update', 'delete', 'remove', 'send', 'set', 'add', 'change', 'adjust', 'insert',
    'post', 'put', 'patch', 'confirm', 'cancel', 'refund', 'pay', 'archive', 'move', 'reserve',
    'release', 'issue', 'receive', 'produce', 'upload', 'attach', 'detach', 'approve', 'reject',
  ];
  if (writeOps.some(op => tokens.has(op))) return 'WRITE';

  const readOps = [
    'get', 'list', 'search', 'find', 'read', 'query', 'fetch', 'retrieve', 'lookup', 'view', 'show',
    'calculate', 'report', 'summary', 'analytics', 'statistics', 'paging', 'chart', 'top', 'health',
    'count', 'status',
  ];
  if (readOps.some(op => tokens.has(op))) return 'READ';

  const description = (tool.description ?? '').toLocaleLowerCase();
  if (/\b(?:write operation|destructive|creates?|updates?|deletes?|changes?|moves?|sends?|records? production)\b/iu.test(description)) return 'WRITE';
  if (/\b(?:returns?|fetches?|lists?|shows?|reports?|read-only|current stock|summary|analytics)\b/iu.test(description)) return 'READ';

  return 'WRITE';
}

function normalizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_./:-]+/g, ' ')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
