import { AdminService } from '../src/admin/admin.service';

describe('Admin database truth mappings', () => {
  it('does not derive login or activity from createdAt or generic activity logs', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'user-1', email: 'never@example.com', firstName: 'Never', lastName: 'Logged', avatarUrl: null,
          role: 'USER', status: 'ACTIVE', createdAt, lastLoginAt: null, lastActivityAt: null,
          refreshTokens: [], telegramConnection: null, googleConnection: null,
        }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new AdminService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    const result = await service.listUsers({ page: 1, limit: 20, order: 'desc', sort: 'createdAt' } as never);

    expect(result.items[0]).toEqual(expect.objectContaining({ lastLoginAt: null, lastActivityAt: null, lastActivity: null, activeSession: false }));
    expect(result.items[0].lastActivity).not.toEqual(createdAt);
  });

  it('reports every connector from database state and keeps coming-soon products disabled', async () => {
    const prisma = {
      telegramConnection: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _max: { lastValidatedAt: null } }) },
      googleConnection: {
        groupBy: jest.fn().mockResolvedValue([{ status: 'CONNECTED', _count: { _all: 2 } }, { status: 'ERROR', _count: { _all: 1 } }]),
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { status: 'CONNECTED', scopes: ['https://www.googleapis.com/auth/calendar.events'] },
            { status: 'CONNECTED', scopes: ['https://www.googleapis.com/auth/drive.readonly'] },
            { status: 'ERROR', scopes: [] },
          ]),
      },
      bitoConnection: { groupBy: jest.fn().mockResolvedValue([{ status: 'CONNECTED', _count: { _all: 1 } }]) },
      whatsAppConnection: { groupBy: jest.fn().mockResolvedValue([{ status: 'DEGRADED', _count: { _all: 1 } }]) },
      instagramConnection: { groupBy: jest.fn().mockResolvedValue([{ status: 'DISCONNECTED', _count: { _all: 1 } }]) },
    };
    const service = new AdminService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    const result = await service.getIntegrations();

    expect(result.googleCalendar).toEqual({ connected: 1, disconnected: 1, error: 1 });
    expect(result.googleDrive).toEqual({ connected: 1, disconnected: 1, error: 1 });
    expect(result.bito.connected).toBe(1);
    expect(result.whatsapp).toEqual(expect.objectContaining({ connected: 0, degraded: 1, productEnabled: false }));
    expect(result.instagram).toEqual(expect.objectContaining({ connected: 0, disconnected: 1, productEnabled: false }));
  });
});
