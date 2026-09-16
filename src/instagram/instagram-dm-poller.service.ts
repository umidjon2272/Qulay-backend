import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramAuthMode, InstagramConnectionStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramGraphService } from './instagram-graph.service';
import { InstagramSalesAgentService } from './instagram-sales-agent.service';

const INITIAL_LOOKBACK_MS = 10 * 60 * 1000;

@Injectable()
export class InstagramDmPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InstagramDmPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly graph: InstagramGraphService,
    private readonly sales: InstagramSalesAgentService,
  ) {}

  onModuleInit(): void {
    // The same opt-in bridge covers comments and Direct while the Meta app is
    // unpublished. Webhook delivery remains the normal production path.
    if (this.config.get<boolean>('instagram.devCommentPollEnabled') !== true) return;
    const interval = Math.max(15_000, this.config.get<number>('instagram.devCommentPollIntervalMs', 60_000));
    setTimeout(() => void this.tickSafely(), 8_000).unref?.();
    this.timer = setInterval(() => void this.tickSafely(), interval);
    this.timer.unref?.();
    this.logger.warn({ event: 'instagram_dev_dm_poll_enabled', intervalMs: interval });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tickSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { await this.tick(); }
    catch (error) { this.logger.warn({ event: 'instagram_dev_dm_poll_failed', code: this.errorCode(error) }); }
    finally { this.running = false; }
  }

  async tick(): Promise<void> {
    if (this.config.get<boolean>('instagram.devCommentPollEnabled') !== true) return;
    const connections = await this.prisma.instagramConnection.findMany({
      where: {
        status: { in: [InstagramConnectionStatus.CONNECTED, InstagramConnectionStatus.DEGRADED] },
        authMode: InstagramAuthMode.INSTAGRAM_LOGIN,
        salesAgentEnabled: true,
        dmEnabled: true,
      },
      select: { userId: true, instagramUserId: true, dmPollCursorAt: true },
      take: 200,
    });

    for (const connection of connections) {
      const tickStartedAt = new Date();
      const pollCursor = connection.dmPollCursorAt ?? new Date(tickStartedAt.getTime() - INITIAL_LOOKBACK_MS);
      if (!connection.dmPollCursorAt) {
        await this.prisma.instagramConnection.update({ where: { userId: connection.userId }, data: { dmPollCursorAt: pollCursor } });
        this.logger.debug({ event: 'instagram_dev_dm_poll_initialized', userId: this.safeId(connection.userId), lookbackMs: INITIAL_LOOKBACK_MS });
      }

      try {
        const conversations = await this.graph.listConversations(connection.userId, 50);
        let conversationsChecked = 0;
        let messagesFetched = 0;
        let messagesAccepted = 0;
        let skippedOld = 0;
        let skippedSelf = 0;
        let skippedNoTimestamp = 0;
        let handled = 0;
        let failed = 0;

        for (const conversation of conversations) {
          const updated = this.timeOf(conversation.updatedTime);
          if (updated > 0 && updated < pollCursor.getTime()) continue;
          conversationsChecked += 1;
          const messages = await this.graph.listConversationMessages(connection.userId, conversation.id);
          messagesFetched += messages.length;
          messages.sort((a, b) => this.timeOf(a.createdTime) - this.timeOf(b.createdTime));
          for (const message of messages) {
            const createdAt = this.timeOf(message.createdTime);
            if (!createdAt) { skippedNoTimestamp += 1; continue; }
            if (createdAt < pollCursor.getTime()) { skippedOld += 1; continue; }
            if (message.fromId === connection.instagramUserId) { skippedSelf += 1; continue; }
            messagesAccepted += 1;
            const routed = await this.sales.handlePolledDm(connection.userId, {
              messageId: message.id,
              senderId: message.fromId,
              recipientId: connection.instagramUserId,
              text: message.text,
              imageUrls: message.imageUrls,
              username: message.fromUsername,
              displayName: message.fromUsername,
            });
            if (routed) handled += 1;
            else failed += 1;
          }
        }

        // Keep the previous cursor when any accepted message failed so the
        // durable sales receipt can retry it on the next tick. Successfully
        // handled messages are idempotent and will be skipped by their receipt.
        if (failed === 0) {
          await this.prisma.instagramConnection.update({ where: { userId: connection.userId }, data: { dmPollCursorAt: tickStartedAt } });
        }
        this.logger.debug({
          event: 'instagram_dev_dm_poll_ok',
          userId: this.safeId(connection.userId),
          conversations: conversations.length,
          conversationsChecked,
          messagesFetched,
          messagesAccepted,
          skippedOld,
          skippedSelf,
          skippedNoTimestamp,
          handled,
          failed,
          cursorAdvanced: failed === 0,
        });
      } catch (error) {
        this.logger.warn({ event: 'instagram_dev_dm_poll_account_failed', userId: this.safeId(connection.userId), code: this.errorCode(error) });
      }
    }
  }

  private timeOf(value: string | null): number {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private safeId(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 10);
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      const candidate = error as { getResponse?: () => unknown; message?: unknown };
      const response = typeof candidate.getResponse === 'function' ? candidate.getResponse() : null;
      if (response && typeof response === 'object' && 'code' in response && typeof (response as { code?: unknown }).code === 'string') return (response as { code: string }).code;
      if (typeof candidate.message === 'string') return candidate.message.match(/[A-Z][A-Z0-9_]{3,}/u)?.[0] ?? 'FAILED';
    }
    return 'FAILED';
  }
}
