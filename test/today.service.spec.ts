import { TodayService } from '../src/today/today.service';

describe('TodayService', () => {
  it('aggregates today data, overdue tasks and the next meeting', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
      task: { findMany: jest.fn().mockResolvedValueOnce([{ id: 'today-task' }]).mockResolvedValueOnce([{ id: 'overdue-task' }]) },
      reminder: { findMany: jest.fn().mockResolvedValue([{ id: 'today-reminder' }]) },
      meeting: {
        findMany: jest.fn().mockResolvedValue([{ id: 'today-meeting' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'next-meeting' }),
      },
    } as any;
    const service = new TodayService(prisma);

    await expect(service.getForUser('user-a', '2026-08-22')).resolves.toEqual(expect.objectContaining({
      date: '2026-08-22',
      timezone: 'UTC',
      tasks: [{ id: 'today-task' }],
      reminders: [{ id: 'today-reminder' }],
      meetings: [{ id: 'today-meeting' }],
      overdueTasks: [{ id: 'overdue-task' }],
      nextMeeting: { id: 'next-meeting' },
    }));
  });
});
