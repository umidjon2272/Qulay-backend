import { Injectable, Logger, OnModuleDestroy, OnModuleInit, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TelegramConnectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiVoiceService } from '../ai-agent/ai-voice.service';
import { TelegramClientService, TelegramIncomingMessage, TelegramMessageListener } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';
import { TelegramIntegrationService } from './telegram-integration.service';

export type TelegramSalesAgentSettings = {
  enabled: boolean;
  privateChats: boolean;
  groups: boolean;
  voiceEnabled: boolean;
  maxVoiceSeconds: 60;
  replyMode: 'TEXT';
  listenerActive: boolean;
};

export type UpdateTelegramSalesAgentSettings = Partial<Pick<TelegramSalesAgentSettings, 'enabled' | 'privateChats' | 'groups' | 'voiceEnabled'>>;

type ActiveListener = {
  sessionFingerprint: string;
  listener: TelegramMessageListener;
};

const SALES_RELEVANT_TEXT = /(?:narx|nech\s*pul|qancha|bormi|mavjud|qoldiq|ombor|mahsulot|tovar|dona|kg|litr|model|rang|variant|chegirma|aksiya|promo|buyurtma|zakaz|olaman|olmoqch|kerak|yetkaz|delivery|достав|цена|сколько|есть\s+ли|в\s+налич|товар|продукт|заказ|скидк)/iu;
const TECHNICAL_NAME = /(?:bito|mcp|qulay\s*backend|api\s*key|oauth|token)/giu;

@Injectable()
export class TelegramSalesAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramSalesAgentService.name);
  private readonly listeners = new Map<string, ActiveListener>();
  private readonly processing = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TelegramCryptoService,
    private readonly telegramClient: TelegramClientService,
    private readonly telegram: TelegramIntegrationService,
    private readonly ai: AiAgentService,
    private readonly voice: AiVoiceService,
  ) {}

  onModuleInit(): void {
    // Delay startup slightly so Prisma/config and the rest of the application are ready.
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
        salesVoiceEnabled: true,
      },
    });
    if (!connection) throw new NotFoundException('Telegram ulanmagan');
    return {
      enabled: connection.salesAgentEnabled,
      privateChats: connection.salesPrivateChats,
      groups: connection.salesGroups,
      voiceEnabled: connection.salesVoiceEnabled,
      maxVoiceSeconds: 60,
      replyMode: 'TEXT',
      listenerActive: connection.status === TelegramConnectionStatus.CONNECTED && this.listeners.has(userId),
    };
  }

  async updateSettings(userId: string, input: UpdateTelegramSalesAgentSettings): Promise<TelegramSalesAgentSettings> {
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== TelegramConnectionStatus.CONNECTED || !connection.encryptedSession) {
      throw new NotFoundException('Telegram avval ulanishi kerak');
    }
    await this.prisma.telegramConnection.update({
      where: { userId },
      data: {
        ...(typeof input.enabled === 'boolean' ? { salesAgentEnabled: input.enabled } : {}),
        ...(typeof input.privateChats === 'boolean' ? { salesPrivateChats: input.privateChats } : {}),
        ...(typeof input.groups === 'boolean' ? { salesGroups: input.groups } : {}),
        ...(typeof input.voiceEnabled === 'boolean' ? { salesVoiceEnabled: input.voiceEnabled } : {}),
        // Product policy is fixed for now. Do not let clients silently raise the limit.
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
      const enabled = new Set(rows.map(row => row.userId));

      for (const [userId, active] of this.listeners) {
        if (enabled.has(userId)) continue;
        this.listeners.delete(userId);
        await active.listener.stop().catch(() => undefined);
      }

      for (const row of rows) {
        if (!row.encryptedSession) continue;
        const fingerprint = createHash('sha256').update(row.encryptedSession).digest('hex').slice(0, 20);
        const active = this.listeners.get(row.userId);
        if (active?.sessionFingerprint === fingerprint) continue;
        if (active) {
          this.listeners.delete(row.userId);
          await active.listener.stop().catch(() => undefined);
        }
        try {
          const session = this.crypto.decrypt(row.encryptedSession);
          const listener = await this.telegramClient.listenIncomingMessages(session, message => this.handleIncoming(row.userId, message));
          this.listeners.set(row.userId, { sessionFingerprint: fingerprint, listener });
          this.logger.log({ event: 'telegram_sales_listener_started', userId: this.safeUserId(row.userId) });
        } catch (error) {
          this.logger.warn({ event: 'telegram_sales_listener_start_failed', userId: this.safeUserId(row.userId), code: this.errorCode(error) });
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  private async handleIncoming(userId: string, incoming: TelegramIncomingMessage): Promise<void> {
    if (incoming.senderIsBot || incoming.peer.type === 'CHANNEL') return;
    const key = `${userId}:${incoming.peer.peerId}:${incoming.messageId}`;
    if (this.processing.has(key)) return;
    this.processing.add(key);
    try {
      const connection = await this.prisma.telegramConnection.findUnique({
        where: { userId },
        select: {
          status: true,
          encryptedSession: true,
          salesAgentEnabled: true,
          salesPrivateChats: true,
          salesGroups: true,
          salesVoiceEnabled: true,
          salesVoiceMaxSeconds: true,
        },
      });
      if (!connection?.salesAgentEnabled || connection.status !== TelegramConnectionStatus.CONNECTED || !connection.encryptedSession) return;
      if (incoming.peer.type === 'USER' && !connection.salesPrivateChats) return;
      if (incoming.peer.type === 'GROUP' && !connection.salesGroups) return;

      // In groups, avoid acting like a spam bot. Text can trigger on a clear sales
      // question; voice is transcribed only when the account was mentioned/replied to.
      if (incoming.peer.type === 'GROUP') {
        // Do not open a shared AI context for anonymous/channel-backed senders;
        // without a stable sender identity we cannot guarantee customer isolation.
        if (!incoming.senderId && !incoming.senderUsername) return;
        const addressed = incoming.mentioned || incoming.replyToOwnMessage;
        if (incoming.voice && !addressed) return;
        if (!incoming.voice && !addressed && !SALES_RELEVANT_TEXT.test(incoming.text)) return;
      }

      const salesSession = await this.ensureSalesSession(userId, incoming);
      if (salesSession.lastInboundMessageId !== null && incoming.messageId <= salesSession.lastInboundMessageId) return;

      let text = incoming.text.trim();
      if (incoming.voice) {
        if (!connection.salesVoiceEnabled) return;
        const maxSeconds = Math.min(60, Math.max(1, connection.salesVoiceMaxSeconds || 60));
        if (!incoming.voice.durationSeconds || incoming.voice.durationSeconds > maxSeconds) {
          await this.safeReply(userId, incoming.peer.peerId, `Golos ${maxSeconds} soniyadan uzun. Iltimos, qisqaroq yuboring.`);
          await this.markProcessed(salesSession.id, incoming.messageId, true);
          return;
        }
        const buffer = await incoming.voice.download();
        if (!buffer?.length || buffer.length > 6 * 1024 * 1024) {
          await this.safeReply(userId, incoming.peer.peerId, 'Golosni o‘qib bo‘lmadi. Iltimos, qayta yoki matn ko‘rinishida yuboring.');
          await this.markProcessed(salesSession.id, incoming.messageId, true);
          return;
        }
        const transcript = await this.voice.transcribeSalesVoice(userId, {
          buffer,
          size: buffer.length,
          mimetype: incoming.voice.mimeType || 'audio/ogg',
        }, incoming.voice.durationSeconds);
        text = [text, transcript.text].filter(Boolean).join('\n').trim();
      }
      if (!text) return;

      const result = await this.ai.chat(
        userId,
        { message: text, conversationId: salesSession.conversationId, voice: Boolean(incoming.voice) },
        undefined,
        undefined,
        {
          externalSales: true,
          channel: 'TELEGRAM',
          customer: {
            peerName: incoming.peer.displayName,
            peerType: incoming.peer.type,
            senderName: incoming.senderDisplayName,
          },
        },
      );

      let answer = result.message?.trim() || 'Savolingizni operatorga qoldirdim.';
      if (result.pendingConfirmation) answer = 'Bu amal sotuvchi tasdig‘ini talab qiladi. So‘rovingiz operatorga qoldirildi.';
      answer = this.customerSafeAnswer(answer);
      await this.safeReply(userId, incoming.peer.peerId, answer);
      await this.markProcessed(salesSession.id, incoming.messageId, true);
    } catch (error) {
      this.logger.warn({
        event: 'telegram_sales_message_failed',
        userId: this.safeUserId(userId),
        peerType: incoming.peer.type,
        hasVoice: Boolean(incoming.voice),
        code: this.errorCode(error),
      });
      // Do not expose billing, MCP, token or backend diagnostics to customers.
      await this.safeReply(userId, incoming.peer.peerId, 'Hozir javobni tayyorlay olmadim. Iltimos, birozdan keyin qayta yozing.').catch(() => undefined);
    } finally {
      this.processing.delete(key);
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
        },
      });
    });
  }

  private salesSessionPeerId(incoming: TelegramIncomingMessage): string {
    // Private chats are naturally isolated by peer id. A Telegram group is a
    // shared peer, so key the AI conversation by group + sender to prevent one
    // customer's product/order context from leaking into another member's
    // conversation. Anonymous/channel-backed senders get a bounded fallback.
    if (incoming.peer.type !== 'GROUP') return incoming.peer.peerId;
    const sender = incoming.senderId?.trim() || incoming.senderUsername?.trim() || 'anonymous';
    return `${incoming.peer.peerId}:${sender}`.slice(0, 100);
  }

  private async markProcessed(sessionId: string, messageId: number, outbound: boolean): Promise<void> {
    await this.prisma.telegramSalesSession.update({
      where: { id: sessionId },
      data: {
        lastInboundMessageId: messageId,
        lastInboundAt: new Date(),
        ...(outbound ? { lastOutboundAt: new Date() } : {}),
      },
    });
  }

  private async safeReply(userId: string, peerId: string, text: string): Promise<void> {
    const clean = text.replace(/\s{3,}/g, '\n\n').trim().slice(0, 3900);
    if (!clean) return;
    await this.telegram.sendMessage(userId, peerId, clean);
  }

  private customerSafeAnswer(value: string): string {
    const sanitized = value
      .replace(TECHNICAL_NAME, 'tizim')
      .replace(/BITO_[A-Z0-9_]+/g, 'xizmat xatosi')
      .replace(/\b(?:access|refresh)[-_ ]?token\b/giu, 'ruxsat')
      .trim();
    return sanitized.slice(0, 3900);
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
