import { unwrapBitoMcpResult } from '../src/bito/bito-mcp-payload';

const textResult = (...text: string[]) => ({ content: text.map(text => ({ type: 'text', text })) });

describe('Bito MCP text payloads', () => {
  const rows = [{ id: 1, name: 'Cola with } and [ in its name', quantity: 3 }];
  it.each([JSON.stringify(rows), '```json\n' + JSON.stringify(rows) + '\n```', 'Result follows:\n' + JSON.stringify(rows) + '\nEnd.'])('parses arrays with surrounding text/fences: %s', input => {
    expect(unwrapBitoMcpResult(textResult(input))).toEqual(rows);
  });
  it('retains separate metadata and prose without mixing either into rows', () => {
    expect(unwrapBitoMcpResult(textResult('Page results', '{"meta":{"totalPages":3,"hasMore":true}}', '```json\n' + JSON.stringify({ items: rows }) + '\n```'))).toEqual({
      mcpPayloads: [{ meta: { totalPages: 3, hasMore: true } }, { items: rows }], rawText: ['Page results'],
    });
  });
  it('ignores non-text content and uses sanitized fallback for malformed/plain text', () => {
    const result = unwrapBitoMcpResult({ content: [{ type: 'image', text: '[{"id":9}]' }, { type: 'text', text: 'Broken {json\u0000 token=private-token Authorization: Bearer private-bearer' }] });
    expect(JSON.stringify(result)).not.toMatch(/private-token|private-bearer|"id":9|\\u0000/);
    expect(result).toMatchObject({ mcpPayloads: [], rawText: [expect.stringContaining('Broken {json')] });
  });
  it('never evaluates JavaScript and redacts structured credentials', () => {
    const result = unwrapBitoMcpResult(textResult('(() => { throw new Error("must never execute"); })()', '{"items":[],"accessToken":"private-token"}'));
    expect(result).toMatchObject({ mcpPayloads: [{ items: [], accessToken: '[REDACTED]' }] });
  });
  it('prefers structuredContent, handles null structuredContent, and preserves empty collections', () => {
    expect(unwrapBitoMcpResult({ structuredContent: { items: [] }, ...textResult('ignored') })).toEqual({ items: [] });
    expect(unwrapBitoMcpResult({ structuredContent: null, ...textResult('[]') })).toEqual([]);
  });
});
