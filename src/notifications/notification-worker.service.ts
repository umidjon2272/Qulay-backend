import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly batchSize = 50;
  private readonly intervalMs = 45_000;
  private readonly leaseMs = 120_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
    private readonly activityLog: ActivityLogService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.processDueNotifications(), this.intervalMs);
    void this.processDueNotifications();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  health(): { status: 'running' | 'stopped' } {
    return { status: this.timer ? 'running' : 'stopped' };
  }

  async processDueNotifications(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      const candidates = await this.prisma.notification.findMany({
        where: {
          status: NotificationStatus.PENDING,
          scheduledAt: { lte: now },
          AND: [{ OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] }, { OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - this.leaseMs) } }] }],
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        take: this.batchSize,
      });
      for (const candidate of candidates) {
        const claimToken = randomUUID();
        const claimed = await this.prisma.notification.updateMany({
          where: { id: candidate.id, status: NotificationStatus.PENDING, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - this.leaseMs) } }] },
          data: { claimedAt: now, claimToken },
        });
        if (!claimed.count) continue;
        try {
          await this.delivery.deliver({ ...candidate, claimedAt: now, claimToken });
          await this.prisma.notification.updateMany({ where: { id: candidate.id, status: NotificationStatus.PENDING, claimToken }, data: { status: NotificationStatus.SENT, sentAt: new Date(), claimedAt: null, claimToken: null } });
          await this.activityLog.record({ userId: candidate.userId, action: ACTIVITY_ACTIONS.NOTIFICATION_SENT, entityType: 'NOTIFICATION', entityId: candidate.id, metadata: { channel: candidate.channel } });
        } catch (error) {
          const retryCount = candidate.retryCount + 1;
          const exhausted = retryCount >= 3;
          await this.prisma.notification.updateMany({ where: { id: candidate.id, status: NotificationStatus.PENDING, claimToken }, data: { retryCount, status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING, nextRetryAt: exhausted ? null : new Date(now.getTime() + retryCount * 60_000), failedAt: exhausted ? new Date() : null, claimedAt: null, claimToken: null } });
          if (exhausted) await this.activityLog.record({ userId: candidate.userId, action: ACTIVITY_ACTIONS.NOTIFICATION_FAILED, entityType: 'NOTIFICATION', entityId: candidate.id, metadata: { channel: candidate.channel } });
          this.logger.warn(`Notification ${candidate.id} delivery failed${error instanceof Error ? `: ${error.message}` : ''}`);
        }
        processed += 1;
      }
    } finally {
      this.running = false;
    }
    return processed;
  }
}
