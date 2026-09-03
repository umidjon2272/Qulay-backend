import { NotificationStatus, NotificationType } from '@prisma/client';
import { NotificationService } from '../src/notifications/notification.service';

describe('NotificationService', () => {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ language: 'uz' }) },
    notification: {
      findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(),
    },
    notificationPreference: { upsert: jest.fn() },
  } as any;
  let service: NotificationService;

  beforeEach(() => { jest.clearAllMocks(); service = new NotificationService(prisma); });

  it('lists only the authenticated user notifications and counts unread', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: 'n1', userId: 'user-a' }]);
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await service.listForUser('user-a', { page: 1, limit: 20 } as any);
    await service.unreadCount('user-a');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'user-a' }) }));
    expect(prisma.notification.count).toHaveBeenLastCalledWith({ where: { userId: 'user-a', channel: 'IN_APP', status: NotificationStatus.SENT, readAt: null } });
  });

  it('marks one notification and all notifications read with user ownership', async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: 'n1', userId: 'user-a', status: NotificationStatus.SENT });
    prisma.notification.update.mockResolvedValue({ id: 'n1', status: NotificationStatus.READ });
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    await service.markRead('user-a', 'n1');
    await service.readAll('user-a');
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: 'n1', userId: 'user-a' } });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a', channel: 'IN_APP', status: NotificationStatus.SENT, readAt: null } }));
  });

  it('upserts preferences without accepting a user id from a body', async () => {
    prisma.notificationPreference.upsert.mockResolvedValue({ userId: 'user-a', reminderEnabled: false });
    await service.updatePreferences('user-a', { reminderEnabled: false });
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a' }, update: { reminderEnabled: false } }));
  });
});
