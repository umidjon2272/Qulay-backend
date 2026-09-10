import { BitoMcpClient } from '../src/bito/bito-mcp.client';
import { Logger } from '@nestjs/common';

describe('Bito MCP transport', () => {
  let fetchMock: jest.Mock, client: BitoMcpClient;
  const credentials = { serverUrl: 'https://mcp.example.test', authMode: 'BEARER' as const, accessToken: 'private-token' };
  const reply = (id: number, result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200 });
  beforeEach(() => {
    fetchMock = jest.fn(async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.method === 'server/discover') return new Response('', { status: 404 });
      if (request.method === 'initialize') return reply(request.id, { protocolVersion: '2025-06-18' });
      if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (request.method === 'tools/list') return reply(request.id, request.params.cursor ? { tools: [{ name: 'get_stock' }] } : { tools: [{ name: 'get_products' }], nextCursor: 'page-2' });
      return reply(request.id, { isError: true, content: [{ type: 'text', text: 'Sensitive upstream error' }] });
    });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    client = new BitoMcpClient({ get: (_key: string, fallback: unknown) => fallback } as any);
  });
  afterEach(() => jest.restoreAllMocks());
  it('collects every tools/list page in one initialized session', async () => {
    expect((await client.listTools(credentials)).tools.map(tool => tool.name)).toEqual(['get_products', 'get_stock']);
    expect(fetchMock.mock.calls.filter(([, options]) => JSON.parse(options.body).method === 'tools/list')).toHaveLength(2);
  });
  it('marks inventory schema candidates and logs sanitized descriptions and fields', async () => {
    const logger = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    client = new BitoMcpClient({ get: (key: string, fallback: unknown) => key === 'bito.debugShapes' ? true : fallback } as any);
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, options) => {
      const request = JSON.parse(options.body);
      if (request.method !== 'tools/list') return base(url, options);
      return reply(request.id, { tools: [{ name: 'fixture_stock_read', description: 'Read stock quantities. token=private-token example Private Business 987654', inputSchema: { type: 'object', properties: { page: { type: 'integer', default: 987654 }, warehouseId: { type: 'string', examples: ['private-id'] } } } }] });
    });
    await client.listTools(credentials);
    const logs = JSON.stringify(logger.mock.calls);
    expect(logs).toContain('BITO_TOOL_SCHEMA');
    expect(logs).toContain('inventoryCandidate');
    expect(logs).toContain('Read stock quantities');
    expect(logs).toContain('warehouseId');
    expect(logs).not.toMatch(/private-token|Private Business|987654|private-id/);
  });
  it('rejects MCP isError rather than handing it to the model as a successful read', async () => {
    await expect(client.callTool(credentials, 'get_stock', {})).rejects.toThrow('BITO_TOOL_FAILED');
  });
  it('reads a matching SSE result without waiting for an open stream to close', async () => {
    const cancelled = jest.fn();
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('event: message\ndata: {"jsonrpc":"2.0",\ndata: "id":7,"result":{"ok":true}}\n\n'));
    }, cancel: cancelled });
    const result = await (client as any).readRpcBody(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), 7);
    expect(JSON.parse(result).result).toEqual({ ok: true });
    expect(cancelled).toHaveBeenCalled();
  });
});
