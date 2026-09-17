import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, TelegramConnectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiVoiceService } from '../ai-agent/ai-voice.service';
import { SalesVisionService, SalesImageUnderstanding } from '../ai-agent/sales-vision.service';
import { TelegramClientService, TelegramIncomingMessage, TelegramMessageListener, TelegramOutgoingMessage } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';
import { TelegramIntegrationService } from './telegram-integration.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { bitoInventorySearchTerm } from '../bito/bito-intent';
import { BitoToolBridgeService } from '../bito/bito-tool-bridge.service';
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

export type TelegramSalesAgentSettings = {
  enabled: boolean;
  privateChats: boolean;
  groups: boolean;
  allowedGroupIds: string[];
  voiceEnabled: boolean;
  maxVoiceSeconds: 60;
  replyMode: 'TEXT';
  listenerActive: boolean;
  listenerHealthy: boolean;
  lastListenerCheckAt: string | null;
};

export type UpdateTelegramSalesAgentSettings = Partial<Pick<TelegramSalesAgentSettings, 'enabled' | 'privateChats' | 'groups' | 'allowedGroupIds' | 'voiceEnabled'>>;

type ActiveListener = {
  sessionFingerprint: string;
  listener: TelegramMessageListener;
  healthy: boolean;
  lastCheckAt: Date;
};

const EXPLICIT_SALES_TEXT = /(?:\b(?:narx\p{L}*|price|цена|nech\s*pul|qancha\s+tur|сколько\s+стоит|mahsulot|tovar|product|товар|qoldiq|stock|ombor|inventory|mavjud|available|в\s+налич|buyurtma|zakaz|order|заказ|chegirma|discount|скидк|aksiya|promo|ulgurji|optom|wholesale|yetkaz|delivery|достав|sotib\s+ol|olmoqch|olaman|беру|купить|заказать)\b|\b\d+(?:[.,]\d+)?\s*(?:ta|dona|kg|g|litr|ml|шт)\b)/iu;
const AVAILABILITY_TEXT = /(?:\b(?:bormi|bor\s+mi|mavjudmi|mavjud\s+mi|available)\b|есть\s+ли|в\s+наличии)/iu;
const NEED_TEXT = /\b(?:kerak|olaman|olmoqch|bering)\b/iu;
const STORE_INFO_TEXT = /(?:\b(?:do['‘’]?kon|magazin|shop|filial|ofis)\b.{0,50}\b(?:manzil|adres|lokatsiya|qayerda|telefon|raqam|ish\s+vaqt)|\b(?:manzil|adres|lokatsiya)\s+(?:qayerda|qatta)|\bqayerdansiz(?:lar)?\b|\btelefon\s+raqam|\bish\s+vaqt|\bnechchigacha\s+ishla\p{L}*|\bqaysi\s+to['‘’]?lov|\bto['‘’]?lov\s+usul|\bdelivery\s+hudud|\byetkazib\s+berish\s+hudud)/iu;
const NON_SALES_AVAILABILITY = /(?:vaqt(?:ing|ingiz)?|bo['‘’]?sh|uyda|ishdam|online|aloqa|internet|imkon|gap|savol|muammo|joy|место|время|свобод|дома|онлайн)/iu;
const SOCIAL_ONLY = /^(?:salom+|assalomu\s+alaykum|alaykum\s+assalom|hello+|hi+|privet|привет|qalesan|qalaysan|qandaysan|nima\s+gap|nmagap|yaxshimisan|qayerdasan|qayerdasiz|rahmat|rhm|ok+|xo['‘’]?p|hop|ha|yo['‘’]?q|😂+|😄+|😁+|👍+)[!.?,\s]*$/iu;
const CASUAL_PERSONAL = /(?:\b(?:brat|bro|aka|uka|opa|singil|og['‘’]?ayni|dost|do['‘’]?st|qalesan|qalaysan|nima\s+gap|qayerdasan|chiqamiz|uchrashamiz|ko['‘’]?rishamiz|uydami|ishdami)\b)/iu;
const LISTENER_HEALTH_INTERVAL_MS = 60_000;
const SALES_CONTEXT_WINDOW_MS = 2 * 60 * 60 * 1000;
const SALES_SOFT_EXIT_WINDOW_MS = 15 * 60 * 1000;
const OWNER_TAKEOVER_PAUSE_MS = 15 * 60 * 1000;
const AGENT_OUTGOING_TRACK_MS = 60_000;
const AGENT_SEND_IN_FLIGHT_MS = 15_000;

@Injectable()
export class TelegramSalesAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramSalesAgentService.name);
  private readonly listeners = new Map<string, ActiveListener>();
  private readonly processing = new Set<string>();
  private readonly agentOutgoingMessageIds = new Map<string, number>();
  private readonly agentSendInFlight = new Map<string, number>();
  private readonly ownerPauseUntil = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TelegramCryptoService,
    private readonly telegramClient: TelegramClientService,
    private readonly telegram: TelegramIntegrationService,
    private readonly ai: AiAgentService,
    private readonly voice: AiVoiceService,
    private readonly vision: SalesVisionService,
    private readonly subscriptions: SubscriptionsService,
    private readonly bitoTools: BitoToolBridgeService,
  ) {}

  onModuleInit(): void {
    setTimeout(() => void this.reconcileSafely(), 1_500).unref?.();
    this.timer = setInterval(() => void this.reconcileSafely(), 20_000);
    this.timer.unref?.();
  }

  private async reconcileSafely(): Promise<void> {
    try { await this.reconcile(); }
    catch (error) { this.logger.warn({ event: 'telegram_sales_reconcile_failed', code: this.errorCode(error) }); }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const active = [...this.listeners.values()];
    this.listeners.clear();
    await Promise.allSettled(active.map(item => item.listener.stop()));
  }

  async getSettings(userId: string): Promise<TelegramSalesAgentSettings> {
    const connection = await this.prisma.telegramConnection.findUnique({
      where: { userId },
      select: {
        status: true,
        salesAgentEnabled: true,
        salesPrivateChats: true,
        salesGroups: true,
        salesAllowedGroupIds: true,
        salesVoiceEnabled: true,
      },
    });
    if (!connection) throw new NotFoundException('Telegram ulanmagan');
    return {
      enabled: connection.salesAgentEnabled,
      privateChats: connection.salesPrivateChats,
      groups: connection.salesGroups,
      allowedGroupIds: connection.salesAllowedGroupIds,
      voiceEnabled: connection.salesVoiceEnabled,
      maxVoiceSeconds: 60,
      replyMode: 'TEXT',
      listenerActive: connection.status === TelegramConnectionStatus.CONNECTED && this.listeners.has(userId),
      listenerHealthy: connection.status === TelegramConnectionStatus.CONNECTED && this.listeners.get(userId)?.healthy === true,
      lastListenerCheckAt: this.listeners.get(userId)?.lastCheckAt.toISOString() ?? null,
    };
  }

  async updateSettings(userId: string, input: UpdateTelegramSalesAgentSettings): Promise<TelegramSalesAgentSettings> {
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== TelegramConnectionStatus.CONNECTED || !connection.encryptedSession) {
      throw new NotFoundException('Telegram avval ulanishi kerak');
    }
    const allowedGroupIds = input.allowedGroupIds
      ? [...new Set(input.allowedGroupIds.map(value => value.trim()).filter(value => /^-?\d{1,30}$/.test(value)))].slice(0, 100)
      : undefined;
    await this.prisma.telegramConnection.update({
      where: { userId },
      data: {
        ...(typeof input.enabled === 'boolean' ? { salesAgentEnabled: input.enabled } : {}),
        ...(typeof input.privateChats === 'boolean' ? { salesPrivateChats: input.privateChats } : {}),
        ...(typeof input.groups === 'boolean' ? { salesGroups: input.groups } : {}),
        ...(allowedGroupIds ? { salesAllowedGroupIds: allowedGroupIds } : {}),
        ...(typeof input.voiceEnabled === 'boolean' ? { salesVoiceEnabled: input.voiceEnabled } : {}),
        salesVoiceMaxSeconds: 60,
      },
    });
    await this.reconcile();
    return this.getSettings(userId);
  }

  /** Reconciles long-lived Telegram listeners only for explicitly enabled accounts. */
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const rows = await this.prisma.telegramConnection.findMany({
        where: {
          status: TelegramConnectionStatus.CONNECTED,
          salesAgentEnabled: true,
          encryptedSession: { not: null },
        },
        select: { userId: true, encryptedSession: true },
      });
      const eligibleRows = (await Promise.all(rows.map(async row => {
        try {
          await Promise.all([
            this.subscriptions.assertFeatureAllowed(row.userId, 'TELEGRAM_SALES'),
            this.subscriptions.assertAiAllowed(row.userId),
          ]);
          return row;
        } catch {
          return null;
        }
      }))).filter((row): row is (typeof rows)[number] => row !== null);
      const enabled = new Set(eligibleRows.map(row => row.userId));

      for (const [userId, active] of this.listeners) {
        if (enabled.has(userId)) continue;
        this.listeners.delete(userId);
        await active.listener.stop().catch(() => undefined);
      }

      for (const row of eligibleRows) {
        if (!row.encryptedSession) continue;
        const fingerprint = createHash('sha256').update(row.encryptedSession).digest('hex').slice(0, 20);
        const active = this.listeners.get(row.userId);
        if (active?.sessionFingerprint === fingerprint) {
          if (Date.now() - active.lastCheckAt.getTime() < LISTENER_HEALTH_INTERVAL_MS) continue;
          const healthy = await active.listener.health().catch(() => false);
          active.healthy = healthy;
          active.lastCheckAt = new Date();
          if (healthy) continue;
          this.logger.warn({ event: 'telegram_sales_listener_unhealthy', userId: this.safeUserId(row.userId) });
          this.listeners.delete(row.userId);
          await active.listener.stop().catch(() => undefined);
        } else if (active) {
          this.listeners.delete(row.userId);
          await active.listener.stop().catch(() => undefined);
        }
        try {
          const session = this.crypto.decrypt(row.encryptedSession);
          const listener = await this.telegramClient.listenIncomingMessages(
            session,
            message => this.handleIncoming(row.userId, message),
            message => this.handleOutgoing(row.userId, message),
          );
          const healthy = await listener.health().catch(() => false);
          if (!healthy) {
            await listener.stop().catch(() => undefined);
            throw new Error('TELEGRAM_LISTENER_HEALTH_FAILED');
          }
          this.listeners.set(row.userId, { sessionFingerprint: fingerprint, listener, healthy: true, lastCheckAt: new Date() });
          this.logger.log({ event: active ? 'telegram_sales_listener_restarted' : 'telegram_sales_listener_started', userId: this.safeUserId(row.userId) });
        } catch (error) {
          this.logger.warn({ event: 'telegram_sales_listener_start_failed', userId: this.safeUserId(row.userId), code: this.errorCode(error) });
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  private async handleOutgoing(userId: string, outgoing: TelegramOutgoingMessage): Promise<void> {
    if (outgoing.peer.type !== 'USER') return;
    const peerKey = this.peerKey(userId, outgoing.peer.peerId);
    const messageKey = this.outgoingMessageKey(userId, outgoing.peer.peerId, outgoing.messageId);
    const now = Date.now();
    for (const [entryKey, until] of this.agentOutgoingMessageIds) if (until <= now) this.agentOutgoingMessageIds.delete(entryKey);
    for (const [entryKey, until] of this.agentSendInFlight) if (until <= now) this.agentSendInFlight.delete(entryKey);
    for (const [entryKey, until] of this.ownerPauseUntil) if (until <= now) this.ownerPauseUntil.delete(entryKey);

    // AI replies also arrive through Telegram as outgoing updates. Distinguish
    // them from a real owner takeover by exact message id whenever possible,
    // with a short in-flight guard for the race where the outgoing update is
    // delivered before sendMessage() returns the created message id.
    if ((this.agentOutgoingMessageIds.get(messageKey) ?? 0) > now) {
      this.agentOutgoingMessageIds.delete(messageKey);
      return;
    }
    if ((this.agentSendInFlight.get(peerKey) ?? 0) > now) return;

    this.ownerPauseUntil.set(peerKey, now + OWNER_TAKEOVER_PAUSE_MS);
    await this.prisma.telegramSalesSession.updateMany({
      where: { userId, peerId: outgoing.peer.peerId },
      data: { ownerPausedUntil: new Date(now + OWNER_TAKEOVER_PAUSE_MS), lastOutboundAt: new Date(outgoing.sentAt) },
    }).catch(() => undefined);
  }

  private async handleIncoming(userId: string, incoming: TelegramIncomingMessage): Promise<void> {
    if (incoming.senderIsBot || incoming.peer.type === 'CHANNEL') return;
    const receiptPeerId = this.salesSessionPeerId(incoming);
    let turn: SalesTurnHandle | null = null;
    try {
      turn = await reserveSalesInboundTurn(this.prisma, 'TELEGRAM', userId, receiptPeerId, String(incoming.messageId));
    } catch (error) {
      this.logger.warn({ event: 'telegram_sales_receipt_failed', userId: this.safeUserId(userId), code: this.errorCode(error) });
      return;
    }
    if (!turn) return;
    const rawText = incoming.text.trim();
    const fragment = !incoming.voice && !incoming.image && isLikelySalesTextFragment(rawText);
    if (fragment) bufferSalesTextFragment(turn, rawText);
    await runSalesTurnSequential(turn, async () => {
      let combinedText: string | undefined;
      if (fragment) {
        const ready = await waitForSalesTurnDebounce(turn!, 550);
        if (!ready) return;
        combinedText = consumeSalesTextFragments(turn!);
      } else if (!incoming.voice && !incoming.image && rawText) {
        // Attach only previously buffered incomplete fragments. Never merge two
        // complete customer questions just because they were sent quickly.
        combinedText = consumeSalesTextFragments(turn!, rawText);
      }
      await this.processIncoming(userId, incoming, turn!, combinedText);
    });
  }

  private async processIncoming(userId: string, incoming: TelegramIncomingMessage, turn: SalesTurnHandle, combinedText?: string): Promise<void> {
    const active = this.listeners.get(userId);
    if (active) { active.healthy = true; active.lastCheckAt = new Date(); }
    this.logger.log({ event: 'telegram_sales_message_received', userId: this.safeUserId(userId), peerType: incoming.peer.type, hasVoice: Boolean(incoming.voice), hasImage: Boolean(incoming.image) });
    if (incoming.senderIsBot || incoming.peer.type === 'CHANNEL') return;
    const key = `${userId}:${incoming.peer.peerId}:${incoming.messageId}`;
    if (this.processing.has(key)) return;
    this.processing.add(key);
    try {
      await Promise.all([
        this.subscriptions.assertFeatureAllowed(userId, 'TELEGRAM_SALES'),
        this.subscriptions.assertAiAllowed(userId),
      ]);
      const connection = await this.prisma.telegramConnection.findUnique({
        where: { userId },
        select: {
          status: true,
          encryptedSession: true,
          salesAgentEnabled: true,
          salesPrivateChats: true,
          salesGroups: true,
          salesAllowedGroupIds: true,
          salesVoiceEnabled: true,
          salesVoiceMaxSeconds: true,
        },
      });
      if (!connection?.salesAgentEnabled || connection.status !== TelegramConnectionStatus.CONNECTED || !connection.encryptedSession) return;
      if (incoming.peer.type === 'USER' && !connection.salesPrivateChats) return;
      if (incoming.peer.type === 'USER') {
        const ownerPause = this.ownerPauseUntil.get(this.peerKey(userId, incoming.peer.peerId)) ?? 0;
        if (ownerPause > Date.now()) return;
        if (ownerPause) this.ownerPauseUntil.delete(this.peerKey(userId, incoming.peer.peerId));
      }
      if (incoming.peer.type === 'GROUP') {
        if (!connection.salesGroups) return;
        if (!connection.salesAllowedGroupIds.includes(incoming.peer.peerId)) return;
        if (!incoming.senderId && !incoming.senderUsername) return;
      }

      const sessionPeerId = this.salesSessionPeerId(incoming);
      let salesSession = await this.prisma.telegramSalesSession.findUnique({ where: { userId_peerId: { userId, peerId: sessionPeerId } } });
      // DB SalesInboundReceipt is the idempotency source of truth. Do not drop
      // a unique Telegram message merely because callbacks/DB writes completed
      // out of order; that was the root cause of apparently random silent
      // replies in fast customer conversations.
      if (incoming.peer.type === 'USER' && salesSession?.ownerPausedUntil && salesSession.ownerPausedUntil.getTime() > Date.now()) return;

      const addressed = incoming.mentioned || incoming.replyToOwnMessage;
      const activeSalesContext = incoming.peer.type === 'USER' ? Boolean(salesSession) : Boolean(salesSession?.salesContextUntil && salesSession.salesContextUntil.getTime() > Date.now());

      // Never spend STT/AI credits on an arbitrary personal voice note. A voice
      // starts/continues sales only in a selected group, an active sales DM, or
      // a truly new non-contact DM with no previous conversation.
      let text = combinedText?.trim() || incoming.text.trim();
      if (incoming.voice) {
        const voiceEligible = incoming.peer.type === 'GROUP'
          ? addressed
          : true;
        if (!voiceEligible || !connection.salesVoiceEnabled) return;
        const maxSeconds = Math.min(60, Math.max(1, connection.salesVoiceMaxSeconds || 60));
        if (!incoming.voice.durationSeconds || incoming.voice.durationSeconds > maxSeconds) {
          await this.safeReply(userId, incoming.peer.peerId, `Golos ${maxSeconds} soniyadan uzun. Iltimos, qisqaroq yuboring.`);
          return;
        }
        const buffer = await incoming.voice.download();
        if (!buffer?.length || buffer.length > 6 * 1024 * 1024) {
          await this.safeReply(userId, incoming.peer.peerId, 'Golosni o‘qib bo‘lmadi. Iltimos, qayta yoki matn ko‘rinishida yuboring.');
          return;
        }
        const transcript = await this.voice.transcribeSalesVoice(userId, {
          buffer,
          size: buffer.length,
          mimetype: incoming.voice.mimeType || 'audio/ogg',
        }, incoming.voice.durationSeconds);
        text = [text, transcript.text].filter(Boolean).join('\n').trim();
      }
      let imageUnderstanding: SalesImageUnderstanding | undefined;
      if (incoming.image) {
        const imageEligible = incoming.peer.type === 'GROUP'
          ? addressed || activeSalesContext
          : true;
        if (!imageEligible) return;
        try {
          const buffer = await incoming.image.download();
          if (buffer?.length && buffer.length <= 8 * 1024 * 1024) {
            imageUnderstanding = await this.vision.understandProductImage(userId, {
              buffer,
              mimeType: incoming.image.mimeType || 'image/jpeg',
              caption: text,
            });
          }
        } catch (error) {
          this.logger.warn({ event: 'telegram_sales_image_understanding_failed', userId: this.safeUserId(userId), code: this.errorCode(error) });
        }
        text = text || 'Shunaqasi bormi?';
      }
      if (!text) return;

      if (incoming.peer.type === 'GROUP') {
        if (!addressed && !activeSalesContext && !imageUnderstanding && !(await this.isGroupSalesIntent(userId, text))) return;
        // Once this sender has an active sales thread in an explicitly selected
        // group, every message goes to the semantic sales brain. Short replies
        // like “ha”, “mayli”, “rahmat”, “boshqasi-chi?” can be meaningful and
        // must not be killed by regexes. Truly unrelated chatter is classified
        // as NON_SALES by AiAgent and gets no reply.
      } else {
        // salesPrivateChats=true is an explicit Professional Sales Inbox opt-in.
        // Every inbound USER message is therefore a customer turn; semantic AI
        // decides what it means instead of regex/privacy gates silently dropping it.
      }

      if (!salesSession) salesSession = await this.ensureSalesSession(userId, incoming);
      const contextUntil = new Date(Date.now() + SALES_CONTEXT_WINDOW_MS);
      const normalizedCustomerText = normalizeSalesTextForUnderstanding(text);
      // The AI sales brain, not a regex parser, owns semantic state updates.
      // The backend state remains a verified guardrail and Bito truth cache.
      const salesState = coerceUniversalSalesState(salesSession.salesState);
      await this.prisma.telegramSalesSession.update({
        where: { id: salesSession.id },
        data: { salesContextUntil: contextUntil, ownerPausedUntil: null },
      });

      const result = await this.ai.chat(
        userId,
        { message: text, conversationId: salesSession.conversationId, voice: Boolean(incoming.voice) },
        undefined,
        turn.signal,
        {
          externalSales: true,
          professionalInbox: incoming.peer.type === 'USER',
          newSalesEpoch: !activeSalesContext,
          channel: 'TELEGRAM',
          customer: {
            peerName: incoming.peer.displayName,
            peerType: incoming.peer.type,
            senderName: incoming.senderDisplayName,
          },
          salesState,
          normalizedCustomerText,
          visualProductHint: imageUnderstanding,
        },
      );

      // AiAgent reconciles the same state object with the verified Bito
      // inventory result. Persist it again before replying so follow-ups never
      // fall back to an older/default variant.
      await this.prisma.telegramSalesSession.update({
        where: { id: salesSession.id },
        data: { salesState: salesState as unknown as Prisma.InputJsonValue },
      });
      let answer = result.message?.trim() || professionalSalesFallbackReply(salesState, text);
      if ('suppressReply' in result && result.suppressReply === true) {
        if (incoming.peer.type !== 'USER') {
          await this.markProcessed(salesSession.id, incoming.messageId, false);
          await this.prisma.telegramSalesSession.update({ where: { id: salesSession.id }, data: { salesContextUntil: null } });
          return;
        }
        answer = professionalSalesFallbackReply(salesState, text);
      }
      if (result.pendingConfirmation) answer = 'Bu qadam uchun sotuvchi tasdig‘i kerak. Hozircha buyurtma ma’lumotlarini tayyorlab turaman.';
      answer = customerSafeSalesAnswer(answer, salesState);
      await this.safeReply(userId, incoming.peer.peerId, answer);
      const replyContextUntil = salesState.lastIntent === 'SOFT_EXIT' ? new Date(Date.now() + SALES_SOFT_EXIT_WINDOW_MS) : contextUntil;
      await this.markProcessed(salesSession.id, incoming.messageId, true, replyContextUntil);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        this.logger.warn({ event: 'telegram_sales_message_blocked', userId: this.safeUserId(userId), code: this.errorCode(error) });
        if (incoming.peer.type === 'USER') await this.safeReply(userId, incoming.peer.peerId, 'Salom 🙂 Hozir AI javobida vaqtinchalik cheklov bor. Savolingizni yozib qoldiring, yordam berishga harakat qilaman.').catch(() => undefined);
        return;
      }
      this.logger.warn({
        event: 'telegram_sales_message_failed',
        userId: this.safeUserId(userId),
        peerType: incoming.peer.type,
        hasVoice: Boolean(incoming.voice),
        code: this.errorCode(error),
      });
      // Only an already-active customer conversation gets a fallback. An
      // uncertain personal chat must never receive an automated error message.
      const existing = await this.prisma.telegramSalesSession.findUnique({ where: { userId_peerId: { userId, peerId: this.salesSessionPeerId(incoming) } } }).catch(() => null);
      if (incoming.peer.type === 'USER' || (existing?.salesContextUntil && existing.salesContextUntil.getTime() > Date.now())) {
        await this.safeReply(userId, incoming.peer.peerId, 'Hozir javob tayyorlashda kichik uzilish bo‘ldi. Savolingizni yana bir marta yozib yuboring, davom etaman.').catch(() => undefined);
      }
    } finally {
      this.processing.delete(key);
    }
  }

  private async isPrivateSalesIntent(userId: string, text: string, incoming: TelegramIncomingMessage): Promise<boolean> {
    const value = normalizeSalesTextForUnderstanding(text);
    if (!value || SOCIAL_ONLY.test(value)) return false;

    const establishedPersonal = incoming.senderIsContact
      && incoming.hadPriorConversation
      && incoming.recentOutgoingCount > 0;
    const explicitBusinessStoreInfo = STORE_INFO_TEXT.test(value)
      && /\b(?:do['‘’]?kon|magazin|shop|filial|ofis)\b/iu.test(value);
    if (STORE_INFO_TEXT.test(value) && (!establishedPersonal || explicitBusinessStoreInfo)) return true;
    const productFragment = bitoInventorySearchTerm(value)?.trim();
    const broadFamilyAvailability = /\b(?:qanaqa|qanday|qaysi\p{L}*)\b.{0,60}\bbor\b/iu.test(value);

    // For a saved contact with a real two-way history, privacy wins. Even words
    // like "narx" may occur in a personal chat ("telefoning narxi qancha?").
    // Activate only when the message also points to a product that exists in
    // the connected business inventory. This still lets saved customers buy
    // naturally without forcing the owner to label chats by hand.
    if (establishedPersonal) {
      if (CASUAL_PERSONAL.test(value)) return false;
      if ((EXPLICIT_SALES_TEXT.test(value) || AVAILABILITY_TEXT.test(value) || NEED_TEXT.test(value) || broadFamilyAvailability) && productFragment && productFragment.length >= 2) {
        return this.productExistsInBito(userId, productFragment);
      }
      return false;
    }

    // New/unknown chats can be handled more proactively. Strong commercial
    // language is enough; a vague "X bormi?" is verified against Bito when
    // there is prior history so ordinary non-sales conversations stay quiet.
    if (EXPLICIT_SALES_TEXT.test(value)) return true;

    if (AVAILABILITY_TEXT.test(value) && !NON_SALES_AVAILABILITY.test(value)) {
      if (productFragment && productFragment.length >= 2 && !CASUAL_PERSONAL.test(value)) {
        if (!incoming.senderIsContact && !incoming.hadPriorConversation) return true;
        return this.productExistsInBito(userId, productFragment);
      }
    }

    if (NEED_TEXT.test(value) && productFragment && productFragment.length >= 2 && !CASUAL_PERSONAL.test(value)) {
      // For a brand-new unknown sender, “5 mln bor kamera zo‘r tel kere” or
      // “menga qora futbolka kerak” is already a credible customer request even
      // when the literal fragment does not match a Bito product name. Let the
      // semantic sales brain resolve the need and query the real catalog. Saved
      // contacts with prior personal history were handled conservatively above.
      if (!incoming.senderIsContact && !incoming.hadPriorConversation) return true;
      return this.productExistsInBito(userId, productFragment);
    }

    if (broadFamilyAvailability && productFragment && productFragment.length >= 2 && !CASUAL_PERSONAL.test(value)) {
      return this.productExistsInBito(userId, productFragment);
    }

    // For a brand-new unknown sender, a compact model/SKU-like phrase such as
    // "iPhone 13 Pro" is a reasonable lead signal even without "narx/bormi".
    if (!incoming.senderIsContact && !incoming.hadPriorConversation && !CASUAL_PERSONAL.test(value)) {
      const tokens = value.match(/[\p{L}\p{N}]+/gu) ?? [];
      if (tokens.length <= 5 && /\d/.test(value) && /\p{L}/u.test(value)) return true;
    }
    return false;
  }

  private async isGroupSalesIntent(userId: string, text: string): Promise<boolean> {
    const value = normalizeSalesTextForUnderstanding(text);
    if (!value || SOCIAL_ONLY.test(value)) return false;
    if (EXPLICIT_SALES_TEXT.test(value) || STORE_INFO_TEXT.test(value)) return true;
    const broadFamilyAvailability = /\b(?:qanaqa|qanday|qaysi\p{L}*)\b.{0,60}\bbor\b/iu.test(value);
    if ((!AVAILABILITY_TEXT.test(value) && !NEED_TEXT.test(value) && !broadFamilyAvailability) || NON_SALES_AVAILABILITY.test(value) || CASUAL_PERSONAL.test(value)) return false;
    const productFragment = bitoInventorySearchTerm(value)?.trim();
    if (!productFragment || productFragment.length < 2) return false;
    // In a selected group, "Ali bormi?" must not trigger the bot merely
    // because it contains "bormi". Verify vague availability questions
    // against the real catalog first.
    return this.productExistsInBito(userId, productFragment);
  }

  private async productExistsInBito(userId: string, productFragment: string): Promise<boolean> {
    try {
      const snapshot = await this.bitoTools.getFullInventorySnapshot(userId, { search: productFragment, includeZero: true }) as { matchedCount?: unknown };
      return typeof snapshot.matchedCount === 'number' && snapshot.matchedCount > 0;
    } catch {
      return false;
    }
  }

  private async ensureSalesSession(userId: string, incoming: TelegramIncomingMessage) {
    const sessionPeerId = this.salesSessionPeerId(incoming);
    const existing = await this.prisma.telegramSalesSession.findUnique({
      where: { userId_peerId: { userId, peerId: sessionPeerId } },
    });
    if (existing) {
      if (existing.peerName !== incoming.peer.displayName || existing.peerType !== incoming.peer.type) {
        return this.prisma.telegramSalesSession.update({
          where: { id: existing.id },
          data: { peerName: incoming.peer.displayName, peerType: incoming.peer.type },
        });
      }
      return existing;
    }

    return this.prisma.$transaction(async tx => {
      const again = await tx.telegramSalesSession.findUnique({
        where: { userId_peerId: { userId, peerId: sessionPeerId } },
      });
      if (again) return again;
      const conversation = await tx.conversation.create({
        data: {
          userId,
          title: `Telegram • ${incoming.peer.displayName}${incoming.peer.type === 'GROUP' && incoming.senderDisplayName ? ` • ${incoming.senderDisplayName}` : ''}`.slice(0, 200),
          source: 'TELEGRAM_SALES',
          isTemporary: false,
        },
      });
      return tx.telegramSalesSession.create({
        data: {
          userId,
          peerId: sessionPeerId,
          peerType: incoming.peer.type,
          peerName: incoming.peer.displayName,
          conversationId: conversation.id,
          salesContextUntil: new Date(Date.now() + SALES_CONTEXT_WINDOW_MS),
        },
      });
    });
  }

  private salesSessionPeerId(incoming: TelegramIncomingMessage): string {
    if (incoming.peer.type !== 'GROUP') return incoming.peer.peerId;
    const sender = incoming.senderId?.trim() || incoming.senderUsername?.trim() || 'anonymous';
    return `${incoming.peer.peerId}:${sender}`.slice(0, 100);
  }

  private async markProcessed(sessionId: string, messageId: number, outbound: boolean, contextUntil?: Date): Promise<void> {
    const now = new Date();
    // Preserve the highest observed Telegram message id for diagnostics only.
    // Idempotency itself is enforced by SalesInboundReceipt, so an older unique
    // event is still processed rather than silently discarded.
    await this.prisma.telegramSalesSession.updateMany({
      where: {
        id: sessionId,
        OR: [
          { lastInboundMessageId: null },
          { lastInboundMessageId: { lt: messageId } },
        ],
      },
      data: { lastInboundMessageId: messageId },
    });
    await this.prisma.telegramSalesSession.update({
      where: { id: sessionId },
      data: {
        lastInboundAt: now,
        ...(outbound ? { lastOutboundAt: now } : {}),
        ...(contextUntil ? { salesContextUntil: contextUntil } : {}),
      },
    });
  }

  private async safeReply(userId: string, peerId: string, text: string): Promise<void> {
    const clean = text.replace(/\s{3,}/g, '\n\n').trim().slice(0, 3900);
    if (!clean) return;
    const peerKey = this.peerKey(userId, peerId);
    this.agentSendInFlight.set(peerKey, Date.now() + AGENT_SEND_IN_FLIGHT_MS);
    try {
      const result = await this.telegram.sendMessage(userId, peerId, clean);
      const messageId = Number(result.messageId);
      if (Number.isFinite(messageId)) {
        this.agentOutgoingMessageIds.set(this.outgoingMessageKey(userId, peerId, messageId), Date.now() + AGENT_OUTGOING_TRACK_MS);
      }
    } finally {
      this.agentSendInFlight.delete(peerKey);
    }
  }

  private peerKey(userId: string, peerId: string): string {
    return `${userId}:${peerId}`;
  }

  private outgoingMessageKey(userId: string, peerId: string, messageId: number): string {
    return `${userId}:${peerId}:${messageId}`;
  }

  private safeUserId(userId: string): string {
    return createHash('sha256').update(userId).digest('hex').slice(0, 10);
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      const message = (error as { message: string }).message;
      return message.match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'FAILED';
    }
    return 'FAILED';
  }
}
