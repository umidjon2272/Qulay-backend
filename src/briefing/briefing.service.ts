import { Injectable, Optional } from '@nestjs/common';
import { FinanceCurrency, TaskStatus } from '@prisma/client';
import { AiProviderService } from '../ai-agent/ai-provider.service';
import { zonedDayRange } from '../common/date.utils';
import { FinanceService } from '../finance/finance.service';
import { IntegrationsHealthService } from '../integrations-health/integrations-health.service';
import { PrismaService } from '../prisma/prisma.service';
import { TodayService } from '../today/today.service';
import { AiUsageService } from '../usage/usage.service';

const FALLBACK_MORNING_NOTE = 'Kunni rejalashtirilgan ishlardan boshlang. AI tahlili hozircha mavjud emas.';
const FALLBACK_EVENING_NOTE = 'Bugungi kun yakunlandi. AI tahlili hozircha mavjud emas.';
const CURRENCIES: FinanceCurrency[] = [FinanceCurrency.UZS, FinanceCurrency.USD];

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class BriefingService {
  constructor(
    private readonly todayService: TodayService,
    private readonly financeService: FinanceService,
    private readonly integrationsHealth: IntegrationsHealthService,
    private readonly aiProvider: AiProviderService,
    private readonly prisma: PrismaService,
    @Optional() private readonly usage?: AiUsageService,
  ) {}

  async buildMorningBriefing(userId: string, dateKey?: string) {
    const today = await this.todayService.getForUser(userId, dateKey);
    const weekStartKey = shiftDateKey(today.date, -6);
    const weekStart = zonedDayRange(weekStartKey, today.timezone).start;
    const weekEnd = zonedDayRange(today.date, today.timezone).end;

    const weekFinance = await this.financeByCurrency((currency) => this.financeService.getPeriodSummary(userId, weekStart, weekEnd, currency));
    const priorities = this.buildPriorities(today);
    const integrationIssues = await this.getIntegrationIssues(userId);

    const sections = {
      overdueTasks: today.overdueTasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate })),
      todayMeetings: today.meetings.map((meeting) => ({ id: meeting.id, title: meeting.title, startsAt: meeting.startsAt })),
      todayTasks: today.tasks.map((task) => ({ id: task.id, title: task.title, priority: task.priority })),
      todayReminders: today.reminders.map((reminder) => ({ id: reminder.id, title: reminder.title, remindAt: reminder.remindAt })),
      weekFinance,
      priorities,
      integrationIssues,
    };

    const narrative = await this.narrate(userId, this.morningPrompt(sections), FALLBACK_MORNING_NOTE);

    return { date: today.date, timezone: today.timezone, ...sections, narrative };
  }

  async buildEveningSummary(userId: string, dateKey?: string) {
    const today = await this.todayService.getForUser(userId, dateKey);
    const dayRange = zonedDayRange(today.date, today.timezone);
    const tomorrowKey = shiftDateKey(today.date, 1);
    const [tomorrow, notesToday, todayFinance] = await Promise.all([
      this.todayService.getForUser(userId, tomorrowKey),
      this.prisma.note.findMany({
        where: { userId, createdAt: { gte: dayRange.start, lt: dayRange.end } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true },
        take: 10,
      }),
      this.financeByCurrency((currency) => this.financeService.getTodayForUser(userId, currency)),
    ]);

    const completedTasks = today.tasks.filter((task) => task.status === TaskStatus.COMPLETED);
    const incompleteTasks = today.tasks.filter((task) => task.status !== TaskStatus.COMPLETED);

    const sections = {
      completedTasks: completedTasks.map((task) => ({ id: task.id, title: task.title })),
      incompleteTasks: incompleteTasks.map((task) => ({ id: task.id, title: task.title, priority: task.priority })),
      todayMeetings: today.meetings.map((meeting) => ({ id: meeting.id, title: meeting.title, startsAt: meeting.startsAt })),
      notesCreatedToday: notesToday,
      todayFinance,
      tomorrowMeetings: tomorrow.meetings.map((meeting) => ({ id: meeting.id, title: meeting.title, startsAt: meeting.startsAt })),
      tomorrowTasks: tomorrow.tasks.map((task) => ({ id: task.id, title: task.title, priority: task.priority })),
    };

    const narrative = await this.narrate(userId, this.eveningPrompt(sections), FALLBACK_EVENING_NOTE);

    return { date: today.date, timezone: today.timezone, ...sections, narrative };
  }

  private buildPriorities(today: Awaited<ReturnType<TodayService['getForUser']>>) {
    const priorities: Array<{ label: string; detail: string }> = [];
    for (const task of today.overdueTasks) {
      if (priorities.length >= 3) break;
      priorities.push({ label: 'Muddati o‘tgan vazifa', detail: task.title });
    }
    for (const meeting of today.meetings) {
      if (priorities.length >= 3) break;
      priorities.push({ label: 'Bugungi uchrashuv', detail: meeting.title });
    }
    for (const task of today.tasks.filter((item) => item.priority === 'HIGH' && item.status !== TaskStatus.COMPLETED)) {
      if (priorities.length >= 3) break;
      priorities.push({ label: 'Muhim vazifa', detail: task.title });
    }
    return priorities;
  }

  private async getIntegrationIssues(userId: string): Promise<Array<{ provider: 'google' | 'telegram'; state: string }>> {
    const health = await this.integrationsHealth.getHealthForUser(userId);
    const issues: Array<{ provider: 'google' | 'telegram'; state: string }> = [];
    if (health.google.state === 'TEMPORARY_ISSUE' || health.google.state === 'RECONNECT_REQUIRED') {
      issues.push({ provider: 'google', state: health.google.state });
    }
    if (health.telegram.state === 'TEMPORARY_ISSUE' || health.telegram.state === 'RECONNECT_REQUIRED') {
      issues.push({ provider: 'telegram', state: health.telegram.state });
    }
    return issues;
  }

  /** Calls a period-scoped finance read once per currency and only keeps currencies with real activity. */
  private async financeByCurrency<T extends { transactionCount?: number; recentTransactions?: unknown[] }>(
    fetcher: (currency: FinanceCurrency) => Promise<T>,
  ): Promise<Array<T & { currency: FinanceCurrency }>> {
    const results = await Promise.all(CURRENCIES.map(async (currency) => ({ currency, ...(await fetcher(currency)) })));
    return results.filter((result) => (result.transactionCount ?? result.recentTransactions?.length ?? 0) > 0);
  }

  private async narrate(userId: string, prompt: string, fallback: string): Promise<string> {
    if (!this.aiProvider.configured()) return fallback;
    try {
      const result = await this.aiProvider.complete([{ role: 'system', content: prompt }], []);
      if (this.usage) {
        await this.usage.logTextUsage({ userId, model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }).catch(() => undefined);
      }
      return result.message.content?.trim() || fallback;
    } catch {
      return fallback;
    }
  }

  private morningPrompt(sections: Record<string, unknown>): string {
    return `Siz Qulay AI shaxsiy yordamchisiz. Foydalanuvchiga 2-3 gapli, o‘zbek tilida, samimiy va aniq ertalabki motivatsion xulosa yozing. Faktlarni o‘ylab topmang, faqat quyidagi ma’lumotlarga tayaning:\n${JSON.stringify(sections)}`;
  }

  private eveningPrompt(sections: Record<string, unknown>): string {
    return `Siz Qulay AI shaxsiy yordamchisiz. Foydalanuvchiga 2-3 gapli, o‘zbek tilida kunning qisqa yakunini yozing (nima bajarildi, ertaga nimaga tayyorgarlik ko‘rish kerak). Faktlarni o‘ylab topmang, faqat quyidagi ma’lumotlarga tayaning:\n${JSON.stringify(sections)}`;
  }
}
