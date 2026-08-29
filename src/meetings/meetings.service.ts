import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GoogleConnectionStatus, Meeting, MeetingStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { parseDateTime, utcDayRange } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingQueryDto } from './dto/meeting-query.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import { GoogleCalendarService } from '../google/google-calendar.service';

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly notificationScheduler?: NotificationSchedulerService,
    private readonly googleCalendar?: GoogleCalendarService,
  ) {}

  async listForUser(userId: string, query: MeetingQueryDto) {
    const startsAt: Prisma.DateTimeFilter = {};
    if (query.date) {
      Object.assign(startsAt, utcDayRange(query.date));
    }
    if (query.from) {
      startsAt.gte = parseDateTime(query.from);
    }
    if (query.to) {
      startsAt.lt = parseDateTime(query.to);
    }
    if (startsAt.gte && startsAt.lt && startsAt.gte >= startsAt.lt) {
      throw new BadRequestException('from must be before to');
    }

    const where: Prisma.MeetingWhereInput = {
      userId,
      status: query.status,
      ...(Object.keys(startsAt).length > 0 ? { startsAt } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.meeting.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async getForUser(userId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({ where: { id, userId } });
    if (!meeting) {
      throw new NotFoundException('Meeting was not found');
    }
    return this.syncCreatedMeeting(userId, meeting);
  }

  async createForUser(userId: string, dto: CreateMeetingDto) {
    await this.assertContactOwnership(userId, dto.contactId);
    const startsAt = parseDateTime(dto.startsAt);
    const endsAt = parseDateTime(dto.endsAt);
    this.assertTimeOrder(startsAt, endsAt);
    const meeting = await this.prisma.meeting.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        participant: dto.participant,
        location: dto.location,
        startsAt,
        endsAt,
        reminderMinutesBefore: dto.reminderMinutesBefore ?? 15,
        status: dto.status ?? MeetingStatus.SCHEDULED,
        contactId: dto.contactId,
      },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.MEETING_CREATED,
      entityType: 'MEETING',
      entityId: meeting.id,
    });
    await this.notificationScheduler?.scheduleMeetingNotification(userId, meeting);
    return this.syncUpdatedMeeting(userId, meeting);
  }

  async updateForUser(userId: string, id: string, dto: UpdateMeetingDto) {
    const current = await this.getForUser(userId, id);
    await this.assertContactOwnership(userId, dto.contactId);
    const startsAt = dto.startsAt ? parseDateTime(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? parseDateTime(dto.endsAt) : current.endsAt;
    this.assertTimeOrder(startsAt, endsAt);
    const meeting = await this.prisma.meeting.update({
      where: { id: current.id },
      data: {
        title: dto.title,
        description: dto.description,
        participant: dto.participant,
        location: dto.location,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        reminderMinutesBefore: dto.reminderMinutesBefore,
        status: dto.status,
        contactId: dto.contactId,
      },
    });
    await this.notificationScheduler?.scheduleMeetingNotification(userId, meeting);
    return meeting;
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string; googleSync: { synced: boolean; errorCode: string | null } }> {
    const meeting = await this.getForUser(userId, id);
    await this.prisma.meeting.delete({ where: { id } });
    await this.notificationScheduler?.cancelEntityNotifications(userId, 'MEETING', id);
    const googleSync = await this.deleteGoogleEvent(userId, meeting);
    return { message: 'Meeting deleted successfully', googleSync };
  }

  async cancelForUser(userId: string, id: string) {
    await this.getForUser(userId, id);
    const meeting = await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.CANCELLED },
    });
    await this.notificationScheduler?.cancelEntityNotifications(userId, 'MEETING', id);
    return meeting;
  }

  private assertTimeOrder(startsAt: Date, endsAt: Date): void {
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  private async assertContactOwnership(userId: string, contactId?: string | null): Promise<void> {
    if (!contactId) {
      return;
    }
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!contact) {
      throw new NotFoundException('Contact was not found');
    }
  }

  private async calendarEnabled(userId: string): Promise<boolean> {
    const connection = await this.prisma.googleConnection.findUnique({ where: { userId }, select: { status: true, scopes: true } });
    return connection?.status === GoogleConnectionStatus.CONNECTED
      && connection.scopes.some((scope: string) => scope === 'https://www.googleapis.com/auth/calendar' || scope.startsWith('https://www.googleapis.com/auth/calendar.'));
  }

  private googleDto(meeting: Meeting) {
    return {
      title: meeting.title,
      description: meeting.description ?? undefined,
      location: meeting.location ?? undefined,
      start: meeting.startsAt.toISOString(),
      end: meeting.endsAt.toISOString(),
      calendarId: meeting.googleCalendarId ?? 'primary',
    };
  }

  private async syncCreatedMeeting(userId: string, meeting: Meeting): Promise<Meeting> {
    if (!this.googleCalendar || !(await this.calendarEnabled(userId))) return meeting;
    try {
      const event = await this.googleCalendar.create(userId, this.googleDto(meeting));
      if (!event.id) throw new Error('Google event id missing');
      return await this.prisma.meeting.update({ where: { id: meeting.id }, data: { googleCalendarEventId: event.id, googleCalendarId: 'primary', googleSyncedAt: new Date(), googleSyncError: null } });
    } catch (error) {
      return this.markSyncFailure(meeting, 'GOOGLE_CALENDAR_CREATE_FAILED', error);
    }
  }

  private async syncUpdatedMeeting(userId: string, meeting: Meeting): Promise<Meeting> {
    if (!this.googleCalendar || !(await this.calendarEnabled(userId))) return meeting;
    if (!meeting.googleCalendarEventId) return this.syncCreatedMeeting(userId, meeting);
    try {
      await this.googleCalendar.update(userId, meeting.googleCalendarEventId, this.googleDto(meeting));
      return await this.prisma.meeting.update({ where: { id: meeting.id }, data: { googleSyncedAt: new Date(), googleSyncError: null } });
    } catch (error) {
      return this.markSyncFailure(meeting, 'GOOGLE_CALENDAR_UPDATE_FAILED', error);
    }
  }

  private async deleteGoogleEvent(userId: string, meeting: Meeting): Promise<{ synced: boolean; errorCode: string | null }> {
    if (!meeting.googleCalendarEventId || !this.googleCalendar) return { synced: true, errorCode: null };
    try {
      await this.googleCalendar.delete(userId, meeting.googleCalendarEventId, meeting.googleCalendarId ?? 'primary');
      return { synced: true, errorCode: null };
    } catch (error) {
      this.logSyncFailure(userId, meeting.id, 'GOOGLE_CALENDAR_DELETE_FAILED', error);
      return { synced: false, errorCode: 'GOOGLE_CALENDAR_DELETE_FAILED' };
    }
  }

  private async markSyncFailure(meeting: Meeting, errorCode: string, error: unknown): Promise<Meeting> {
    this.logSyncFailure(meeting.userId, meeting.id, errorCode, error);
    return this.prisma.meeting.update({ where: { id: meeting.id }, data: { googleSyncError: errorCode } });
  }

  private logSyncFailure(userId: string, meetingId: string, errorCode: string, error: unknown): void {
    this.logger.warn({ event: 'meeting_google_calendar_sync_failed', userRef: this.fingerprint(userId), meetingRef: this.fingerprint(meetingId), errorCode, httpStatus: error instanceof HttpException ? error.getStatus() : null, errorType: error instanceof Error ? error.constructor.name : 'Unknown' });
  }

  private fingerprint(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 12); }
}
