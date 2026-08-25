import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { utcDayRange } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly notificationScheduler?: NotificationSchedulerService,
  ) {}

  async listForUser(userId: string, query: TaskQueryDto) {
    const where: Prisma.TaskWhereInput = {
      userId,
      status: query.status,
      priority: query.priority,
      ...(query.date
        ? (() => {
            const { start, end } = utcDayRange(query.date);
            return { dueDate: { gte: start, lt: end } };
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
      this.prisma.task.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async getForUser(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!task) {
      throw new NotFoundException('Task was not found');
    }
    return task;
  }

  async createForUser(userId: string, dto: CreateTaskDto) {
    const status = dto.status ?? TaskStatus.TODO;
    const task = await this.prisma.task.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        status,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        completedAt: status === TaskStatus.COMPLETED ? new Date() : undefined,
      },
    });
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.TASK_CREATED,
      entityType: 'TASK',
      entityId: task.id,
    });
    await this.notificationScheduler?.scheduleTaskNotification(userId, task);
    return task;
  }

  async updateForUser(userId: string, id: string, dto: UpdateTaskDto) {
    const current = await this.getForUser(userId, id);
    const status = dto.status ?? current.status;
    const task = await this.prisma.task.update({
      where: { id: current.id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate === undefined ? undefined : new Date(dto.dueDate),
        status,
        completedAt:
          status === TaskStatus.COMPLETED
            ? current.completedAt ?? new Date()
            : null,
      },
    });
    await this.notificationScheduler?.scheduleTaskNotification(userId, task);
    return task;
  }

  async deleteForUser(userId: string, id: string): Promise<{ message: string }> {
    await this.getForUser(userId, id);
    await this.prisma.task.delete({ where: { id } });
    await this.notificationScheduler?.cancelEntityNotifications(userId, 'TASK', id);
    return { message: 'Task deleted successfully' };
  }

  async completeForUser(userId: string, id: string) {
    await this.getForUser(userId, id);
    const task = await this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
    });
    await this.notificationScheduler?.cancelEntityNotifications(userId, 'TASK', id);
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.TASK_COMPLETED,
      entityType: 'TASK',
      entityId: task.id,
    });
    return task;
  }

  async reopenForUser(userId: string, id: string) {
    await this.getForUser(userId, id);
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.TODO, completedAt: null },
    }).then(async (task) => {
      await this.notificationScheduler?.scheduleTaskNotification(userId, task);
      return task;
    });
  }
}
