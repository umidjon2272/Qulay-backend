import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramConnectionStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramGraphService } from './instagram-graph.service';
import { InstagramSalesAgentService } from './instagram-sales-agent.service';

@Injectable()
export class InstagramCommentPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InstagramCommentPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly graph: InstagramGraphService,
    private readonly sales: InstagramSalesAgentService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<boolean>('instagram.devCommentPollEnabled') !== true) return;
    const interval = Math.max(15_000, this.config.get<number>('instagram.devCommentPollIntervalMs', 60_000));
    setTimeout(() => void this.tickSafely(), 3_000).unref?.();
    this.timer = setInterval(() => void this.tickSafely(), interval);
    this.timer.unref?.();
    this.logger.warn({ event: 'instagram_dev_comment_poll_enabled', intervalMs: interval });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tickSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (error) {
      this.logger.warn({ event: 'instagram_dev_comment_poll_failed', code: this.errorCode(error) });
    } finally {
      this.running = false;
    }
  }

  async tick(): Promise<void> {
    if (this.config.get<boolean>('instagram.devCommentPollEnabled') !== true) return;
    const connections = await this.prisma.instagramConnection.findMany({
      where: {
        status: { in: [InstagramConnectionStatus.CONNECTED, InstagramConnectionStatus.DEGRADED] },
        salesAgentEnabled: true,
        commentsEnabled: true,
      },
      select: { userId: true, instagramUserId: true, commentPollCursorAt: true },
      take: 200,
    });

    for (const connection of connections) {
      const tickStartedAt = new Date();
      if (!connection.commentPollCursorAt) {
        // Persistent baseline: historical comments existing before the bridge is
        // enabled are never replayed, while restarts keep the same durable cursor.
        await this.prisma.instagramConnection.update({
          where: { userId: connection.userId },
          data: { commentPollCursorAt: tickStartedAt },
        });
        this.logger.debug({ event: 'instagram_dev_comment_poll_initialized', userId: this.safeId(connection.userId) });
        continue;
      }

      try {
        const recentPosts = await this.graph.listMedia(connection.userId, 50);
        const automationRows = await this.prisma.instagramCommentAutomation.findMany({
          where: { userId: connection.userId, active: true },
          select: { mediaId: true },
          take: 200,
        });
        const mediaIds = [...new Set([...recentPosts.map(post => post.id), ...automationRows.map(row => row.mediaId)])].filter(Boolean);
        let commentsFetched = 0;
        let commentsAccepted = 0;
        let skippedOld = 0;
        let skippedSelf = 0;
        let skippedNoTimestamp = 0;
        let handled = 0;
        let failed = 0;

        for (const mediaId of mediaIds) {
          const comments = await this.graph.listMediaComments(connection.userId, mediaId, 500);
          commentsFetched += comments.length;
          comments.sort((a, b) => this.timeOf(a.timestamp) - this.timeOf(b.timestamp));
          for (const comment of comments) {
            const timestampMs = comment.timestamp ? Date.parse(comment.timestamp) : Number.NaN;
            if (!Number.isFinite(timestampMs)) {
              skippedNoTimestamp += 1;
              continue;
            }
            if (timestampMs < connection.commentPollCursorAt.getTime()) {
              skippedOld += 1;
              continue;
            }
            if (comment.commenterId === connection.instagramUserId) {
              skippedSelf += 1;
              continue;
            }
            commentsAccepted += 1;
            const routed = await this.sales.handlePolledComment(connection.userId, {
              commentId: comment.id,
              commenterId: comment.commenterId,
              username: comment.username,
              text: comment.text,
              mediaId: comment.mediaId,
            });
            if (routed) handled += 1;
            else failed += 1;
          }
        }

        // Advance only when every accepted comment finished. If a delivery
        // failed, keep the old cursor; durable receipts dedupe already-complete
        // comments while the failed comment becomes eligible for the next poll.
        if (failed === 0) {
          await this.prisma.instagramConnection.update({
            where: { userId: connection.userId },
            data: { commentPollCursorAt: tickStartedAt },
          });
        }
        this.logger.debug({
          event: 'instagram_dev_comment_poll_ok',
          userId: this.safeId(connection.userId),
          posts: mediaIds.length,
          commentsFetched,
          commentsAccepted,
          skippedOld,
          skippedSelf,
          skippedNoTimestamp,
          handled,
          failed,
          cursorAdvanced: failed === 0,
        });
      } catch (error) {
        // Cursor is intentionally not advanced: the same interval can retry.
        this.logger.warn({ event: 'instagram_dev_comment_poll_account_failed', userId: this.safeId(connection.userId), code: this.errorCode(error) });
      }
    }
  }

  private timeOf(value: string | null): number {
    if (!value) return 0;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  private safeId(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 10);
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message.match(/[A-Z][A-Z0-9_]{3,}/u)?.[0] ?? 'FAILED';
    }
    return 'FAILED';
  }
}
