import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReminderStatus, TaskPriority } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { utcDayRange } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly notificationScheduler?: NotificationSchedulerService,
  ) {}

  async listForUser(userId: string, query: ReminderQueryDto) {
    if (query.active && query.completed) {
      throw new BadRequestException('active and completed filters cannot both be true');
    }
    const status = query.active
      ? ReminderStatus.ACTIVE
      : query.completed
        ? ReminderStatus.COMPLETED
        : undefined;
    const where: Prisma.ReminderWhereInput = {
      userId,
      status,
      priority: query.priority,
      ...(query.date
        ? (() => {
            const { start, end } = utcDayRange(query.date);
            return { remindAt: { gte: start, lt: end } };
          })()
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { description: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.reminder.findMany({
        where,
        orderBy: [{ remindAt: 'asc' }, { createdAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.reminder.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async getForUser(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findFirst({ where: { id, userId } });
    if (!reminder) {
      throw new NotFoundException('Reminder was not found');
    }
    return reminder;
  }

  async createForUser(userId: string, dto: CreateReminderDto) {
    const status = dto.status ?? ReminderStatus.ACTIVE;
    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        remindAt: new Date(dto.remindAt),
        status,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        completedAt: status === ReminderStatus.COMPLETED ? new Date() : undefined,
      },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.REMINDER_CREATED,
      entityType: 'REMINDER',
      entityId: reminder.id,
    });
    await this.notificationScheduler?.scheduleReminderNotification(userId, reminder);
    return reminder;
  }

  async updateForUser(userId: string, id: string, dto: UpdateReminderDto) {
    const current = await this.getForUser(userId, id);
    const status = dto.status ?? current.status;
    const reminder = await this.prisma.reminder.update({
      where: { id: current.id },
      data: {
        title: dto.title,
        description: dto.description,
        remindAt: dto.remindAt ? new Date(dto.remindAt) : undefined,
        status,
        priority: dto.priority,
        completedAt:
          status === ReminderStatus.COMPLETED
            ? current.completedAt ?? new Date()
            : null,
      },
    });
    await this.notificationScheduler?.scheduleReminderNotification(userId, reminder);
    return reminder;
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.reminder.delete({ where: { id } });
    await this.notificationScheduler?.cancelEntityNotifications(userId, 'REMINDER', id);
    return { message: 'Reminder deleted successfully' };
  }

  async completeForUser(userId: string, id: string) {
    await this.getForUser(userId, id);
    const reminder = await this.prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.COMPLETED, completedAt: new Date() },
    });
    await this.notificationScheduler?.cancelEntityNotifications(userId, 'REMINDER', id);
    return reminder;
  }
}
