// Opt-in diagnostics contain structure only. Never log payloads, headers, names,
// identifiers, cursor values, URLs, credentials, or provider error messages.
const safeKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) && !/token|secret|password|authorization|api.?key|email|phone/i.test(key);
const kind = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
export function bitoSchemaShape(value: unknown, depth = 0): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 7) return undefined;
  const schema = value as Record<string, unknown>;
  const types = ['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'];
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, unknown> : {};
  return {
    type: typeof schema.type === 'string' && types.includes(schema.type) ? schema.type : undefined,
    required: Array.isArray(schema.required) ? schema.required.filter(key => typeof key === 'string' && safeKey(key)) : undefined,
    properties: Object.fromEntries(Object.keys(properties).filter(safeKey).slice(0, 80).map(key => [key, bitoSchemaShape(properties[key], depth + 1)])),
    items: bitoSchemaShape(schema.items, depth + 1),
    minimum: typeof schema.minimum === 'number' ? schema.minimum : undefined,
    maximum: typeof schema.maximum === 'number' ? schema.maximum : undefined,
  };
}
export function bitoResponseShape(value: unknown) {
  const nodes: Array<Record<string, unknown>> = [];
  const walk = (node: unknown, path: string, depth: number) => {
    if (depth > 8 || nodes.length >= 100) return;
    if (Array.isArray(node)) {
      const fields = new Set<string>();
      for (const row of node.slice(0, 10)) if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).filter(safeKey).forEach(key => fields.add(key));
      nodes.push({ path, type: 'array', length: node.length, rowFields: [...fields].sort() });
      // Inspect one row's structure; never its scalar values.
      if (node.length) walk(node[0], `${path}[]`, depth + 1);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const keys = Object.keys(record).filter(safeKey).slice(0, 80);
    nodes.push({ path, keys, fields: Object.fromEntries(keys.map(key => [key, kind(record[key])])) });
    for (const key of keys) {
      const item = record[key];
      if (key === 'text' && typeof item === 'string' && item.length <= 2_000_000) {
        try { walk(JSON.parse(item), `${path}.parsedText`, depth + 1); } catch { /* prose is never logged */ }
      } else if (item && typeof item === 'object') walk(item, `${path}.${key}`, depth + 1);
      else if (/^(?:next|nextCursor|next_cursor|cursor|hasMore|has_more|page|pageSize|page_size|offset|limit|total|totalPages|total_pages)$/.test(key)) {
        nodes.push({ path: `${path}.${key}`, present: item !== null && item !== undefined, type: kind(item),
          ...(typeof item === 'boolean' ? { flag: item } : {}),
          ...(typeof item === 'number' && Number.isFinite(item) && !path.replace(/\.content\[\]/g, '').includes('[]') && !/cursor|next/i.test(key)
            && (!/total/i.test(key) || /\.(?:meta|pagination|paging|pageInfo)$/.test(path) || Object.values(record).some(Array.isArray)) ? { count: item } : {}) });
      }
    }
  };
  walk(value, '$', 0);
  return nodes;
}
