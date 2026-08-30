import { BriefingService } from '../src/briefing/briefing.service';

describe('BriefingService', () => {
  const today = {
    date: '2026-08-30', timezone: 'UTC', tasks: [], reminders: [], meetings: [], overdueTasks: [], nextMeeting: null,
  };
  const todayService = { getForUser: jest.fn().mockResolvedValue(today) } as any;
  const financeService = {
    getPeriodSummary: jest.fn().mockResolvedValue({ transactionCount: 0 }),
    getTodayForUser: jest.fn().mockResolvedValue({ recentTransactions: [] }),
  } as any;
  const integrationsHealth = {
    getHealthForUser: jest.fn().mockResolvedValue({ google: { state: 'CONNECTED' }, telegram: { state: 'CONNECTED' } }),
  } as any;
  const aiProvider = { configured: jest.fn(), complete: jest.fn() } as any;
  const prisma = { note: { findMany: jest.fn().mockResolvedValue([]) } } as any;
  let service: BriefingService;

  beforeEach(() => {
    jest.clearAllMocks();
    todayService.getForUser.mockResolvedValue(today);
    financeService.getPeriodSummary.mockResolvedValue({ transactionCount: 0 });
    financeService.getTodayForUser.mockResolvedValue({ recentTransactions: [] });
    prisma.note.findMany.mockResolvedValue([]);
    service = new BriefingService(todayService, financeService, integrationsHealth, aiProvider, prisma);
  });

  it('never throws and returns the deterministic fallback narrative when no AI provider is configured', async () => {
    aiProvider.configured.mockReturnValue(false);
    const briefing = await service.buildMorningBriefing('user-a');
    expect(briefing.narrative).toBeTruthy();
    expect(aiProvider.complete).not.toHaveBeenCalled();
  });

  it('falls back to the canned narrative instead of throwing when the AI provider call fails', async () => {
    aiProvider.configured.mockReturnValue(true);
    aiProvider.complete.mockRejectedValue(new Error('provider unavailable'));
    const briefing = await service.buildMorningBriefing('user-a');
    expect(briefing.narrative).toBeTruthy();
  });

  it('only includes finance currencies that actually had activity this week', async () => {
    financeService.getPeriodSummary.mockImplementation((_userId: string, _from: Date, _to: Date, currency: string) =>
      Promise.resolve(currency === 'UZS' ? { transactionCount: 2 } : { transactionCount: 0 }));
    aiProvider.configured.mockReturnValue(false);
    const briefing = await service.buildMorningBriefing('user-a');
    expect(briefing.weekFinance).toHaveLength(1);
    expect(briefing.weekFinance[0].currency).toBe('UZS');
  });

  it('only surfaces an integration issue when one actually exists', async () => {
    aiProvider.configured.mockReturnValue(false);
    const clean = await service.buildMorningBriefing('user-a');
    expect(clean.integrationIssues).toEqual([]);

    integrationsHealth.getHealthForUser.mockResolvedValue({ google: { state: 'RECONNECT_REQUIRED' }, telegram: { state: 'CONNECTED' } });
    const withIssue = await service.buildMorningBriefing('user-a');
    expect(withIssue.integrationIssues).toEqual([{ provider: 'google', state: 'RECONNECT_REQUIRED' }]);
  });
});
