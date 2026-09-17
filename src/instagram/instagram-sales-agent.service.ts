import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { SalesVisionService, SalesImageUnderstanding } from '../ai-agent/sales-vision.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { coerceUniversalSalesState, customerSafeSalesAnswer, normalizeSalesTextForUnderstanding, professionalSalesFallbackReply } from '../ai-agent/universal-sales-context';
import { reserveSalesInboundTurn, runSalesTurnSequential } from '../ai-agent/sales-turn-coordinator';
import { InstagramGraphService } from './instagram-graph.service';
import { InstagramCommentMatcherService } from './instagram-comment-matcher.service';

const SALES_CONTEXT_MS = 2 * 60 * 60 * 1000;
const SOFT_EXIT_MS = 15 * 60 * 1000;

export type InstagramDmEvent = {
  messageId: string;
  senderId: string;
  recipientId: string;
  text: string;
  imageUrls: string[];
  username?: string | null;
  displayName?: string | null;
};

export type InstagramCommentEvent = {
  commentId: string;
  commenterId: string;
  username: string | null;
  text: string;
  mediaId: string;
};

@Injectable()
export class InstagramSalesAgentService {
  private readonly logger = new Logger(InstagramSalesAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: InstagramGraphService,
    private readonly ai: AiAgentService,
    private readonly vision: SalesVisionService,
    private readonly subscriptions: SubscriptionsService,
    private readonly matcher: InstagramCommentMatcherService,
  ) {}

  verifyWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    const secret = this.graph.appSecret();
    if (!secret || !rawBody?.length || !signature?.startsWith('sha256=')) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
    const actual = Buffer.from(signature.slice(7), 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async handleWebhook(payload: unknown): Promise<void> {
    const root = objectOf(payload);
    const object = textOf(root.object);
    if (object && object !== 'instagram' && object !== 'page') return;
    const entries = arrayOf(root.entry);
    for (const rawEntry of entries) {
      const entry = objectOf(rawEntry);
      const entryId = textOf(entry.id);

      for (const rawMessaging of arrayOf(entry.messaging)) {
        const messaging = objectOf(rawMessaging);
        const senderId = textOf(objectOf(messaging.sender).id);
        const recipientId = textOf(objectOf(messaging.recipient).id) || entryId;
        const message = objectOf(messaging.message);
        const messageId = textOf(message.mid) || textOf(messaging.mid);
        if (!senderId || !recipientId || !messageId || message.is_echo === true) continue;
        const connection = await this.findConnection(recipientId, entryId);
        if (!connection?.salesAgentEnabled || !connection.dmEnabled || !['CONNECTED', 'DEGRADED'].includes(connection.status)) continue;
        const imageUrls = arrayOf(message.attachments).map(item => objectOf(item)).filter(item => textOf(item.type) === 'image').map(item => textOf(objectOf(item.payload).url)).filter((value): value is string => Boolean(value));
        void this.handleDm(connection.userId, {
          messageId,
          senderId,
          recipientId,
          text: textOf(message.text) || '',
          imageUrls,
        });
      }

      for (const rawChange of arrayOf(entry.changes)) {
        const change = objectOf(rawChange);
        const field = textOf(change.field);
        const value = objectOf(change.value);
        if (field === 'comments' || field === 'live_comments') {
          const commentId = textOf(value.id) || textOf(value.comment_id);
          const text = textOf(value.text) || textOf(value.message) || '';
          const from = objectOf(value.from);
          const commenterId = textOf(from.id) || textOf(value.from_id);
          const username = textOf(from.username) || textOf(value.username);
          const media = objectOf(value.media);
          const mediaId = textOf(media.id) || textOf(value.media_id);
          if (!commentId || !commenterId || !mediaId) continue;
          const connection = await this.findConnection(entryId, textOf(value.recipient_id));
          if (!connection?.salesAgentEnabled || !connection.commentsEnabled || !['CONNECTED', 'DEGRADED'].includes(connection.status)) continue;
          if (commenterId === connection.instagramUserId) continue;
          void this.handleComment(connection.userId, { commentId, commenterId, username, text, mediaId });
          continue;
        }

        // Some Meta webhook versions surface messaging through changes rather
        // than entry.messaging. Parse a conservative common shape too.
        if (field === 'messages' || field === 'messaging') {
          const senderId = textOf(objectOf(value.sender).id) || textOf(value.sender_id);
          const recipientId = textOf(objectOf(value.recipient).id) || textOf(value.recipient_id) || entryId;
          const message = objectOf(value.message);
          const messageId = textOf(message.mid) || textOf(value.mid) || textOf(value.message_id);
          if (!senderId || !recipientId || !messageId || message.is_echo === true) continue;
          const connection = await this.findConnection(recipientId, entryId);
          if (!connection?.salesAgentEnabled || !connection.dmEnabled || !['CONNECTED', 'DEGRADED'].includes(connection.status)) continue;
          const imageUrls = arrayOf(message.attachments).map(item => objectOf(item)).filter(item => textOf(item.type) === 'image').map(item => textOf(objectOf(item.payload).url)).filter((candidate): candidate is string => Boolean(candidate));
          void this.handleDm(connection.userId, { messageId, senderId, recipientId, text: textOf(message.text) || '', imageUrls });
        }
      }
    }
  }

  async handlePolledComment(userId: string, event: InstagramCommentEvent): Promise<boolean> {
    return this.handleComment(userId, event);
  }

  async handlePolledDm(userId: string, event: InstagramDmEvent): Promise<boolean> {
    return this.handleDm(userId, event);
  }

  private async handleDm(userId: string, event: InstagramDmEvent): Promise<boolean> {
    let turn;
    try { turn = await reserveSalesInboundTurn(this.prisma, 'INSTAGRAM', userId, event.senderId, event.messageId); }
    catch (error) {
      this.logger.warn({ event: 'instagram_sales_receipt_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
      return false;
    }
    // Existing receipt means this exact webhook/polled message was already
    // accepted by another delivery path. Treat it as handled for the poller.
    if (!turn) return true;
    return runSalesTurnSequential(turn, async () => {
      try {
        await Promise.all([
          this.subscriptions.assertFeatureAllowed(userId, 'INSTAGRAM_SALES'),
          this.subscriptions.assertAiAllowed(userId),
        ]);
        const connection = await this.prisma.instagramConnection.findUnique({ where: { userId } });
        if (!connection?.salesAgentEnabled || !connection.dmEnabled || !['CONNECTED', 'DEGRADED'].includes(connection.status)) return true;
        const session = await this.ensureSession(userId, event.senderId, event.username ?? null, event.displayName ?? null);
        const active = Boolean(session.lastInboundAt || session.salesState || session.salesContextUntil);
        let imageUnderstanding: SalesImageUnderstanding | undefined;
        if (connection.imageVisionEnabled && event.imageUrls[0]) {
          try {
            const image = await this.graph.downloadAttachment(event.imageUrls[0]);
            imageUnderstanding = await this.vision.understandProductImage(userId, { buffer: image.buffer, mimeType: image.mimeType, caption: event.text });
          } catch (error) {
            this.logger.warn({ event: 'instagram_sales_image_understanding_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
          }
        }
        const text = event.text.trim() || (imageUnderstanding ? 'Shunaqasi bormi?' : 'Salom');
        const state = coerceUniversalSalesState(session.salesState);
        const contextUntil = new Date(Date.now() + SALES_CONTEXT_MS);
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { salesContextUntil: contextUntil, lastInboundAt: new Date() } });
        const result = await this.ai.chat(userId, { message: text, conversationId: session.conversationId }, undefined, turn.signal, {
          externalSales: true,
          professionalInbox: true,
          newSalesEpoch: !active,
          channel: 'INSTAGRAM',
          surface: 'DM',
          customer: { peerName: event.displayName ?? event.username ?? null, peerType: 'USER', senderName: event.displayName ?? event.username ?? null },
          salesState: state,
          normalizedCustomerText: normalizeSalesTextForUnderstanding(text),
          visualProductHint: imageUnderstanding,
        });
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { salesState: state as unknown as Prisma.InputJsonValue } });
        let answer = result.message?.trim() || (imageUnderstanding
          ? 'Rasmdagiga o‘xshash variantlarni ko‘rib beraman. Qaysi xususiyati siz uchun muhim?'
          : professionalSalesFallbackReply(state, text));
        if ('suppressReply' in result && result.suppressReply === true) {
          answer = professionalSalesFallbackReply(state, text);
        }
        if (result.pendingConfirmation) answer = 'Buyurtma ma’lumotlarini tayyorlab turaman. Yakunlash uchun kerakli ma’lumotni birga aniqlaymiz.';
        answer = customerSafeSalesAnswer(answer, state).slice(0, 950);
        await this.graph.sendText(userId, event.senderId, answer);
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { lastOutboundAt: new Date(), salesContextUntil: state.lastIntent === 'SOFT_EXIT' ? new Date(Date.now() + SOFT_EXIT_MS) : contextUntil } });
        return true;
      } catch (error) {
        const code = this.graph.errorCode(error);
        if (error instanceof ForbiddenException) {
          this.logger.warn({ event: 'instagram_sales_dm_blocked', userId: this.graph.safeId(userId), code });
          await this.graph.sendText(userId, event.senderId, 'Salom 🙂 Hozir AI javobida vaqtinchalik cheklov bor. Savolingizni yozib qoldiring.').catch(() => undefined);
          return true;
        }
        // Transient processing failures release the receipt so webhook/poller
        // delivery can retry. A handled fallback above keeps its receipt.
        await this.prisma.salesInboundReceipt.deleteMany({
          where: { channel: 'INSTAGRAM', userId, peerId: event.senderId, messageId: event.messageId },
        }).catch(() => undefined);
        this.logger.warn({ event: 'instagram_sales_dm_failed', userId: this.graph.safeId(userId), code });
        await this.graph.sendText(userId, event.senderId, 'Hozir javob berishda vaqtinchalik muammo bo‘ldi. Iltimos, savolni yana bir marta yozib ko‘ring.').catch(() => undefined);
        return false;
      }
    });
  }

  private async handleComment(userId: string, event: InstagramCommentEvent): Promise<boolean> {
    let turn;
    try { turn = await reserveSalesInboundTurn(this.prisma, 'INSTAGRAM', userId, `comment:${event.commenterId}`, event.commentId); }
    catch (error) {
      this.logger.warn({ event: 'instagram_comment_receipt_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
      return false;
    }
    // A duplicate receipt means another webhook/poll delivery already accepted
    // this exact comment. Treat it as handled so the poll cursor may advance.
    if (!turn) return true;
    return runSalesTurnSequential(turn, async () => {
      try {
        // Deterministic/typo-tolerant automations must work even when AI credits
        // are exhausted. Feature entitlement is still required, but AI credit
        // gating happens only after cheap local matching has had a chance.
        await this.subscriptions.assertFeatureAllowed(userId, 'INSTAGRAM_SALES');
        const quickAutomation = await this.runCommentAutomations(userId, event, false);
        if (quickAutomation.matched) {
          if (!quickAutomation.complete) {
            await this.releaseCommentInboundReceipt(userId, event);
            return false;
          }
          return true;
        }

        await this.subscriptions.assertAiAllowed(userId);
        const semanticAutomation = await this.runCommentAutomations(userId, event, true);
        if (semanticAutomation.matched) {
          if (!semanticAutomation.complete) {
            await this.releaseCommentInboundReceipt(userId, event);
            return false;
          }
          return true;
        }

        const media = await this.graph.getMedia(userId, event.mediaId);
        const session = await this.ensureSession(userId, event.commenterId, event.username, event.username);
        const active = Boolean(session.lastInboundAt || session.salesState || session.salesContextUntil);
        const state = coerceUniversalSalesState(session.salesState);
        const message = event.text.trim() || 'Salom';
        const result = await this.ai.chat(userId, { message, conversationId: session.conversationId }, undefined, turn.signal, {
          externalSales: true,
          professionalInbox: true,
          newSalesEpoch: !active,
          channel: 'INSTAGRAM',
          surface: 'COMMENT',
          customer: { peerName: event.username, peerType: 'USER', senderName: event.username },
          salesState: state,
          normalizedCustomerText: normalizeSalesTextForUnderstanding(message),
          sourceContext: media?.caption ? `Instagram post caption: ${media.caption.slice(0, 1200)}` : undefined,
        });
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { salesState: state as unknown as Prisma.InputJsonValue, lastInboundAt: new Date() } });
        const rawAnswer = ('suppressReply' in result && result.suppressReply === true)
          ? professionalSalesFallbackReply(state, message)
          : (result.message?.trim() || professionalSalesFallbackReply(state, message));
        const answer = customerSafeSalesAnswer(rawAnswer, state).slice(0, 900);
        if (answer) await this.graph.replyToComment(userId, event.commentId, answer);
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { lastOutboundAt: new Date(), salesContextUntil: new Date(Date.now() + SALES_CONTEXT_MS) } });
        return true;
      } catch (error) {
        if (error instanceof ForbiddenException) {
          this.logger.warn({ event: 'instagram_comment_agent_blocked', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
          await this.graph.replyToComment(userId, event.commentId, 'Salom 🙂 Yordam beraman. Nima kerakligini yozing.').catch(() => undefined);
          return true;
        }
        // Only transient failures release the receipt for retry.
        await this.releaseCommentInboundReceipt(userId, event);
        this.logger.warn({ event: 'instagram_comment_agent_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
        return false;
      }
    });
  }

  private async runCommentAutomations(
    userId: string,
    event: InstagramCommentEvent,
    allowAi: boolean,
  ): Promise<{ matched: boolean; complete: boolean }> {
    const automations = await this.prisma.instagramCommentAutomation.findMany({
      where: { userId, mediaId: event.mediaId, active: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });
    for (const automation of automations) {
      const matches = await this.matcher.matches(
        userId,
        event.text,
        automation.triggerText,
        automation.semanticMatch,
        automation.mediaCaption,
        allowAi,
      );
      if (!matches) continue;

      let receipt = await this.findOrCreateAutomationReceipt(userId, automation.id, event.commentId, event.commenterId);
      if (receipt.completedAt) return { matched: true, complete: true };
      if (receipt.nextRetryAt && receipt.nextRetryAt.getTime() > Date.now()) return { matched: true, complete: false };

      const attemptCount = (receipt.attemptCount ?? 0) + 1;
      receipt = await this.prisma.instagramAutomationReceipt.update({
        where: { id: receipt.id },
        data: { attemptCount, nextRetryAt: null, lastErrorCode: null },
      });

      let privateDone = !automation.sendPrivateReply || Boolean(receipt.privateSentAt);
      let publicDone = !automation.replyPublicly || Boolean(receipt.publicSentAt);
      let failureCode: string | null = null;

      if (!privateDone) {
        try {
          await this.graph.privateReplyToComment(userId, event.commentId, automation.dmMessage);
          receipt = await this.prisma.instagramAutomationReceipt.update({
            where: { id: receipt.id },
            data: { privateSentAt: new Date() },
          });
          privateDone = true;
        } catch (error) {
          failureCode = this.graph.errorCode(error);
          this.logger.warn({
            event: 'instagram_comment_automation_private_failed',
            userId: this.graph.safeId(userId),
            code: failureCode,
          });
        }
      }

      // Public reply is deliberately independent from the private reply. A Meta
      // restriction on one leg must never suppress the other leg, and retries
      // remember which leg has already succeeded.
      if (!publicDone) {
        try {
          await this.graph.replyToComment(userId, event.commentId, automation.publicReply?.trim() || 'Directga yubordim ✅');
          receipt = await this.prisma.instagramAutomationReceipt.update({
            where: { id: receipt.id },
            data: { publicSentAt: new Date() },
          });
          publicDone = true;
        } catch (error) {
          failureCode = failureCode || this.graph.errorCode(error);
          this.logger.warn({
            event: 'instagram_comment_automation_public_failed',
            userId: this.graph.safeId(userId),
            code: this.graph.errorCode(error),
          });
        }
      }

      const complete = privateDone && publicDone;
      if (complete) {
        await this.prisma.instagramAutomationReceipt.update({
          where: { id: receipt.id },
          data: { completedAt: new Date(), nextRetryAt: null, lastErrorCode: null },
        });
        return { matched: true, complete: true };
      }

      const code = failureCode || 'INSTAGRAM_DELIVERY_INCOMPLETE';
      await this.prisma.instagramAutomationReceipt.update({
        where: { id: receipt.id },
        data: {
          lastErrorCode: code.slice(0, 100),
          nextRetryAt: new Date(Date.now() + this.automationRetryDelayMs(code, attemptCount)),
        },
      });
      return { matched: true, complete: false };
    }
    return { matched: false, complete: false };
  }

  private async findOrCreateAutomationReceipt(userId: string, automationId: string, commentId: string, commenterId: string) {
    const existing = await this.prisma.instagramAutomationReceipt.findUnique({
      where: { automationId_commentId: { automationId, commentId } },
    });
    if (existing) return existing;
    try {
      return await this.prisma.instagramAutomationReceipt.create({
        data: { userId, automationId, commentId, commenterId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.instagramAutomationReceipt.findUnique({
          where: { automationId_commentId: { automationId, commentId } },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async releaseCommentInboundReceipt(userId: string, event: InstagramCommentEvent): Promise<void> {
    await this.prisma.salesInboundReceipt.deleteMany({
      where: {
        channel: 'INSTAGRAM',
        userId,
        peerId: `comment:${event.commenterId}`,
        messageId: event.commentId,
      },
    }).catch(() => undefined);
  }

  private automationRetryDelayMs(code: string, attemptCount: number): number {
    // Permission/token/object errors are not transient and should not hammer
    // Meta every minute. Temporary/rate/network errors back off exponentially.
    if (/(?:AUTH|TOKEN|PERMISSION|ACCESS|OBJECT|UNSUPPORTED|INVALID)/iu.test(code)) return 5 * 60 * 1000;
    return Math.min(10 * 60 * 1000, 30_000 * (2 ** Math.min(5, Math.max(0, attemptCount - 1))));
  }

  private async ensureSession(userId: string, peerId: string, username: string | null, displayName: string | null) {
    const existing = await this.prisma.instagramSalesSession.findUnique({ where: { userId_peerId: { userId, peerId } } });
    if (existing) {
      if ((username && username !== existing.username) || (displayName && displayName !== existing.displayName)) {
        return this.prisma.instagramSalesSession.update({ where: { id: existing.id }, data: { username: username ?? existing.username, displayName: displayName ?? existing.displayName } });
      }
      return existing;
    }
    return this.prisma.$transaction(async tx => {
      const again = await tx.instagramSalesSession.findUnique({ where: { userId_peerId: { userId, peerId } } });
      if (again) return again;
      const label = displayName || username || peerId;
      const conversation = await tx.conversation.create({ data: { userId, title: `Instagram • ${label}`.slice(0, 200), source: 'INSTAGRAM_SALES', isTemporary: false } });
      return tx.instagramSalesSession.create({ data: { userId, peerId, username, displayName, conversationId: conversation.id } });
    });
  }

  private async findConnection(...ids: Array<string | null | undefined>) {
    for (const id of ids) {
      if (!id) continue;
      const found = await this.prisma.instagramConnection.findUnique({ where: { instagramUserId: id } });
      if (found) return found;
    }
    return null;
  }
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function arrayOf(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function textOf(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null; }
