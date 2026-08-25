import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { parseDateTime, utcDayRange } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingQueryDto } from './dto/meeting-query.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly notificationScheduler?: NotificationSchedulerService,
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
    return meeting;
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
    return meeting;
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

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.meeting.delete({ where: { id } });
    await this.notificationScheduler?.cancelEntityNotifications(userId, 'MEETING', id);
    return { message: 'Meeting deleted successfully' };
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
}
