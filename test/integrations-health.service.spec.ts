import { IntegrationsHealthService } from '../src/integrations-health/integrations-health.service';

describe('IntegrationsHealthService', () => {
  const googleAuth = { status: jest.fn() } as any;
  const telegramIntegration = { status: jest.fn() } as any;
  let service: IntegrationsHealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IntegrationsHealthService(googleAuth, telegramIntegration);
  });

  it('reports CONNECTED when there is no recent error, not TEMPORARY_ISSUE or DISCONNECTED', async () => {
    googleAuth.status.mockResolvedValue({ connected: true, connectedAt: '2026-08-01T00:00:00Z', lastErrorAt: null, lastErrorCode: null });
    telegramIntegration.status.mockResolvedValue({ connected: true, temporaryError: false, lastValidatedAt: null, lastErrorCode: null });
    const health = await service.getHealthForUser('user-a');
    expect(health.google.state).toBe('CONNECTED');
    expect(health.telegram.state).toBe('CONNECTED');
  });

  it('keeps a transient Google error as TEMPORARY_ISSUE rather than DISCONNECTED', async () => {
    googleAuth.status.mockResolvedValue({ connected: true, connectedAt: '2026-08-01T00:00:00Z', lastErrorAt: new Date().toISOString(), lastErrorCode: 'UNAVAILABLE' });
    telegramIntegration.status.mockResolvedValue({ connected: true, temporaryError: false, lastValidatedAt: null, lastErrorCode: null });
    const health = await service.getHealthForUser('user-a');
    expect(health.google.state).toBe('TEMPORARY_ISSUE');
  });

  it('keeps a transient Telegram error as TEMPORARY_ISSUE, not DISCONNECTED', async () => {
    googleAuth.status.mockResolvedValue({ connected: false, connectedAt: null, lastErrorAt: null, lastErrorCode: null });
    telegramIntegration.status.mockResolvedValue({ connected: true, temporaryError: true, lastValidatedAt: null, lastErrorCode: null });
    const health = await service.getHealthForUser('user-a');
    expect(health.telegram.state).toBe('TEMPORARY_ISSUE');
  });

  it('maps a revoked/auth-invalid token to RECONNECT_REQUIRED, not a plain DISCONNECTED', async () => {
    googleAuth.status.mockResolvedValue({ connected: false, connectedAt: null, lastErrorAt: new Date().toISOString(), lastErrorCode: 'TOKEN_REVOKED' });
    telegramIntegration.status.mockResolvedValue({ connected: false, temporaryError: false, lastValidatedAt: null, lastErrorCode: null });
    const health = await service.getHealthForUser('user-a');
    expect(health.google.state).toBe('RECONNECT_REQUIRED');
  });

  it('reports DISCONNECTED for a never-connected or user-disconnected integration with no error code', async () => {
    googleAuth.status.mockResolvedValue({ connected: false, connectedAt: null, lastErrorAt: null, lastErrorCode: null });
    telegramIntegration.status.mockResolvedValue({ connected: false, temporaryError: false, lastValidatedAt: null, lastErrorCode: null });
    const health = await service.getHealthForUser('user-a');
    expect(health.google.state).toBe('DISCONNECTED');
    expect(health.telegram.state).toBe('DISCONNECTED');
  });
});
