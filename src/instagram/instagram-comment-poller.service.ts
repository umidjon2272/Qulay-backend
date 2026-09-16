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
  // Do not replay a tester account's historical comments when the bridge is
  // enabled for the first time. A small grace window catches comments sent
  // during a deploy/restart; durable SalesInboundReceipt rows dedupe replays.
  private readonly acceptAfter = new Date(Date.now() - 5 * 60 * 1000);

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
      select: { userId: true, instagramUserId: true },
      take: 200,
    });

    for (const connection of connections) {
      try {
        const posts = await this.graph.listMedia(connection.userId, 12);
        for (const post of posts) {
          const comments = await this.graph.listMediaComments(connection.userId, post.id, 50);
          comments.sort((a, b) => this.timeOf(a.timestamp) - this.timeOf(b.timestamp));
          for (const comment of comments) {
            // Never replay an old/unknown comment just because the development
            // bridge was enabled. Meta normally returns timestamp; if it does
            // not, fail closed and wait for a normal webhook/new poll result.
            const timestampMs = comment.timestamp ? Date.parse(comment.timestamp) : Number.NaN;
            if (!Number.isFinite(timestampMs) || timestampMs < this.acceptAfter.getTime()) continue;
            if (comment.commenterId === connection.instagramUserId) continue;
            await this.sales.handlePolledComment(connection.userId, {
              commentId: comment.id,
              commenterId: comment.commenterId,
              username: comment.username,
              text: comment.text,
              mediaId: comment.mediaId,
            });
          }
        }
        this.logger.debug({ event: 'instagram_dev_comment_poll_ok', userId: this.safeId(connection.userId), posts: posts.length });
      } catch (error) {
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
