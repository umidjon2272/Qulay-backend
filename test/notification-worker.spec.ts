import { NotificationWorkerService } from '../src/notifications/notification-worker.service';

describe('notification worker isolation and cancellation', () => {
  const row = (id: string, channel = 'IN_APP') => ({ id, channel, userId: 'owner', retryCount: 0, status: 'PENDING' });
  let prisma: any, delivery: any, activity: any, worker: NotificationWorkerService;
  beforeEach(() => {
    prisma = { notification: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(row('a')), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    delivery = { deliver: jest.fn().mockResolvedValue(undefined) };
    activity = { record: jest.fn().mockResolvedValue(undefined) };
    worker = new NotificationWorkerService(prisma, delivery, activity);
  });
  it('does not deliver a row cancelled after claiming', async () => {
    prisma.notification.findMany.mockResolvedValue([row('a')]); prisma.notification.findFirst.mockResolvedValue(null);
    expect(await worker.processDueNotifications()).toBe(0);
    expect(delivery.deliver).not.toHaveBeenCalled();
  });
  it('does not claim/deliver the same row twice', async () => {
    prisma.notification.findMany.mockResolvedValue([row('a')]); prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await worker.processDueNotifications(); expect(delivery.deliver).not.toHaveBeenCalled();
  });
  it('does not let slow Telegram delay in-app delivery', async () => {
    let release!: () => void;
    delivery.deliver.mockImplementation((n: any) => n.channel === 'TELEGRAM' ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve());
    prisma.notification.findMany.mockResolvedValue([row('tg', 'TELEGRAM'), row('in')]);
    const pending = worker.processDueNotifications();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'in' }), data: expect.objectContaining({ status: 'SENT' }) }));
    expect(await worker.processDueNotifications()).toBe(0);
    release(); await pending;
  });
  it('does not retry successful delivery when analytics fails', async () => {
    prisma.notification.findMany.mockResolvedValue([row('a')]); activity.record.mockRejectedValue(new Error('analytics offline'));
    await worker.processDueNotifications();
    expect(prisma.notification.updateMany.mock.calls.some(([call]: any) => call.data.retryCount !== undefined)).toBe(false);
  });
  it('releases the lease and schedules a bounded retry on transport failure', async () => {
    prisma.notification.findMany.mockResolvedValue([row('a')]); delivery.deliver.mockRejectedValue(new Error('secret transport details'));
    await worker.processDueNotifications(new Date('2026-09-03T10:00:00Z'));
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ retryCount: 1, claimToken: null, nextRetryAt: new Date('2026-09-03T10:01:00Z') }) }));
  });
});
