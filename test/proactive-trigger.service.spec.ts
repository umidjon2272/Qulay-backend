import { Prisma } from '@prisma/client';
import { ProactiveTriggerService } from '../src/proactive-suggestions/proactive-trigger.service';

describe('ProactiveTriggerService', () => {
  const prisma = {
    agentPreference: { findUnique: jest.fn() },
    notificationPreference: { findUnique: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    task: { findMany: jest.fn() },
    meeting: { findFirst: jest.fn(), findMany: jest.fn() },
    reminder: { findMany: jest.fn() },
    note: { findFirst: jest.fn() },
    proactiveSuggestion: { create: jest.fn() },
  } as any;
  const financeService = { getTodayForUser: jest.fn(), getPeriodSummary: jest.fn() } as any;
  const integrationsHealth = {
    getHealthForUser: jest.fn().mockResolvedValue({
      google: { state: 'CONNECTED' },
      telegram: { state: 'CONNECTED' },
    }),
  } as any;
  const notificationScheduler = { scheduleAgentNotification: jest.fn() } as any;
  let service: ProactiveTriggerService;

  const noiselessDefaults = () => {
    prisma.task.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.dueDate?.lt ? [] : []));
    prisma.meeting.findFirst.mockResolvedValue(null);
    prisma.meeting.findMany.mockResolvedValue([]);
    prisma.reminder.findMany.mockResolvedValue([]);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProactiveTriggerService(prisma, financeService, integrationsHealth, notificationScheduler);
    prisma.agentPreference.findUnique.mockResolvedValue({
      proactiveEnabled: true, financialAlertsEnabled: false, telegramDelivery: false, inAppDelivery: true,
      quietHoursStart: null, quietHoursEnd: null, timezone: 'UTC',
    });
    prisma.notificationPreference.findUnique.mockResolvedValue({ aiEnabled: true });
    noiselessDefaults();
  });

  it('does nothing when the user is inside their configured quiet hours', async () => {
    prisma.agentPreference.findUnique.mockResolvedValue({
      proactiveEnabled: true, financialAlertsEnabled: false, quietHoursStart: '00:00', quietHoursEnd: '23:59', timezone: 'UTC',
    });
    await service.evaluateForUser('user-a', '2026-08-30');
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(notificationScheduler.scheduleAgentNotification).not.toHaveBeenCalled();
  });

  it('creates exactly one suggestion and one notification for an overdue task', async () => {
    prisma.task.findMany.mockImplementation(({ where }: any) =>
      where.dueDate?.lt ? Promise.resolve([{ id: 'task-1', title: 'Overdue thing' }]) : Promise.resolve([]));
    prisma.proactiveSuggestion.create.mockResolvedValue({ id: 'suggestion-1' });

    await service.evaluateForUser('user-a', '2026-08-30');

    expect(prisma.proactiveSuggestion.create).toHaveBeenCalledTimes(1);
    expect(prisma.proactiveSuggestion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-a', triggerType: 'TASK_OVERDUE' }),
    }));
    expect(notificationScheduler.scheduleAgentNotification).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect or duplicate a same-day suggestion that already exists (including a dismissed one)', async () => {
    prisma.task.findMany.mockImplementation(({ where }: any) =>
      where.dueDate?.lt ? Promise.resolve([{ id: 'task-1', title: 'Overdue thing' }]) : Promise.resolve([]));
    const duplicateKeyError = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      { code: 'P2002', message: 'Unique constraint failed', clientVersion: 'test' },
    );
    prisma.proactiveSuggestion.create.mockRejectedValue(duplicateKeyError);

    await expect(service.evaluateForUser('user-a', '2026-08-30')).resolves.toBeUndefined();
    expect(notificationScheduler.scheduleAgentNotification).not.toHaveBeenCalled();
  });
});
