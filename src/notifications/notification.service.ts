import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { localizeNotification } from './notification-localization';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, query: NotificationQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: NotificationChannel.IN_APP,
      type: query.type,
      status: query.unreadOnly ? NotificationStatus.SENT : { in: [NotificationStatus.SENT, NotificationStatus.READ] },
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [items, total, user] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } }),
    ]);
    return { items: items.map(item => localizeNotification(item, user?.language)), meta: paginationMeta(query.page, query.limit, total) };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, readAt: null },
    }).then((count) => ({ count }));
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification was not found');
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { status: notification.status === NotificationStatus.SENT ? NotificationStatus.READ : notification.status, readAt: new Date() },
    });
  }

  readAll(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, readAt: null },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    }).then(({ count }) => ({ count }));
  }

  async deleteForUser(userId: string, id: string) {
    const result = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Notification was not found');
    return { message: 'Notification deleted successfully' };
  }

  getPreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  updatePreferences(userId: string, dto: UpdateNotificationPreferenceDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
  }
}
