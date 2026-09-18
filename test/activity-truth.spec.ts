import { ActivityLogService } from '../src/activity-log/activity-log.service';

describe('User activity truth', () => {
  it('does not mark registration or background refresh as user activity', async () => {
    const prisma = {
      activityLog: { create: jest.fn().mockResolvedValue({ id: 'log' }) },
      user: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new ActivityLogService(prisma as never);

    await service.record({ userId: 'user-1', action: 'REGISTERED', entityType: 'AUTH' });
    await service.record({ userId: 'user-1', action: 'REFRESH_SUCCEEDED', entityType: 'AUTH' });

    expect(prisma.activityLog.create).toHaveBeenCalledTimes(2);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates the actor timestamp exactly once for a meaningful event', async () => {
    const create = jest.fn().mockReturnValue(Promise.resolve({ id: 'log' }));
    const update = jest.fn().mockReturnValue(Promise.resolve({ id: 'user-1' }));
    const prisma = {
      activityLog: { create },
      user: { update },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const service = new ActivityLogService(prisma as never);

    await service.record({ userId: 'admin-1', action: 'ADMIN_USER_BLOCKED', entityType: 'USER', entityId: 'target-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'admin-1' },
      data: { lastActivityAt: expect.any(Date) },
    }));
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'target-1' } }));
  });
});
