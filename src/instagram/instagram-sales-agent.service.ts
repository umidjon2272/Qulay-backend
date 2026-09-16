import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { SalesVisionService, SalesImageUnderstanding } from '../ai-agent/sales-vision.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { coerceUniversalSalesState, customerSafeSalesAnswer, normalizeSalesTextForUnderstanding } from '../ai-agent/universal-sales-context';
import { reserveSalesInboundTurn, runSalesTurnSequential } from '../ai-agent/sales-turn-coordinator';
import { InstagramGraphService } from './instagram-graph.service';
import { InstagramCommentMatcherService } from './instagram-comment-matcher.service';

const SALES_CONTEXT_MS = 2 * 60 * 60 * 1000;
const SOFT_EXIT_MS = 15 * 60 * 1000;

type InstagramDmEvent = {
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

  async handlePolledComment(userId: string, event: InstagramCommentEvent): Promise<void> {
    await this.handleComment(userId, event);
  }

  private async handleDm(userId: string, event: InstagramDmEvent): Promise<void> {
    let turn;
    try { turn = await reserveSalesInboundTurn(this.prisma, 'INSTAGRAM', userId, event.senderId, event.messageId); }
    catch (error) { this.logger.warn({ event: 'instagram_sales_receipt_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) }); return; }
    if (!turn) return;
    await runSalesTurnSequential(turn, async () => {
      try {
        await Promise.all([
          this.subscriptions.assertFeatureAllowed(userId, 'INSTAGRAM_SALES'),
          this.subscriptions.assertAiAllowed(userId),
        ]);
        const connection = await this.prisma.instagramConnection.findUnique({ where: { userId } });
        if (!connection?.salesAgentEnabled || !connection.dmEnabled || !['CONNECTED', 'DEGRADED'].includes(connection.status)) return;
        const session = await this.ensureSession(userId, event.senderId, event.username ?? null, event.displayName ?? null);
        const active = Boolean(session.salesContextUntil && session.salesContextUntil.getTime() > Date.now());
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
        const state = active ? coerceUniversalSalesState(session.salesState) : { version: 1 as const };
        const contextUntil = new Date(Date.now() + SALES_CONTEXT_MS);
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { salesContextUntil: contextUntil, lastInboundAt: new Date() } });
        const result = await this.ai.chat(userId, { message: text, conversationId: session.conversationId }, undefined, turn.signal, {
          externalSales: true,
          newSalesEpoch: !active,
          channel: 'INSTAGRAM',
          surface: 'DM',
          customer: { peerName: event.displayName ?? event.username ?? null, peerType: 'USER', senderName: event.displayName ?? event.username ?? null },
          salesState: state,
          normalizedCustomerText: normalizeSalesTextForUnderstanding(text),
          visualProductHint: imageUnderstanding,
        });
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { salesState: state as unknown as Prisma.InputJsonValue } });
        if ('suppressReply' in result && result.suppressReply === true) {
          await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { salesContextUntil: null } });
          return;
        }
        let answer = result.message?.trim() || (imageUnderstanding ? 'Rasmdagiga o‘xshash variantlarni ko‘rib beraman. Qaysi xususiyati siz uchun muhim?' : 'Yordam beraman. Qaysi mahsulot kerak edi?');
        if (result.pendingConfirmation) answer = 'Buyurtma ma’lumotlarini tayyorlab turaman. Yakunlash uchun kerakli ma’lumotni birga aniqlaymiz.';
        answer = customerSafeSalesAnswer(answer, state).slice(0, 950);
        await this.graph.sendText(userId, event.senderId, answer);
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { lastOutboundAt: new Date(), salesContextUntil: state.lastIntent === 'SOFT_EXIT' ? new Date(Date.now() + SOFT_EXIT_MS) : contextUntil } });
      } catch (error) {
        if (error instanceof ForbiddenException) return;
        this.logger.warn({ event: 'instagram_sales_dm_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
      }
    });
  }

  private async handleComment(userId: string, event: InstagramCommentEvent): Promise<void> {
    let turn;
    try { turn = await reserveSalesInboundTurn(this.prisma, 'INSTAGRAM', userId, `comment:${event.commenterId}`, event.commentId); }
    catch (error) { this.logger.warn({ event: 'instagram_comment_receipt_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) }); return; }
    if (!turn) return;
    await runSalesTurnSequential(turn, async () => {
      try {
        await Promise.all([
          this.subscriptions.assertFeatureAllowed(userId, 'INSTAGRAM_SALES'),
          this.subscriptions.assertAiAllowed(userId),
        ]);
        const matchedAutomation = await this.runCommentAutomations(userId, event);
        if (matchedAutomation) return;

        const media = await this.graph.getMedia(userId, event.mediaId);
        const session = await this.ensureSession(userId, event.commenterId, event.username, event.username);
        const active = Boolean(session.salesContextUntil && session.salesContextUntil.getTime() > Date.now());
        const state = active ? coerceUniversalSalesState(session.salesState) : { version: 1 as const };
        const message = event.text.trim() || 'Salom';
        const result = await this.ai.chat(userId, { message, conversationId: session.conversationId }, undefined, turn!.signal, {
          externalSales: true,
          newSalesEpoch: !active,
          channel: 'INSTAGRAM',
          surface: 'COMMENT',
          customer: { peerName: event.username, peerType: 'USER', senderName: event.username },
          salesState: state,
          normalizedCustomerText: normalizeSalesTextForUnderstanding(message),
          sourceContext: media?.caption ? `Instagram post caption: ${media.caption.slice(0, 1200)}` : undefined,
        });
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { salesState: state as unknown as Prisma.InputJsonValue, lastInboundAt: new Date() } });
        if ('suppressReply' in result && result.suppressReply === true) return;
        const answer = customerSafeSalesAnswer(result.message?.trim() || 'Directga yozsangiz, yordam beraman 🙂', state).slice(0, 900);
        if (answer) await this.graph.replyToComment(userId, event.commentId, answer);
        await this.prisma.instagramSalesSession.update({ where: { id: session.id }, data: { lastOutboundAt: new Date(), salesContextUntil: new Date(Date.now() + SALES_CONTEXT_MS) } });
      } catch (error) {
        if (error instanceof ForbiddenException) return;
        this.logger.warn({ event: 'instagram_comment_agent_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
      }
    });
  }

  private async runCommentAutomations(userId: string, event: InstagramCommentEvent): Promise<boolean> {
    const automations = await this.prisma.instagramCommentAutomation.findMany({ where: { userId, mediaId: event.mediaId, active: true }, orderBy: { updatedAt: 'desc' }, take: 30 });
    let matchedAny = false;
    for (const automation of automations) {
      if (!(await this.matcher.matches(userId, event.text, automation.triggerText, automation.semanticMatch, automation.mediaCaption))) continue;
      matchedAny = true;
      const reserved = await this.reserveAutomationReceipt(userId, automation.id, event.commentId, event.commenterId);
      if (!reserved) continue;
      try {
        if (automation.sendPrivateReply) await this.graph.privateReplyToComment(userId, event.commentId, automation.dmMessage);
        if (automation.replyPublicly) await this.graph.replyToComment(userId, event.commentId, automation.publicReply?.trim() || 'Directga yubordim ✅');
      } catch (error) {
        // The receipt reserves a successful delivery, not an attempted one. If
        // Meta is temporarily unavailable, remove it so a webhook retry can
        // safely try the automation again without permanently dropping the DM.
        await Promise.all([
          this.prisma.instagramAutomationReceipt.deleteMany({
            where: { userId, automationId: automation.id, commentId: event.commentId },
          }).catch(() => undefined),
          // The outer sales receipt is reserved before automation delivery. If
          // delivery fails and only the automation receipt is removed, a Meta
          // webhook retry or development poll sees the existing sales receipt
          // and drops the comment forever. Remove both reservations so the
          // same real comment can be retried safely on the next delivery.
          this.prisma.salesInboundReceipt.deleteMany({
            where: { channel: 'INSTAGRAM', userId, peerId: `comment:${event.commenterId}`, messageId: event.commentId },
          }).catch(() => undefined),
        ]);
        this.logger.warn({ event: 'instagram_comment_automation_send_failed', userId: this.graph.safeId(userId), code: this.graph.errorCode(error) });
      }
    }
    return matchedAny;
  }

  private async reserveAutomationReceipt(userId: string, automationId: string, commentId: string, commenterId: string): Promise<boolean> {
    try {
      await this.prisma.instagramAutomationReceipt.create({ data: { userId, automationId, commentId, commenterId } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
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
