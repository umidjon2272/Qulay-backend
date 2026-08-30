import { Injectable } from '@nestjs/common';
import {
  AgentPreference, FinanceCurrency, MeetingStatus, NotificationChannel,
  NotificationPreference, Prisma, ReminderStatus, SuggestionSeverity, TaskStatus,
} from '@prisma/client';
import { zonedDayRange } from '../common/date.utils';
import { FinanceService } from '../finance/finance.service';
import { IntegrationsHealthService } from '../integrations-health/integrations-health.service';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';

const PAYMENT_KEYWORDS = ['to‘lov', 'tolov', 'toʻlov', 'xarajat', 'hisob', 'fatura', 'invoice', 'kredit', 'qarz'];
const BUSY_DAY_MEETING_COUNT = 5;
const EXPENSE_SPIKE_MULTIPLIER = 2;

type Meeting = { id: string; title: string; startsAt: Date; endsAt: Date; contactId: string | null };
type ChannelResolution = { aiEnabled: boolean; inApp: boolean; telegram: boolean };
type SuggestionInput = {
  triggerType: string;
  severity: SuggestionSeverity;
  title: string;
  body: string;
  reason: string;
  entityType?: string;
  entityId?: string;
  dedupeSuffix?: string;
};

@Injectable()
export class ProactiveTriggerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeService: FinanceService,
    private readonly integrationsHealth: IntegrationsHealthService,
    private readonly notificationScheduler: NotificationSchedulerService,
  ) {}

  async evaluateForUser(userId: string, dateKey: string): Promise<void> {
    const [agentPreference, notificationPreference, user] = await Promise.all([
      this.prisma.agentPreference.findUnique({ where: { userId } }),
      this.prisma.notificationPreference.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    ]);
    if (agentPreference && !agentPreference.proactiveEnabled) return;
    if (this.isQuietHours(agentPreference)) return;

    const now = new Date();
    const timezone = user?.timezone ?? 'UTC';
    const dayRange = zonedDayRange(dateKey, timezone);

    const [overdueTasks, dueSoonTasks, upcomingMeeting, followupCandidates, paymentReminders, todayMeetings, health] = await Promise.all([
      this.prisma.task.findMany({ where: { userId, status: { not: TaskStatus.COMPLETED }, dueDate: { lt: now } }, orderBy: { dueDate: 'asc' }, take: 5 }),
      this.prisma.task.findMany({ where: { userId, status: { not: TaskStatus.COMPLETED }, dueDate: { gte: now, lte: new Date(now.getTime() + 3 * 3_600_000) } }, orderBy: { dueDate: 'asc' }, take: 5 }),
      this.prisma.meeting.findFirst({ where: { userId, status: MeetingStatus.SCHEDULED, startsAt: { gte: now, lte: new Date(now.getTime() + 3_600_000) } }, orderBy: { startsAt: 'asc' } }),
      this.prisma.meeting.findMany({ where: { userId, status: MeetingStatus.SCHEDULED, endsAt: { lt: new Date(now.getTime() - 2 * 3_600_000) }, contactId: { not: null } }, orderBy: { endsAt: 'desc' }, take: 10 }),
      this.prisma.reminder.findMany({ where: { userId, status: ReminderStatus.ACTIVE, remindAt: { gte: now, lte: new Date(now.getTime() + 24 * 3_600_000) } }, take: 20 }),
      this.prisma.meeting.findMany({ where: { userId, status: { not: MeetingStatus.CANCELLED }, startsAt: { gte: dayRange.start, lt: dayRange.end } }, orderBy: { startsAt: 'asc' } }),
      this.integrationsHealth.getHealthForUser(userId),
    ]);

    const channels = this.resolveChannels(agentPreference, notificationPreference, health.telegram.connected);

    if (overdueTasks.length) {
      await this.upsert(userId, dateKey, {
        triggerType: 'TASK_OVERDUE',
        severity: SuggestionSeverity.WARNING,
        title: 'Muddati o‘tgan vazifalar bor',
        body: `${overdueTasks.length} ta vazifa muddati o‘tgan: ${overdueTasks.slice(0, 3).map((task) => task.title).join(', ')}`,
        reason: 'Bir yoki bir nechta vazifangizning muddati allaqachon o‘tgan.',
        entityType: 'TASK',
        entityId: overdueTasks[0].id,
      }, channels, true);
    }

    if (dueSoonTasks.length) {
      await this.upsert(userId, dateKey, {
        triggerType: 'TASK_DUE_SOON',
        severity: SuggestionSeverity.INFO,
        title: 'Vazifa muddati yaqinlashmoqda',
        body: `"${dueSoonTasks[0].title}" — keyingi 3 soat ichida tugaydi.`,
        reason: 'Vazifa muddati 3 soatdan kamroq vaqtda tugaydi.',
        entityType: 'TASK',
        entityId: dueSoonTasks[0].id,
      }, channels, false);
    }

    if (upcomingMeeting) {
      await this.upsert(userId, dateKey, {
        triggerType: 'MEETING_PREP',
        severity: SuggestionSeverity.INFO,
        title: 'Uchrashuvga tayyorgarlik',
        body: `"${upcomingMeeting.title}" uchrashuvi 1 soat ichida boshlanadi.`,
        reason: 'Yaqin orada uchrashuvingiz bor.',
        entityType: 'MEETING',
        entityId: upcomingMeeting.id,
      }, channels, false);
    }

    const missingFollowup = await this.findMissingFollowup(userId, followupCandidates);
    if (missingFollowup) {
      await this.upsert(userId, dateKey, {
        triggerType: 'MEETING_FOLLOWUP_MISSING',
        severity: SuggestionSeverity.INFO,
        title: 'Follow-up qaydi yo‘q',
        body: `"${missingFollowup.title}" uchrashuvidan keyin qayd yoki eslatma qo‘shilmagan.`,
        reason: 'Uchrashuv tugaganiga 2 soatdan ko‘p vaqt o‘tdi, lekin tegishli qayd topilmadi.',
        entityType: 'MEETING',
        entityId: missingFollowup.id,
      }, channels, false);
    }

    const paymentReminder = paymentReminders.find((reminder) => this.looksLikePayment(reminder.title, reminder.description));
    if (paymentReminder) {
      await this.upsert(userId, dateKey, {
        triggerType: 'PAYMENT_DUE_SOON',
        severity: SuggestionSeverity.WARNING,
        title: 'Yaqinlashayotgan to‘lov',
        body: `"${paymentReminder.title}" — 24 soat ichida.`,
        reason: 'Eslatma matni to‘lov/hisobga oid so‘z bilan bog‘liq va muddati 24 soat ichida.',
        entityType: 'REMINDER',
        entityId: paymentReminder.id,
      }, channels, true);
    }

    if (todayMeetings.length >= BUSY_DAY_MEETING_COUNT) {
      await this.upsert(userId, dateKey, {
        triggerType: 'BUSY_DAY',
        severity: SuggestionSeverity.INFO,
        title: 'Bugun band kun',
        body: `Bugun ${todayMeetings.length} ta uchrashuvingiz bor.`,
        reason: `Bugungi uchrashuvlar soni ${BUSY_DAY_MEETING_COUNT} tadan ko‘p.`,
      }, channels, false);
    }

    const conflict = this.findConflict(todayMeetings);
    if (conflict) {
      await this.upsert(userId, dateKey, {
        triggerType: 'CALENDAR_CONFLICT',
        severity: SuggestionSeverity.CRITICAL,
        title: 'Uchrashuvlar to‘qnashmoqda',
        body: `"${conflict[0].title}" va "${conflict[1].title}" vaqtlari mos kelmoqda.`,
        reason: 'Ikki uchrashuv vaqti bir-biriga to‘g‘ri keldi.',
        entityType: 'MEETING',
        entityId: conflict[0].id,
      }, channels, true);
    }

    for (const provider of ['google', 'telegram'] as const) {
      const integration = health[provider];
      if (integration.state !== 'TEMPORARY_ISSUE' && integration.state !== 'RECONNECT_REQUIRED') continue;
      await this.upsert(userId, dateKey, {
        triggerType: 'INTEGRATION_ISSUE',
        severity: integration.state === 'RECONNECT_REQUIRED' ? SuggestionSeverity.WARNING : SuggestionSeverity.INFO,
        title: provider === 'google' ? 'Google integratsiyasida muammo' : 'Telegram integratsiyasida muammo',
        body: integration.state === 'RECONNECT_REQUIRED' ? 'Qayta ulanish talab qilinadi.' : 'Vaqtincha muammo aniqlandi, avtomatik tekshirilmoqda.',
        reason: `${provider === 'google' ? 'Google' : 'Telegram'} integratsiyasi holati: ${integration.state}.`,
        dedupeSuffix: provider,
      }, channels, integration.state === 'RECONNECT_REQUIRED');
    }

    if (agentPreference?.financialAlertsEnabled !== false) {
      await this.checkExpenseSpike(userId, dateKey, channels);
    }
  }

  private async checkExpenseSpike(userId: string, dateKey: string, channels: ChannelResolution): Promise<void> {
    for (const currency of [FinanceCurrency.UZS, FinanceCurrency.USD]) {
      const today = await this.financeService.getTodayForUser(userId, currency).catch(() => null);
      const todayExpense = today ? Number(today.todayExpense) : 0;
      if (!today || todayExpense <= 0) continue;
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const week = await this.financeService.getPeriodSummary(userId, weekAgo, new Date(), currency).catch(() => null);
      if (!week) continue;
      const dailyAverage = Number(week.totalExpense) / 7;
      if (dailyAverage <= 0 || todayExpense <= dailyAverage * EXPENSE_SPIKE_MULTIPLIER) continue;
      await this.upsert(userId, dateKey, {
        triggerType: 'EXPENSE_SPIKE',
        severity: SuggestionSeverity.WARNING,
        title: 'Bugungi xarajat odatdagidan yuqori',
        body: `Bugungi xarajat ${todayExpense.toLocaleString('uz-UZ')} ${currency}, so‘nggi 7 kunlik o‘rtachadan sezilarli ko‘p.`,
        reason: 'Bugungi xarajat so‘nggi 7 kunlik o‘rtacha kunlik xarajatdan 2 martadan ortiq.',
        dedupeSuffix: currency,
      }, channels, true);
    }
  }

  private async findMissingFollowup(userId: string, meetings: Meeting[]) {
    for (const meeting of meetings) {
      if (!meeting.contactId) continue;
      const note = await this.prisma.note.findFirst({ where: { userId, contactId: meeting.contactId, createdAt: { gte: meeting.endsAt } } });
      if (!note) return meeting;
    }
    return null;
  }

  private findConflict(meetings: Meeting[]): [Meeting, Meeting] | null {
    const sorted = [...meetings].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startsAt < sorted[index - 1].endsAt) return [sorted[index - 1], sorted[index]];
    }
    return null;
  }

  private looksLikePayment(title: string, description?: string | null): boolean {
    const text = `${title} ${description ?? ''}`.toLocaleLowerCase();
    return PAYMENT_KEYWORDS.some((keyword) => text.includes(keyword));
  }

  private resolveChannels(agentPreference: AgentPreference | null, notificationPreference: NotificationPreference | null, telegramConnected: boolean): ChannelResolution {
    const aiEnabled = notificationPreference?.aiEnabled ?? false;
    return {
      aiEnabled,
      inApp: aiEnabled && (agentPreference?.inAppDelivery ?? true),
      telegram: aiEnabled && Boolean(agentPreference?.telegramDelivery) && telegramConnected,
    };
  }

  private isQuietHours(preference: AgentPreference | null): boolean {
    if (!preference?.quietHoursStart || !preference.quietHoursEnd) return false;
    const timezone = preference.timezone || 'Asia/Tashkent';
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    const nowMinutes = hour * 60 + minute;
    const [startHour, startMinute] = preference.quietHoursStart.split(':').map(Number);
    const [endHour, endMinute] = preference.quietHoursEnd.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    if (startMinutes === endMinutes) return false;
    if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }

  /** Creates (never updates) so a same-day dedupe collision — including an already-dismissed suggestion — is silently skipped instead of resurrected or duplicated. */
  private async upsert(userId: string, dateKey: string, input: SuggestionInput, channels: ChannelResolution, notifyImmediately: boolean): Promise<void> {
    const dedupeKey = `${input.triggerType}:${input.entityId ?? input.dedupeSuffix ?? 'GLOBAL'}:${dateKey}`;
    try {
      await this.prisma.proactiveSuggestion.create({
        data: {
          userId,
          triggerType: input.triggerType,
          entityType: input.entityType,
          entityId: input.entityId,
          dedupeKey,
          title: input.title,
          body: input.body,
          reason: input.reason,
          severity: input.severity,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }

    if (!notifyImmediately || !channels.aiEnabled) return;
    const notificationChannels: NotificationChannel[] = [];
    if (channels.inApp) notificationChannels.push(NotificationChannel.IN_APP);
    if (channels.telegram) notificationChannels.push(NotificationChannel.TELEGRAM);
    if (!notificationChannels.length) return;
    await this.notificationScheduler.scheduleAgentNotification(userId, {
      title: input.title,
      message: input.body,
      channels: notificationChannels,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}
