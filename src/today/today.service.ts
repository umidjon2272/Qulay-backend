import { Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, Prisma, TaskStatus } from '@prisma/client';
import { dateKeyInTimezone, zonedDayRange } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TodayService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string, date?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    if (!user) {
      throw new NotFoundException('User was not found');
    }

    const now = new Date();
    const dateKey = date ?? dateKeyInTimezone(now, user.timezone);
    const { start, end } = zonedDayRange(dateKey, user.timezone);
    const taskTodayWhere: Prisma.TaskWhereInput = {
      userId,
      dueDate: { gte: start, lt: end },
    };
    const reminderTodayWhere: Prisma.ReminderWhereInput = {
      userId,
      remindAt: { gte: start, lt: end },
    };
    const meetingTodayWhere: Prisma.MeetingWhereInput = {
      userId,
      startsAt: { gte: start, lt: end },
    };

    const [tasks, reminders, meetings, overdueTasks, nextMeeting] = await Promise.all([
      this.prisma.task.findMany({
        where: taskTodayWhere,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.reminder.findMany({
        where: reminderTodayWhere,
        orderBy: [{ remindAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.meeting.findMany({
        where: meetingTodayWhere,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.task.findMany({
        where: {
          userId,
          status: { not: TaskStatus.COMPLETED },
          dueDate: { lt: now },
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.meeting.findFirst({
        where: {
          userId,
          status: MeetingStatus.SCHEDULED,
          startsAt: { gte: now },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    return {
      date: dateKey,
      timezone: user.timezone,
      tasks,
      reminders,
      meetings,
      overdueTasks,
      nextMeeting,
    };
  }
}
