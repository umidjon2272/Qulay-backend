import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, WhatsAppConnectionStatus } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiVoiceService } from '../ai-agent/ai-voice.service';
import { SalesVisionService, SalesImageUnderstanding } from '../ai-agent/sales-vision.service';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppCryptoService } from './whatsapp-crypto.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { oggOpusDurationSeconds } from './whatsapp-sales-policy';
import { APP_ERROR_CODES } from '../common/errors/app-error-codes';
import { coerceUniversalSalesState, customerSafeSalesAnswer, normalizeSalesTextForUnderstanding, professionalSalesFallbackReply } from '../ai-agent/universal-sales-context';
import {
  SalesTurnHandle,
  bufferSalesTextFragment,
  consumeSalesTextFragments,
  isLikelySalesTextFragment,
  reserveSalesInboundTurn,
  runSalesTurnSequential,
  waitForSalesTurnDebounce,
} from '../ai-agent/sales-turn-coordinator';

export type WhatsAppSalesAgentSettings = {
  configured: boolean;
  embeddedSignupReady: boolean;
  connected: boolean;
  status: 'DISCONNECTED' | 'CONNECTED' | 'DEGRADED' | 'ERROR' | 'not_configured';
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  webhookSubscribed: boolean;
  enabled: boolean;
  salesOnly: boolean;
  voiceEnabled: boolean;
  maxVoiceSeconds: 60;
  replyMode: 'TEXT';
  connectedAt: string | null;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
};

type IncomingWhatsAppMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
  image?: { id?: string; mime_type?: string; caption?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  button?: { text?: string };
};

type WhatsAppWebhook = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<Partial<IncomingWhatsAppMessage>>;
      };
    }>;
  }>;
};

const FOLLOWUP_WINDOW_MS = 60 * 60 * 1000;
const SOFT_EXIT_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class WhatsAppSalesAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppSalesAgentService.name);
  private readonly processing = new Set<string>();
  private webhookReconcileTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloud: WhatsAppCloudService,
    private readonly crypto: WhatsAppCryptoService,
    private readonly ai: AiAgentService,
    private readonly voice: AiVoiceService,
    private readonly vision: SalesVisionService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onModuleInit(): void {
    // Repair stale WABA subscriptions after deploy without asking the owner to
    // reconnect. Run out-of-band so API startup is never blocked by Meta.
    setTimeout(() => void this.reconcileWebhookSubscriptions(), 5_000).unref?.();
    this.webhookReconcileTimer = setInterval(() => void this.reconcileWebhookSubscriptions(), 30 * 60_000);
    this.webhookReconcileTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.webhookReconcileTimer) clearInterval(this.webhookReconcileTimer);
    this.webhookReconcileTimer = null;
  }

  private async reconcileWebhookSubscriptions(): Promise<void> {
    const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const rows = await this.prisma.whatsAppConnection.findMany({
      where: {
        status: { in: [WhatsAppConnectionStatus.CONNECTED, WhatsAppConnectionStatus.DEGRADED] },
        salesAgentEnabled: true,
        OR: [
          { webhookSubscribed: false },
          { status: WhatsAppConnectionStatus.DEGRADED },
          { lastValidatedAt: null },
          { lastValidatedAt: { lt: staleBefore } },
        ],
      },
      select: { userId: true },
      take: 200,
    });
    for (const row of rows) {
      try {
        await this.cloud.testConnection(row.userId);
        this.logger.log({ event: 'whatsapp_webhook_reconciled', userId: this.safeId(row.userId) });
      } catch (error) {
        this.logger.warn({ event: 'whatsapp_webhook_reconcile_failed', userId: this.safeId(row.userId), code: this.errorCode(error) });
      }
    }
  }

  async getSettings(userId: string): Promise<WhatsAppSalesAgentSettings> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection) {
      return {
        configured: this.cloud.configured(), embeddedSignupReady: this.cloud.embeddedSignupConfigured(), connected: false, status: this.cloud.configured() ? 'DISCONNECTED' : 'not_configured',
        displayPhoneNumber: null, verifiedName: null, phoneNumberId: null, wabaId: null, webhookSubscribed: false,
        enabled: false, salesOnly: true, voiceEnabled: true, maxVoiceSeconds: 60, replyMode: 'TEXT',
        connectedAt: null, lastValidatedAt: null, lastErrorCode: null,
      };
    }
    return {
      configured: this.cloud.configured(),
      embeddedSignupReady: this.cloud.embeddedSignupConfigured(),
      connected: connection.status === WhatsAppConnectionStatus.CONNECTED || connection.status === WhatsAppConnectionStatus.DEGRADED,
      status: connection.status,
      displayPhoneNumber: connection.displayPhoneNumber,
      verifiedName: connection.verifiedName,
      phoneNumberId: connection.phoneNumberId,
      wabaId: connection.wabaId,
      webhookSubscribed: connection.webhookSubscribed,
      enabled: connection.salesAgentEnabled,
      salesOnly: connection.salesOnly,
      voiceEnabled: connection.salesVoiceEnabled,
      maxVoiceSeconds: 60,
      replyMode: 'TEXT',
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
      lastErrorCode: connection.lastErrorCode,
    };
  }

  async connect(userId: string, input: { phoneNumberId: string; wabaId: string; accessToken: string }): Promise<WhatsAppSalesAgentSettings> {
    if (!this.cloud.configured()) throw new ServiceUnavailableException({
      code: APP_ERROR_CODES.WHATSAPP_SERVER_NOT_CONFIGURED,
      message: 'WhatsApp server sozlamalari hali tayyor emas',
    });
    const token = input.accessToken.trim();
    if (token.length < 20) throw new BadRequestException('WhatsApp access token noto‘g‘ri');
    try {
      return await this.connectWithToken(userId, token, input.phoneNumberId, input.wabaId);
    } catch (error) {
      this.logger.warn({ event: 'whatsapp_manual_connect_failed', userId: this.safeId(userId), code: this.errorCode(error) });
      throw error;
    }
  }

  async connectEmbedded(userId: string, input: { code: string; phoneNumberId: string; wabaId: string }): Promise<WhatsAppSalesAgentSettings> {
    try {
      const token = await this.cloud.exchangeEmbeddedSignupCode(input.code);
      return await this.connectWithToken(userId, token, input.phoneNumberId, input.wabaId);
    } catch (error) {
      this.logger.warn({ event: 'whatsapp_embedded_connect_failed', userId: this.safeId(userId), code: this.errorCode(error) });
      throw error;
    }
  }

  private async connectWithToken(userId: string, token: string, phoneNumberId: string, wabaId: string): Promise<WhatsAppSalesAgentSettings> {
    const profile = await this.cloud.verifyPhoneNumber(token, phoneNumberId);
    const cleanWabaId = wabaId.trim();
    if (!cleanWabaId) throw new BadRequestException({
      code: APP_ERROR_CODES.WHATSAPP_PHONE_OR_WABA_INVALID,
      message: 'WhatsApp Business Account ID kerak',
    });

    let webhookSubscribed = false;
    let status: WhatsAppConnectionStatus = WhatsAppConnectionStatus.CONNECTED;
    let lastErrorCode: string | null = null;
    try {
      webhookSubscribed = await this.cloud.subscribeWaba(token, cleanWabaId);
    } catch (error) {
      // A valid Phone Number ID + token is still useful even when automatic
      // WABA webhook subscription is blocked by Meta permissions. Persist the
      // connection as DEGRADED so the user can fix the webhook without having
      // to re-enter the token, while invalid IDs still fail immediately.
      if (error instanceof BadRequestException) throw error;
      status = WhatsAppConnectionStatus.DEGRADED;
      lastErrorCode = this.errorCode(error);
      this.logger.warn({ event: 'whatsapp_webhook_subscribe_degraded', userId: this.safeId(userId), code: lastErrorCode });
    }

    const now = new Date();
    await this.prisma.whatsAppConnection.upsert({
      where: { userId },
      update: {
        phoneNumberId: profile.phoneNumberId,
        wabaId: cleanWabaId,
        displayPhoneNumber: profile.displayPhoneNumber,
        verifiedName: profile.verifiedName,
        qualityRating: profile.qualityRating,
        encryptedAccessToken: this.crypto.encrypt(token),
        status,
        webhookSubscribed,
        salesAgentEnabled: true,
        connectedAt: now,
        lastValidatedAt: now,
        lastErrorAt: lastErrorCode ? now : null,
        lastErrorCode,
      },
      create: {
        userId,
        phoneNumberId: profile.phoneNumberId,
        wabaId: cleanWabaId,
        displayPhoneNumber: profile.displayPhoneNumber,
        verifiedName: profile.verifiedName,
        qualityRating: profile.qualityRating,
        encryptedAccessToken: this.crypto.encrypt(token),
        status,
        webhookSubscribed,
        salesAgentEnabled: true,
        connectedAt: now,
        lastValidatedAt: now,
        lastErrorAt: lastErrorCode ? now : null,
        lastErrorCode,
      },
    });
    return this.getSettings(userId);
  }

  async updateSettings(userId: string, input: { enabled?: boolean; salesOnly?: boolean; voiceEnabled?: boolean }): Promise<WhatsAppSalesAgentSettings> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection) throw new NotFoundException('WhatsApp avval ulanishi kerak');
    await this.prisma.whatsAppConnection.update({
      where: { userId },
      data: {
        ...(typeof input.enabled === 'boolean' ? { salesAgentEnabled: input.enabled } : {}),
        ...(typeof input.salesOnly === 'boolean' ? { salesOnly: input.salesOnly } : {}),
        ...(typeof input.voiceEnabled === 'boolean' ? { salesVoiceEnabled: input.voiceEnabled } : {}),
        salesVoiceMaxSeconds: 60,
      },
    });
    return this.getSettings(userId);
  }

  async test(userId: string): Promise<WhatsAppSalesAgentSettings> {
    await this.cloud.testConnection(userId);
    return this.getSettings(userId);
  }

  async disconnect(userId: string): Promise<{ status: 'disconnected' }> {
    await this.prisma.whatsAppConnection.delete({ where: { userId } }).catch(() => undefined);
    return { status: 'disconnected' };
  }

  verifyWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    const secret = this.cloud.appSecret();
    if (!secret || !rawBody?.length || !signature?.startsWith('sha256=')) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
    const actual = Buffer.from(signature.slice(7), 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async handleWebhook(payload: WhatsAppWebhook): Promise<void> {
    if (payload.object !== 'whatsapp_business_account') return;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        const messages = value?.messages ?? [];
        if (!phoneNumberId) {
          if (messages.length) this.logger.warn({ event: 'whatsapp_webhook_missing_phone_number_id', messages: messages.length });
          continue;
        }
        const connection = await this.prisma.whatsAppConnection.findUnique({ where: { phoneNumberId } });
        if (!connection) {
          if (messages.length) this.logger.warn({ event: 'whatsapp_webhook_connection_not_found', phone: this.safeId(phoneNumberId), messages: messages.length });
          continue;
        }
        if (!(connection.status === WhatsAppConnectionStatus.CONNECTED || connection.status === WhatsAppConnectionStatus.DEGRADED)) {
          if (messages.length) this.logger.warn({ event: 'whatsapp_webhook_connection_inactive', userId: this.safeId(connection.userId), status: connection.status, messages: messages.length });
          continue;
        }
        if (!connection.salesAgentEnabled) {
          if (messages.length) this.logger.warn({ event: 'whatsapp_webhook_agent_disabled', userId: this.safeId(connection.userId), messages: messages.length });
          continue;
        }
        if (messages.length) this.logger.log({ event: 'whatsapp_webhook_messages_received', userId: this.safeId(connection.userId), messages: messages.length });
        const contactNames = new Map((value?.contacts ?? []).filter(c => c.wa_id).map(c => [c.wa_id!, c.profile?.name ?? null]));
        for (const message of messages) {
          if (!message.id || !message.from) continue;
          void this.handleIncoming(connection.userId, message as IncomingWhatsAppMessage, contactNames.get(message.from) ?? null);
        }
      }
    }
  }

  private async handleIncoming(userId: string, message: IncomingWhatsAppMessage, displayName: string | null): Promise<void> {
    if (!message?.id || !message.from) return;
    let turn: SalesTurnHandle | null = null;
    try {
      turn = await reserveSalesInboundTurn(this.prisma, 'WHATSAPP', userId, message.from, message.id);
    } catch (error) {
      this.logger.warn({ event: 'whatsapp_sales_receipt_failed', userId: this.safeId(userId), code: this.errorCode(error) });
      return;
    }
    if (!turn) return;
    const initialText = this.messageText(message);
    const fragment = message.type !== 'audio' && message.type !== 'image' && isLikelySalesTextFragment(initialText);
    if (fragment) bufferSalesTextFragment(turn, initialText);
    await runSalesTurnSequential(turn, async () => {
      let combinedText: string | undefined;
      if (fragment) {
        const ready = await waitForSalesTurnDebounce(turn!, 550);
        if (!ready) return;
        combinedText = consumeSalesTextFragments(turn!);
      } else if (message.type !== 'audio' && message.type !== 'image' && initialText) {
        combinedText = consumeSalesTextFragments(turn!, initialText);
      }
      await this.processIncoming(userId, message, displayName, turn!, combinedText);
    });
  }

  private async processIncoming(userId: string, message: IncomingWhatsAppMessage, displayName: string | null, turn: SalesTurnHandle, combinedText?: string): Promise<void> {
    const processKey = `${userId}:${message.id}`;
    if (this.processing.has(processKey)) return;
    this.processing.add(processKey);
    try {
      await Promise.all([
        this.subscriptions.assertFeatureAllowed(userId, 'WHATSAPP_SALES'),
        this.subscriptions.assertAiAllowed(userId),
      ]);
      const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
      if (!connection?.salesAgentEnabled || !(connection.status === WhatsAppConnectionStatus.CONNECTED || connection.status === WhatsAppConnectionStatus.DEGRADED)) return;

      const session = await this.ensureSession(userId, message.from, displayName);
      let text = combinedText?.trim() || this.messageText(message);
      const recentSalesContext = Boolean(session.lastInboundAt || session.salesState || session.salesContextUntil);

      if (message.type === 'audio' && message.audio?.id) {
        if (!connection.salesVoiceEnabled) return;
        const media = await this.cloud.downloadMedia(userId, message.audio.id);
        const duration = oggOpusDurationSeconds(media.buffer);
        if (!Number.isFinite(duration) || duration <= 0) {
          await this.cloud.sendText(userId, message.from, 'Golos davomiyligini aniqlab bo‘lmadi. Iltimos, 60 soniyagacha qisqaroq golos yoki matn yuboring.');
          return;
        }
        if (duration > 60) {
          await this.cloud.sendText(userId, message.from, 'Golos 60 soniyadan uzun. Iltimos, qisqaroq yuboring.');
          return;
        }
        const transcript = await this.voice.transcribeSalesVoice(
          userId,
          {
            buffer: media.buffer,
            size: media.size,
            mimetype: media.mimeType,
          },
          duration,
        );
        text = [text, transcript.text].filter(Boolean).join('\n').trim();
      }

      let imageUnderstanding: SalesImageUnderstanding | undefined;
      if (message.type === 'image' && message.image?.id) {
        try {
          const media = await this.cloud.downloadMedia(userId, message.image.id, 8 * 1024 * 1024);
          imageUnderstanding = await this.vision.understandProductImage(userId, {
            buffer: media.buffer,
            mimeType: message.image.mime_type || media.mimeType,
            caption: message.image.caption || text,
          });
        } catch (error) {
          this.logger.warn({ event: 'whatsapp_sales_image_understanding_failed', userId: this.safeId(userId), code: this.errorCode(error) });
        }
        const imageCaption = message.image.caption?.trim() || '';
        text = text.trim() || imageCaption || 'Shunaqasi bormi?';
      }

      if (!text) return;
      // A connected WhatsApp Business number is a professional customer inbox.
      // Once the owner enables the Sales Agent, every inbound customer message
      // reaches the semantic Sales Brain instead of being dropped by keyword gates.
      const activateUntil = new Date(Date.now() + FOLLOWUP_WINDOW_MS);
      if (activateUntil?.getTime() !== session.salesContextUntil?.getTime()) {
        await this.prisma.whatsAppSalesSession.update({ where: { id: session.id }, data: { salesContextUntil: activateUntil } });
      }

      const normalizedCustomerText = normalizeSalesTextForUnderstanding(text);
      const salesState = coerceUniversalSalesState(session.salesState);

      const result = await this.ai.chat(
        userId,
        { message: text, conversationId: session.conversationId, voice: message.type === 'audio' },
        undefined,
        turn.signal,
        {
          externalSales: true,
          professionalInbox: true,
          newSalesEpoch: !recentSalesContext,
          channel: 'WHATSAPP',
          customer: { peerName: displayName, peerType: 'USER', senderName: displayName },
          salesState,
          normalizedCustomerText,
          visualProductHint: imageUnderstanding,
        },
      );
      await this.prisma.whatsAppSalesSession.update({
        where: { id: session.id },
        data: { salesState: salesState as unknown as Prisma.InputJsonValue, lastInboundAt: new Date(), customerName: displayName ?? session.customerName },
      });
      let answer = result.message?.trim() || professionalSalesFallbackReply(salesState, text);
      if ('suppressReply' in result && result.suppressReply === true) {
        answer = professionalSalesFallbackReply(salesState, text);
      }
      if (result.pendingConfirmation) answer = 'Bu qadam uchun sotuvchi tasdig‘i kerak. Hozircha buyurtma ma’lumotlarini tayyorlab turaman.';
      answer = customerSafeSalesAnswer(answer, salesState);
      await this.cloud.sendText(userId, message.from, answer);
      const replyContextUntil = salesState.lastIntent === 'SOFT_EXIT' ? new Date(Date.now() + SOFT_EXIT_WINDOW_MS) : activateUntil;
      await this.prisma.whatsAppSalesSession.update({ where: { id: session.id }, data: { lastOutboundAt: new Date(), salesContextUntil: replyContextUntil, customerName: displayName ?? session.customerName } });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        this.logger.warn({ event: 'whatsapp_sales_message_blocked', userId: this.safeId(userId), type: message?.type, code: this.errorCode(error) });
        await this.cloud.sendText(userId, message?.from ?? '', 'Salom 🙂 Hozir AI javobida vaqtinchalik cheklov bor. Savolingizni yozib qoldiring.').catch(() => undefined);
        return;
      }
      this.logger.warn({ event: 'whatsapp_sales_message_failed', userId: this.safeId(userId), type: message?.type, code: this.errorCode(error) });
      await this.cloud.sendText(userId, message?.from ?? '', 'Bu joyini hozir aniq ayta olmayman. Iltimos, savolni bir marta qayta yozib ko‘ring.').catch(() => undefined);
    } finally {
      this.processing.delete(processKey);
    }
  }

  private async ensureSession(userId: string, waId: string, customerName: string | null) {
    const existing = await this.prisma.whatsAppSalesSession.findUnique({ where: { userId_waId: { userId, waId } } });
    if (existing) {
      if (customerName && existing.customerName !== customerName) return this.prisma.whatsAppSalesSession.update({ where: { id: existing.id }, data: { customerName } });
      return existing;
    }
    return this.prisma.$transaction(async tx => {
      const again = await tx.whatsAppSalesSession.findUnique({ where: { userId_waId: { userId, waId } } });
      if (again) return again;
      const conversation = await tx.conversation.create({ data: { userId, title: `WhatsApp • ${customerName || waId}`.slice(0, 200), source: 'WHATSAPP_SALES', isTemporary: false } });
      return tx.whatsAppSalesSession.create({ data: { userId, waId, customerName, conversationId: conversation.id } });
    });
  }

  private messageText(message: { type?: string; text?: { body?: string }; image?: { caption?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; button?: { text?: string } }): string {
    if (message.type === 'text') return message.text?.body?.trim() ?? '';
    if (message.type === 'image') return message.image?.caption?.trim() ?? '';
    if (message.type === 'interactive') return message.interactive?.button_reply?.title?.trim() ?? message.interactive?.list_reply?.title?.trim() ?? '';
    if (message.type === 'button') return message.button?.text?.trim() ?? '';
    return '';
  }

  private safeId(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 10); }
  private errorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      const candidate = error as { getResponse?: () => unknown; message?: unknown };
      const response = typeof candidate.getResponse === 'function' ? candidate.getResponse() : null;
      if (response && typeof response === 'object' && 'code' in response && typeof (response as { code?: unknown }).code === 'string') {
        return (response as { code: string }).code;
      }
      if (typeof candidate.message === 'string') return candidate.message.match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'FAILED';
    }
    return 'FAILED';
  }
}
