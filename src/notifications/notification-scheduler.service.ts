import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma, TelegramConnectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDraft } from './notification.types';

type SchedulableEntity = { id: string; title: string; description?: string | null; userId: string };
type MeetingEntity = SchedulableEntity & { startsAt: Date; reminderMinutesBefore: number; status?: string };

@Injectable()
export class NotificationSchedulerService {
  constructor(private readonly prisma: PrismaService) {}

  scheduleTaskNotification(userId: string, task: SchedulableEntity & { dueDate?: Date | null; status?: string }) {
    return this.replaceEntityNotifications(userId, 'TASK', task.id, task.dueDate && task.status !== 'COMPLETED' ? [{
      type: NotificationType.TASK,
      title: `Vazifa: ${task.title}`,
      message: 'Vazifa muddati keldi.',
      entityType: 'TASK', entityId: task.id, scheduledAt: task.dueDate,
    }] : []);
  }

  scheduleReminderNotification(userId: string, reminder: SchedulableEntity & { remindAt: Date; status?: string }) {
    return this.replaceEntityNotifications(userId, 'REMINDER', reminder.id, reminder.status === 'ACTIVE' ? [{
      type: NotificationType.REMINDER,
      title: `Eslatma: ${reminder.title}`,
      message: reminder.description || 'Eslatma vaqti keldi.',
      entityType: 'REMINDER', entityId: reminder.id, scheduledAt: reminder.remindAt,
    }] : []);
  }

  async scheduleMeetingNotification(userId: string, meeting: MeetingEntity) {
    const preference = await this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
    const minutes = meeting.reminderMinutesBefore ?? preference.defaultMeetingMinutesBefore;
    const drafts: NotificationDraft[] = [];
    if (meeting.status !== 'CANCELLED' && meeting.status !== 'COMPLETED') {
      const reminderAt = new Date(meeting.startsAt.getTime() - minutes * 60_000);
      if (minutes > 0) drafts.push({
        type: NotificationType.MEETING,
        title: `Uchrashuv yaqin: ${meeting.title}`,
        message: `${minutes} daqiqadan keyin uchrashuv boshlanadi.`,
        entityType: 'MEETING', entityId: meeting.id, scheduledAt: reminderAt,
        metadata: { kind: 'REMINDER', minutesBefore: minutes },
      });
      drafts.push({
        type: NotificationType.MEETING,
        title: `Uchrashuv: ${meeting.title}`,
        message: 'Uchrashuv boshlanmoqda.',
        entityType: 'MEETING', entityId: meeting.id, scheduledAt: meeting.startsAt,
        metadata: { kind: 'START' },
      });
    }
    return this.replaceEntityNotifications(userId, 'MEETING', meeting.id, drafts);
  }

  /**
   * One-off AI-sourced notification (daily briefing, proactive suggestion) with an
   * already-resolved channel list. Unlike scheduleTaskNotification/etc. this has no
   * cancel/replace semantics — each call is a distinct, already-deduplicated event.
   */
  async scheduleAgentNotification(userId: string, input: { title: string; message: string; channels: NotificationChannel[]; entityType?: string; entityId?: string; metadata?: Prisma.InputJsonValue }) {
    if (!input.channels.length) return [];
    const rows = input.channels.map((channel) => ({
      userId,
      type: NotificationType.AI,
      title: this.sanitize(input.title),
      message: this.sanitize(input.message),
      channel,
      entityType: input.entityType,
      entityId: input.entityId,
      scheduledAt: new Date(),
      metadata: input.metadata,
    }));
    return this.prisma.$transaction(rows.map((data) => this.prisma.notification.create({ data })));
  }

  cancelEntityNotifications(userId: string, entityType: string, entityId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, entityType, entityId, status: 'PENDING' },
      data: { status: 'CANCELLED', claimedAt: null, claimToken: null },
    });
  }

  async rescheduleEntityNotifications(userId: string, entityType: string, entityId: string, drafts: NotificationDraft[]) {
    await this.cancelEntityNotifications(userId, entityType, entityId);
    return this.replaceEntityNotifications(userId, entityType, entityId, drafts, true);
  }

  private async replaceEntityNotifications(userId: string, entityType: string, entityId: string, drafts: NotificationDraft[], alreadyCancelled = false) {
    if (!alreadyCancelled) await this.cancelEntityNotifications(userId, entityType, entityId);
    if (!drafts.length) return [];
    const preference = await this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
    const channels = drafts.length ? await this.channelsFor(drafts[0].type, preference, userId) : [];
    if (!channels.length) return [];
    const rows = drafts.flatMap((draft) => channels.map((channel) => ({
      userId,
      ...draft,
      title: this.sanitize(draft.title),
      message: this.sanitize(draft.message),
      channel,
      metadata: draft.metadata as Prisma.InputJsonValue | undefined,
    })));
    return this.prisma.$transaction(rows.map((data) => this.prisma.notification.create({ data })));
  }

  private async channelsFor(type: NotificationType, preference: { taskEnabled: boolean; reminderEnabled: boolean; meetingEnabled: boolean; aiEnabled: boolean; telegramEnabled: boolean; webPushEnabled: boolean }, userId: string): Promise<NotificationChannel[]> {
    const enabled = type === NotificationType.TASK ? preference.taskEnabled
      : type === NotificationType.REMINDER ? preference.reminderEnabled
        : type === NotificationType.MEETING ? preference.meetingEnabled
          : type === NotificationType.AI ? preference.aiEnabled : true;
    if (!enabled) return [];
    const channels: NotificationChannel[] = [NotificationChannel.IN_APP];
    if (preference.telegramEnabled) {
      const connection = await this.prisma.telegramConnection.findUnique({ where: { userId }, select: { status: true, telegramUserId: true } });
      if (connection?.status === TelegramConnectionStatus.CONNECTED && connection.telegramUserId) channels.push(NotificationChannel.TELEGRAM);
    }
    if (preference.webPushEnabled) channels.push(NotificationChannel.WEB_PUSH);
    return channels;
  }

  private sanitize(value: string): string {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  }
}
