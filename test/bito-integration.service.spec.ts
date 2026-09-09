import { BitoIntegrationService } from '../src/bito/bito-integration.service';

describe('Bito usable status, credentials and bounded retries', () => {
  let prisma: any, mcp: any, oauth: any, service: BitoIntegrationService;
  beforeEach(() => {
    const connection = { id: 'c', userId: 'u', status: 'CONNECTED', authMode: 'BEARER', encryptedServerUrl: 'server', oauthClientId: 'client', toolCount: 1, lastErrorCode: null };
    prisma = { bitoConnection: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => where.userId === 'u' ? connection : null),
      update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    } };
    mcp = { listTools: jest.fn().mockResolvedValue({ tools: [{ name: 'get_stock' }], protocolVersion: '2025-06-18' }), callTool: jest.fn().mockResolvedValue({ ok: true }) };
    oauth = { accessToken: jest.fn().mockResolvedValueOnce('old').mockResolvedValue('fresh'), oauthReady: () => true };
    service = new BitoIntegrationService(prisma, { configured: () => true, decrypt: () => 'https://mcp.example.test' } as any, mcp, oauth, { assertMcpServerUrl: (url: string) => url, safeHost: () => 'mcp.example.test' } as any, {} as any);
  });
  it('checks live tools before reporting CONNECTED', async () => {
    expect(await service.status('u')).toMatchObject({ connected: true, status: 'CONNECTED' });
    expect(mcp.listTools).toHaveBeenCalledTimes(1);
  });
  it('marks unreachable connections DEGRADED with only one retry', async () => {
    mcp.listTools.mockRejectedValue(new Error('BITO_MCP_TIMEOUT'));
    expect(await service.status('u')).toMatchObject({ connected: false, status: 'DEGRADED' });
    expect(mcp.listTools).toHaveBeenCalledTimes(2);
  });
  it('reports EXPIRED when token refresh fails', async () => {
    oauth.accessToken.mockReset().mockRejectedValue(new Error('BITO_TOKEN_REFRESH_FAILED'));
    expect(await service.status('u')).toMatchObject({ connected: false, status: 'EXPIRED' });
    expect(mcp.listTools).not.toHaveBeenCalled();
  });
  it('never resolves another user connection', async () => {
    await expect(service.listToolsForUser('other')).rejects.toThrow('BITO_NOT_CONNECTED');
    expect(mcp.listTools).not.toHaveBeenCalled();
  });
  it('refreshes once on rejected bearer credentials', async () => {
    mcp.callTool.mockRejectedValueOnce(new Error('BITO_AUTH_FAILED')).mockResolvedValueOnce({ ok: true });
    await service.callToolForUser('u', 'get_stock', {}, true);
    expect(oauth.accessToken.mock.calls).toEqual([['u', false], ['u', true]]);
    expect(mcp.callTool).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'fresh' }), 'get_stock', {});
  });
  it('reconnects and retries a read, but never repeats a timed-out write', async () => {
    mcp.callTool.mockRejectedValue(new Error('BITO_MCP_TIMEOUT'));
    await expect(service.callToolForUser('u', 'get_stock', {}, true)).rejects.toThrow('BITO_MCP_TIMEOUT');
    expect(mcp.callTool).toHaveBeenCalledTimes(2);
    mcp.callTool.mockClear();
    await expect(service.callToolForUser('u', 'create_order', {})).rejects.toThrow('BITO_MCP_TIMEOUT');
    expect(mcp.callTool).toHaveBeenCalledTimes(1);
  });
});
