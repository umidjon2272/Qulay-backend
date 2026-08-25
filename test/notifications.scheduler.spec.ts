import { NotificationType } from '@prisma/client';
import { NotificationSchedulerService } from '../src/notifications/notification-scheduler.service';

describe('NotificationSchedulerService', () => {
  const prisma = {
    notification: { updateMany: jest.fn(), create: jest.fn() },
    notificationPreference: { upsert: jest.fn() },
    telegramConnection: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  let service: NotificationSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notificationPreference.upsert.mockResolvedValue({ taskEnabled: true, reminderEnabled: true, meetingEnabled: true, aiEnabled: false, telegramEnabled: false, webPushEnabled: false, defaultMeetingMinutesBefore: 15 });
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    prisma.notification.create.mockImplementation((input: unknown) => Promise.resolve(input));
    prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
    service = new NotificationSchedulerService(prisma);
  });

  it('schedules a reminder and cancels its old pending schedule first', async () => {
    const remindAt = new Date('2026-08-22T05:00:00.000Z');
    await service.scheduleReminderNotification('user-a', { id: 'reminder-id', userId: 'user-a', title: 'Call', description: null, remindAt, status: 'ACTIVE' });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a', entityType: 'REMINDER', entityId: 'reminder-id', status: 'PENDING' } }));
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'user-a', type: NotificationType.REMINDER, scheduledAt: remindAt, entityId: 'reminder-id' }) }));
  });

  it('does not schedule a completed task', async () => {
    await service.scheduleTaskNotification('user-a', { id: 'task-id', userId: 'user-a', title: 'Done', dueDate: new Date(), status: 'COMPLETED' });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
