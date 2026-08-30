import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AgentPreference, BriefingDeliveryStatus, BriefingType, NotificationChannel,
  Prisma, TelegramConnectionStatus, UserStatus,
} from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { BriefingService } from '../briefing/briefing.service';
import { dateKeyInTimezone } from '../common/date.utils';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProactiveTriggerService } from '../proactive-suggestions/proactive-trigger.service';

@Injectable()
export class AgentSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly intervalMs = 5 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAgentService: AiAgentService,
    private readonly proactiveTrigger: ProactiveTriggerService,
    private readonly briefingService: BriefingService,
    private readonly notificationScheduler: NotificationSchedulerService,
    private readonly activityLog: ActivityLogService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  health(): { status: 'running' | 'stopped' } {
    return { status: this.timer ? 'running' : 'stopped' };
  }

  async tick(): Promise<{ expired: number; usersEvaluated: number }> {
    if (this.running) return { expired: 0, usersEvaluated: 0 };
    this.running = true;
    try {
      const expired = await this.aiAgentService.expireStale();
      const users = await this.prisma.user.findMany({ where: { status: UserStatus.ACTIVE }, select: { id: true } });
      let usersEvaluated = 0;
      for (const { id: userId } of users) {
        try {
          const agentPreference = await this.prisma.agentPreference.findUnique({ where: { userId } });
          const dateKey = dateKeyInTimezone(new Date(), agentPreference?.timezone ?? 'Asia/Tashkent');
          await this.proactiveTrigger.evaluateForUser(userId, dateKey);
          await this.dispatchBriefings(userId, dateKey, agentPreference);
          usersEvaluated += 1;
        } catch (error) {
          this.logger.warn(`Agent scheduler tick failed for user ${userId}${error instanceof Error ? `: ${error.message}` : ''}`);
        }
      }
      return { expired, usersEvaluated };
    } finally {
      this.running = false;
    }
  }

  private async dispatchBriefings(userId: string, dateKey: string, agentPreference: AgentPreference | null): Promise<void> {
    const timezone = agentPreference?.timezone ?? 'Asia/Tashkent';
    const nowMinutes = this.localMinutesNow(timezone);

    const morningEnabled = agentPreference?.morningBriefingEnabled ?? true;
    if (morningEnabled && this.isDue(nowMinutes, agentPreference?.morningBriefingTime ?? '08:00')) {
      await this.sendBriefingIfNotSent(userId, dateKey, BriefingType.MORNING, agentPreference);
    }

    const eveningEnabled = agentPreference?.eveningSummaryEnabled ?? true;
    if (eveningEnabled && this.isDue(nowMinutes, agentPreference?.eveningSummaryTime ?? '21:00')) {
      await this.sendBriefingIfNotSent(userId, dateKey, BriefingType.EVENING, agentPreference);
    }
  }

  private async sendBriefingIfNotSent(userId: string, dateKey: string, type: BriefingType, agentPreference: AgentPreference | null): Promise<void> {
    const existing = await this.prisma.dailyBriefingLog.findUnique({ where: { userId_dateKey_type: { userId, dateKey, type } } });
    if (existing) return;
    try {
      const content = type === BriefingType.MORNING
        ? await this.briefingService.buildMorningBriefing(userId, dateKey)
        : await this.briefingService.buildEveningSummary(userId, dateKey);
      const channels = await this.resolveDeliveryChannels(userId, agentPreference);
      if (channels.length) {
        await this.notificationScheduler.scheduleAgentNotification(userId, {
          title: type === BriefingType.MORNING ? 'Bugungi briefing tayyor' : 'Kun yakuni tayyor',
          message: content.narrative,
          channels,
        });
      }
      await this.prisma.dailyBriefingLog.create({
        data: {
          userId, dateKey, type,
          channel: channels[0] ?? NotificationChannel.IN_APP,
          status: BriefingDeliveryStatus.SENT,
          content: content as unknown as Prisma.InputJsonValue,
          sentAt: new Date(),
        },
      });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.BRIEFING_SENT, entityType: 'DAILY_BRIEFING', metadata: { type, dateKey } });
    } catch (error) {
      await this.prisma.dailyBriefingLog.create({
        data: {
          userId, dateKey, type,
          channel: NotificationChannel.IN_APP,
          status: BriefingDeliveryStatus.FAILED,
          content: {},
          errorMessage: error instanceof Error ? error.message.slice(0, 490) : 'unknown error',
        },
      }).catch(() => undefined);
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.BRIEFING_FAILED, entityType: 'DAILY_BRIEFING', metadata: { type, dateKey } }).catch(() => undefined);
    }
  }

  private async resolveDeliveryChannels(userId: string, agentPreference: AgentPreference | null): Promise<NotificationChannel[]> {
    const channels: NotificationChannel[] = [];
    if (agentPreference?.inAppDelivery ?? true) channels.push(NotificationChannel.IN_APP);
    if (agentPreference?.telegramDelivery) {
      const connection = await this.prisma.telegramConnection.findUnique({ where: { userId }, select: { status: true } });
      if (connection?.status === TelegramConnectionStatus.CONNECTED) channels.push(NotificationChannel.TELEGRAM);
    }
    return channels;
  }

  /**
   * "Due" means local time has reached the target; the DailyBriefingLog unique
   * constraint (checked by the caller before this) is what prevents re-sending on
   * every later tick that same day, so this intentionally has no upper bound — a
   * narrow +/- window would risk silently skipping a day if a tick was ever delayed.
   */
  private isDue(nowMinutes: number, target: string): boolean {
    const [hour, minute] = target.split(':').map(Number);
    const targetMinutes = hour * 60 + minute;
    return nowMinutes >= targetMinutes;
  }

  private localMinutesNow(timezone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  }
}
