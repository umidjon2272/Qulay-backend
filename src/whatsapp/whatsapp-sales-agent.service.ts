import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiVoiceService } from '../ai-agent/ai-voice.service';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppCryptoService } from './whatsapp-crypto.service';
import { isWhatsAppSalesRelevant, oggOpusDurationSeconds, shouldActivateWhatsAppSalesContext } from './whatsapp-sales-policy';

export type WhatsAppSalesAgentSettings = {
  configured: boolean;
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

@Injectable()
export class WhatsAppSalesAgentService {
  private readonly logger = new Logger(WhatsAppSalesAgentService.name);
  private readonly processing = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloud: WhatsAppCloudService,
    private readonly crypto: WhatsAppCryptoService,
    private readonly ai: AiAgentService,
    private readonly voice: AiVoiceService,
  ) {}

  async getSettings(userId: string): Promise<WhatsAppSalesAgentSettings> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection) {
      return {
        configured: this.cloud.configured(), connected: false, status: this.cloud.configured() ? 'DISCONNECTED' : 'not_configured',
        displayPhoneNumber: null, verifiedName: null, phoneNumberId: null, wabaId: null, webhookSubscribed: false,
        enabled: false, salesOnly: true, voiceEnabled: true, maxVoiceSeconds: 60, replyMode: 'TEXT',
        connectedAt: null, lastValidatedAt: null, lastErrorCode: null,
      };
    }
    return {
      configured: this.cloud.configured(),
      connected: connection.status === 'CONNECTED',
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

  async connect(userId: string, input: { phoneNumberId: string; wabaId?: string; accessToken: string }): Promise<WhatsAppSalesAgentSettings> {
    if (!this.cloud.configured()) throw new ServiceUnavailableException('WhatsApp server sozlamalari hali tayyor emas');
    const token = input.accessToken.trim();
    if (token.length < 20) throw new BadRequestException('WhatsApp access token noto‘g‘ri');
    const profile = await this.cloud.verifyPhoneNumber(token, input.phoneNumberId);
    const webhookSubscribed = input.wabaId ? await this.cloud.subscribeWaba(token, input.wabaId) : false;
    await this.prisma.whatsAppConnection.upsert({
      where: { userId },
      update: {
        phoneNumberId: profile.phoneNumberId,
        wabaId: input.wabaId?.trim() || null,
        displayPhoneNumber: profile.displayPhoneNumber,
        verifiedName: profile.verifiedName,
        qualityRating: profile.qualityRating,
        encryptedAccessToken: this.crypto.encrypt(token),
        status: 'CONNECTED', webhookSubscribed,
        connectedAt: new Date(), lastValidatedAt: new Date(), lastErrorAt: null, lastErrorCode: null,
      },
      create: {
        userId, phoneNumberId: profile.phoneNumberId, wabaId: input.wabaId?.trim() || null,
        displayPhoneNumber: profile.displayPhoneNumber, verifiedName: profile.verifiedName, qualityRating: profile.qualityRating,
        encryptedAccessToken: this.crypto.encrypt(token), status: 'CONNECTED', webhookSubscribed,
        connectedAt: new Date(), lastValidatedAt: new Date(),
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
        if (!phoneNumberId) continue;
        const connection = await this.prisma.whatsAppConnection.findUnique({ where: { phoneNumberId } });
        if (!connection || connection.status !== 'CONNECTED' || !connection.salesAgentEnabled) continue;
        const contactNames = new Map((value?.contacts ?? []).filter(c => c.wa_id).map(c => [c.wa_id!, c.profile?.name ?? null]));
        for (const message of value?.messages ?? []) {
          if (!message.id || !message.from) continue;
          void this.handleIncoming(connection.userId, message as IncomingWhatsAppMessage, contactNames.get(message.from) ?? null);
        }
      }
    }
  }

  private async handleIncoming(userId: string, message: IncomingWhatsAppMessage, displayName: string | null): Promise<void> {
    if (!message?.id || !message.from) return;
    const processKey = `${userId}:${message.id}`;
    if (this.processing.has(processKey)) return;
    this.processing.add(processKey);
    try {
      const accepted = await this.reserveMessage(userId, message.id);
      if (!accepted) return;
      const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
      if (!connection?.salesAgentEnabled || connection.status !== 'CONNECTED') return;

      const session = await this.ensureSession(userId, message.from, displayName);
      let text = this.messageText(message);
      const recentSalesContext = Boolean(session.salesContextUntil && session.salesContextUntil.getTime() > Date.now());

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
);``
        text = [text, transcript.text].filter(Boolean).join('\n').trim();
      }

      if (!text) return;
      const salesRelevant = isWhatsAppSalesRelevant(text, recentSalesContext, message.type);
      if (connection.salesOnly && !salesRelevant) return;
      const activateUntil = shouldActivateWhatsAppSalesContext(text, recentSalesContext) ? new Date(Date.now() + FOLLOWUP_WINDOW_MS) : session.salesContextUntil;
      if (activateUntil?.getTime() !== session.salesContextUntil?.getTime()) {
        await this.prisma.whatsAppSalesSession.update({ where: { id: session.id }, data: { salesContextUntil: activateUntil } });
      }

      const result = await this.ai.chat(
        userId,
        { message: text, conversationId: session.conversationId, voice: message.type === 'audio' },
        undefined,
        undefined,
        { externalSales: true, channel: 'WHATSAPP', customer: { peerName: displayName, peerType: 'USER', senderName: displayName } },
      );
      let answer = result.message?.trim() || 'Savolingizni operatorga qoldirdim.';
      if (result.pendingConfirmation) answer = 'Bu amal sotuvchi tasdig‘ini talab qiladi. So‘rovingiz operatorga qoldirildi.';
      answer = this.customerSafeAnswer(answer);
      await this.cloud.sendText(userId, message.from, answer);
      await this.prisma.whatsAppSalesSession.update({ where: { id: session.id }, data: { lastInboundAt: new Date(), lastOutboundAt: new Date(), customerName: displayName ?? session.customerName } });
    } catch (error) {
      this.logger.warn({ event: 'whatsapp_sales_message_failed', userId: this.safeId(userId), type: message?.type, code: this.errorCode(error) });
      await this.cloud.sendText(userId, message?.from ?? '', 'Hozir javobni tayyorlay olmadim. Iltimos, birozdan keyin qayta yozing.').catch(() => undefined);
    } finally {
      this.processing.delete(processKey);
    }
  }

  private async reserveMessage(userId: string, messageId: string): Promise<boolean> {
    try {
      await this.prisma.whatsAppInboundReceipt.create({ data: { userId, messageId } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
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

  private messageText(message: { type?: string; text?: { body?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; button?: { text?: string } }): string {
    if (message.type === 'text') return message.text?.body?.trim() ?? '';
    if (message.type === 'interactive') return message.interactive?.button_reply?.title?.trim() ?? message.interactive?.list_reply?.title?.trim() ?? '';
    if (message.type === 'button') return message.button?.text?.trim() ?? '';
    return '';
  }

  private customerSafeAnswer(value: string): string {
    return value
      .replace(/(?:bito|mcp|qulay\s*backend|api\s*key|oauth|token)/giu, 'tizim')
      .replace(/BITO_[A-Z0-9_]+/g, 'xizmat xatosi')
      .replace(/WHATSAPP_[A-Z0-9_]+/g, 'xizmat xatosi')
      .replace(/\b(?:access|refresh)[-_ ]?token\b/giu, 'ruxsat')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 3900);
  }

  private safeId(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 10); }
  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message.match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'FAILED';
    }
    return 'FAILED';
  }
}
