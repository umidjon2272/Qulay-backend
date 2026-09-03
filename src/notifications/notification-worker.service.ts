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
  private readonly intervalMs = 15_000;
  private readonly leaseMs = 120_000;
  private readonly maxRetries = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
    private readonly activityLog: ActivityLogService,
  ) {}

  onModuleInit() {
    const tick = () => void this.processDueNotifications().catch(() => this.logger.warn('Notification queue temporarily unavailable'));
    this.timer = setInterval(tick, this.intervalMs);
    tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  health(): { status: 'running' | 'stopped' } {
    return { status: this.timer ? 'running' : 'stopped' };
  }

  config(): { intervalMs: number; batchSize: number; retryLimit: number; leaseMs: number } {
    return { intervalMs: this.intervalMs, batchSize: this.batchSize, retryLimit: this.maxRetries, leaseMs: this.leaseMs };
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
      // In-app delivery is independent of external transports; a slow Telegram
      // request must not delay the browser's notification inbox.
      const lanes = [candidates.filter(n => n.channel === 'IN_APP'), candidates.filter(n => n.channel !== 'IN_APP')];
      const results = await Promise.allSettled(lanes.map(async lane => { for (const candidate of lane) {
        const claimToken = randomUUID();
        const claimedAt = new Date();
        const claimed = await this.prisma.notification.updateMany({
          where: { id: candidate.id, status: NotificationStatus.PENDING, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(claimedAt.getTime() - this.leaseMs) } }] },
          data: { claimedAt, claimToken },
        });
        if (!claimed.count) continue;
        try {
          const live = await this.prisma.notification.findFirst({ where: { id: candidate.id, status: NotificationStatus.PENDING, claimToken } });
          if (!live) continue; // Cancelled/replaced/deleted since the claim.
          await this.delivery.deliver({ ...candidate, claimedAt, claimToken });
          await this.prisma.notification.updateMany({ where: { id: candidate.id, status: NotificationStatus.PENDING, claimToken }, data: { status: NotificationStatus.SENT, sentAt: new Date(), claimedAt: null, claimToken: null } });
          await this.activityLog.record({ userId: candidate.userId, action: ACTIVITY_ACTIONS.NOTIFICATION_SENT, entityType: 'NOTIFICATION', entityId: candidate.id, metadata: { channel: candidate.channel } }).catch(() => undefined);
        } catch {
          const retryCount = candidate.retryCount + 1;
          const exhausted = retryCount >= this.maxRetries;
          await this.prisma.notification.updateMany({ where: { id: candidate.id, status: NotificationStatus.PENDING, claimToken }, data: { retryCount, status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING, nextRetryAt: exhausted ? null : new Date(now.getTime() + retryCount * 60_000), failedAt: exhausted ? new Date() : null, claimedAt: null, claimToken: null } });
          if (exhausted) await this.activityLog.record({ userId: candidate.userId, action: ACTIVITY_ACTIONS.NOTIFICATION_FAILED, entityType: 'NOTIFICATION', entityId: candidate.id, metadata: { channel: candidate.channel } }).catch(() => undefined);
          this.logger.warn(`Notification ${candidate.id} delivery failed`);
        }
        processed += 1;
      } }));
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    } finally {
      this.running = false;
    }
    return processed;
  }
}
