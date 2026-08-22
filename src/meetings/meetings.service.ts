import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, Prisma } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { parseDateTime, utcDayRange } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingQueryDto } from './dto/meeting-query.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
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
    const startsAt = parseDateTime(dto.startsAt);
    const endsAt = parseDateTime(dto.endsAt);
    this.assertTimeOrder(startsAt, endsAt);
    const meeting = await this.prisma.meeting.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        participant: dto.participant,
        startsAt,
        endsAt,
        reminderMinutesBefore: dto.reminderMinutesBefore ?? 15,
        status: dto.status ?? MeetingStatus.SCHEDULED,
      },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.MEETING_CREATED,
      entityType: 'MEETING',
      entityId: meeting.id,
    });
    return meeting;
  }

  async updateForUser(userId: string, id: string, dto: UpdateMeetingDto) {
    const current = await this.getForUser(userId, id);
    const startsAt = dto.startsAt ? parseDateTime(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? parseDateTime(dto.endsAt) : current.endsAt;
    this.assertTimeOrder(startsAt, endsAt);
    return this.prisma.meeting.update({
      where: { id: current.id },
      data: {
        title: dto.title,
        description: dto.description,
        participant: dto.participant,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        reminderMinutesBefore: dto.reminderMinutesBefore,
        status: dto.status,
      },
    });
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.meeting.delete({ where: { id } });
    return { message: 'Meeting deleted successfully' };
  }

  async cancelForUser(userId: string, id: string) {
    await this.getForUser(userId, id);
    return this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.CANCELLED },
    });
  }

  private assertTimeOrder(startsAt: Date, endsAt: Date): void {
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }
}
