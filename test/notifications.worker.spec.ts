import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import { NotificationWorkerService } from '../src/notifications/notification-worker.service';

describe('NotificationWorkerService', () => {
  const candidate = {
    id: 'notification-id', userId: 'user-a', type: NotificationType.REMINDER, title: 'Reminder', message: 'Now',
    entityType: 'REMINDER', entityId: 'reminder-id', channel: NotificationChannel.IN_APP, status: NotificationStatus.PENDING,
    scheduledAt: new Date('2026-08-22T05:00:00.000Z'), sentAt: null, readAt: null, failedAt: null, metadata: null,
    retryCount: 0, nextRetryAt: null, claimedAt: null, claimToken: null, createdAt: new Date(), updatedAt: new Date(),
  } as any;
  const prisma = { notification: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(candidate), updateMany: jest.fn() } } as any;
  const delivery = { deliver: jest.fn() } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;

  beforeEach(() => { jest.clearAllMocks(); });

  it('claims and delivers a due notification once', async () => {
    prisma.notification.findMany.mockResolvedValue([candidate]);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    delivery.deliver.mockResolvedValue(undefined);
    const worker = new NotificationWorkerService(prisma, delivery, activityLog);
    await worker.processDueNotifications(new Date('2026-08-22T05:01:00.000Z'));
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
    expect(prisma.notification.updateMany).toHaveBeenCalledTimes(2);
    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NOTIFICATION_SENT', userId: 'user-a' }));
  });

  it('skips a notification another worker already claimed', async () => {
    prisma.notification.findMany.mockResolvedValue([candidate]);
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    const worker = new NotificationWorkerService(prisma, delivery, activityLog);
    await worker.processDueNotifications();
    expect(delivery.deliver).not.toHaveBeenCalled();
  });

  it('retries failed delivery and marks the third failure failed', async () => {
    prisma.notification.findMany.mockResolvedValue([{ ...candidate, retryCount: 2 }]);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    delivery.deliver.mockRejectedValue(new Error('mock telegram failure'));
    const worker = new NotificationWorkerService(prisma, delivery, activityLog);
    await worker.processDueNotifications();
    expect(prisma.notification.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.FAILED, retryCount: 3 }) }));
    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NOTIFICATION_FAILED' }));
  });
});
