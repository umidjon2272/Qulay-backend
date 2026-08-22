import { ReminderStatus, TaskPriority } from '@prisma/client';
import { RemindersService } from '../src/reminders/reminders.service';

describe('RemindersService', () => {
  const prisma = {
    reminder: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: RemindersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RemindersService(prisma, activityLog);
  });

  it('creates and completes a timezone-aware reminder', async () => {
    const reminder = { id: 'reminder-id', userId: 'user-a', status: ReminderStatus.ACTIVE };
    prisma.reminder.create.mockResolvedValue(reminder);
    prisma.reminder.findFirst.mockResolvedValue(reminder);
    prisma.reminder.update.mockResolvedValue({ ...reminder, status: ReminderStatus.COMPLETED });

    await service.createForUser('user-a', {
      title: 'Call',
      remindAt: '2026-08-22T10:00:00+05:00',
      priority: TaskPriority.MEDIUM,
    });
    await service.completeForUser('user-a', 'reminder-id');

    expect(prisma.reminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-a',
        remindAt: new Date('2026-08-22T05:00:00.000Z'),
      }),
    });
    expect(prisma.reminder.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'reminder-id' } }));
  });

  it('uses user ownership when reading a reminder', async () => {
    prisma.reminder.findFirst.mockResolvedValue(null);

    await expect(service.getForUser('user-b', 'reminder-id')).rejects.toThrow('Reminder was not found');
    expect(prisma.reminder.findFirst).toHaveBeenCalledWith({ where: { id: 'reminder-id', userId: 'user-b' } });
  });
});
