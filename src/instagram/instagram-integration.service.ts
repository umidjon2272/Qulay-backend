import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InstagramAuthMode, InstagramConnectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramCryptoService } from './instagram-crypto.service';
import { InstagramGraphService } from './instagram-graph.service';
import { normalizeInstagramAutomationTrigger } from './instagram-automation-utils';

export type InstagramSettings = {
  configured: boolean;
  oauthReady: boolean;
  connected: boolean;
  status: 'DISCONNECTED' | 'CONNECTED' | 'DEGRADED' | 'ERROR' | 'not_configured';
  instagramUserId: string | null;
  username: string | null;
  displayName: string | null;
  profilePictureUrl: string | null;
  webhookSubscribed: boolean;
  enabled: boolean;
  dmEnabled: boolean;
  commentsEnabled: boolean;
  imageVisionEnabled: boolean;
  connectedAt: string | null;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
};

@Injectable()
export class InstagramIntegrationService {
  private readonly logger = new Logger(InstagramIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: InstagramGraphService,
    private readonly crypto: InstagramCryptoService,
  ) {}

  async status(userId: string): Promise<InstagramSettings> {
    const row = await this.prisma.instagramConnection.findUnique({ where: { userId } });
    if (!row) return this.emptyStatus();
    return {
      configured: this.graph.configured(),
      oauthReady: this.graph.oauthReady(),
      connected: row.status === InstagramConnectionStatus.CONNECTED || row.status === InstagramConnectionStatus.DEGRADED,
      status: row.status,
      instagramUserId: row.instagramUserId,
      username: row.username,
      displayName: row.displayName,
      profilePictureUrl: row.profilePictureUrl,
      webhookSubscribed: row.webhookSubscribed,
      enabled: row.salesAgentEnabled,
      dmEnabled: row.dmEnabled,
      commentsEnabled: row.commentsEnabled,
      imageVisionEnabled: row.imageVisionEnabled,
      connectedAt: row.connectedAt?.toISOString() ?? null,
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      lastErrorCode: row.lastErrorCode,
    };
  }

  async connect(userId: string, input: { instagramUserId: string; accessToken: string; authMode?: InstagramAuthMode }): Promise<InstagramSettings> {
    if (!this.graph.configured()) throw new ServiceUnavailableException('Instagram server sozlamalari hali tayyor emas');
    const token = input.accessToken.trim();
    const instagramUserId = input.instagramUserId.trim();
    if (token.length < 20) throw new BadRequestException('Instagram access token noto‘g‘ri');
    const authMode = input.authMode ?? InstagramAuthMode.FACEBOOK_LOGIN;
    const profile = await this.graph.verifyProfile(token, instagramUserId, authMode);
    let webhookSubscribed = false;
    let status: InstagramConnectionStatus = InstagramConnectionStatus.CONNECTED;
    let lastErrorCode: string | null = null;
    try {
      webhookSubscribed = await this.graph.subscribeWebhooks(token, profile.id, authMode);
    } catch (error) {
      status = InstagramConnectionStatus.DEGRADED;
      lastErrorCode = this.graph.errorCode(error);
      this.logger.warn({ event: 'instagram_webhook_subscribe_degraded', userId: this.graph.safeId(userId), code: lastErrorCode });
    }
    const now = new Date();
    await this.prisma.instagramConnection.upsert({
      where: { userId },
      update: {
        instagramUserId: profile.id,
        username: profile.username,
        displayName: profile.name,
        profilePictureUrl: profile.profilePictureUrl,
        encryptedAccessToken: this.crypto.encrypt(token),
        authMode,
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
        instagramUserId: profile.id,
        username: profile.username,
        displayName: profile.name,
        profilePictureUrl: profile.profilePictureUrl,
        encryptedAccessToken: this.crypto.encrypt(token),
        authMode,
        status,
        webhookSubscribed,
        salesAgentEnabled: true,
        connectedAt: now,
        lastValidatedAt: now,
        lastErrorAt: lastErrorCode ? now : null,
        lastErrorCode,
      },
    });
    return this.status(userId);
  }

  async updateSettings(userId: string, input: { enabled?: boolean; dmEnabled?: boolean; commentsEnabled?: boolean; imageVisionEnabled?: boolean }): Promise<InstagramSettings> {
    const row = await this.prisma.instagramConnection.findUnique({ where: { userId } });
    if (!row) throw new NotFoundException('Instagram avval ulanishi kerak');
    await this.prisma.instagramConnection.update({
      where: { userId },
      data: {
        ...(typeof input.enabled === 'boolean' ? { salesAgentEnabled: input.enabled } : {}),
        ...(typeof input.dmEnabled === 'boolean' ? { dmEnabled: input.dmEnabled } : {}),
        ...(typeof input.commentsEnabled === 'boolean' ? { commentsEnabled: input.commentsEnabled } : {}),
        ...(typeof input.imageVisionEnabled === 'boolean' ? { imageVisionEnabled: input.imageVisionEnabled } : {}),
      },
    });
    return this.status(userId);
  }

  async test(userId: string): Promise<InstagramSettings> {
    await this.graph.testConnection(userId);
    return this.status(userId);
  }

  async disconnect(userId: string): Promise<{ status: 'disconnected' }> {
    await this.prisma.instagramConnection.delete({ where: { userId } }).catch(() => undefined);
    return { status: 'disconnected' };
  }

  async listPosts(userId: string, limit = 25) {
    return this.graph.listMedia(userId, limit);
  }

  async listAutomations(userId: string, activeOnly = false) {
    return this.prisma.instagramCommentAutomation.findMany({
      where: { userId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true, mediaId: true, mediaCaption: true, mediaPermalink: true, triggerText: true,
        semanticMatch: true, dmMessage: true, publicReply: true, sendPrivateReply: true,
        replyPublicly: true, active: true, createdAt: true, updatedAt: true,
      },
    });
  }

  async createAutomation(userId: string, input: {
    mediaId: string; triggerText: string; dmMessage: string; publicReply?: string;
    semanticMatch?: boolean; sendPrivateReply?: boolean; replyPublicly?: boolean; active?: boolean;
  }) {
    const media = await this.graph.getMedia(userId, input.mediaId);
    if (!media) throw new BadRequestException('Instagram posti topilmadi');
    const normalized = this.automationData(userId, media, input);
    return this.prisma.instagramCommentAutomation.upsert({
      where: { userId_mediaId_triggerKey: { userId, mediaId: media.id, triggerKey: normalized.triggerKey } },
      update: {
        mediaCaption: normalized.mediaCaption,
        mediaPermalink: normalized.mediaPermalink,
        triggerText: normalized.triggerText,
        semanticMatch: normalized.semanticMatch,
        dmMessage: normalized.dmMessage,
        publicReply: normalized.publicReply,
        sendPrivateReply: normalized.sendPrivateReply,
        replyPublicly: normalized.replyPublicly,
        active: normalized.active,
      },
      create: normalized,
      select: {
        id: true, mediaId: true, mediaCaption: true, mediaPermalink: true, triggerText: true,
        semanticMatch: true, dmMessage: true, publicReply: true, sendPrivateReply: true,
        replyPublicly: true, active: true, createdAt: true, updatedAt: true,
      },
    });
  }

  async replaceAutomationsForMedia(userId: string, input: {
    mediaId: string; triggerText: string; dmMessage: string; publicReply?: string;
    semanticMatch?: boolean; sendPrivateReply?: boolean; replyPublicly?: boolean; active?: boolean;
  }) {
    const media = await this.graph.getMedia(userId, input.mediaId);
    if (!media) throw new BadRequestException('Instagram posti topilmadi');
    const data = this.automationData(userId, media, input);
    return this.prisma.$transaction(async tx => {
      await tx.instagramCommentAutomation.deleteMany({ where: { userId, mediaId: media.id } });
      return tx.instagramCommentAutomation.create({
        data,
        select: {
          id: true, mediaId: true, mediaCaption: true, mediaPermalink: true, triggerText: true,
          semanticMatch: true, dmMessage: true, publicReply: true, sendPrivateReply: true,
          replyPublicly: true, active: true, createdAt: true, updatedAt: true,
        },
      });
    });
  }

  async updateAutomation(userId: string, automationId: string, input: Partial<{
    triggerText: string; dmMessage: string; publicReply: string | null;
    semanticMatch: boolean; sendPrivateReply: boolean; replyPublicly: boolean; active: boolean;
  }>) {
    const row = await this.prisma.instagramCommentAutomation.findFirst({ where: { id: automationId, userId }, select: { id: true } });
    if (!row) throw new NotFoundException('Instagram automation topilmadi');
    return this.prisma.instagramCommentAutomation.update({
      where: { id: automationId },
      data: {
        ...(typeof input.triggerText === 'string' ? {
          triggerText: input.triggerText.trim().slice(0, 2000),
          triggerKey: this.normalizedTriggerOrThrow(input.triggerText),
        } : {}),
        ...(typeof input.dmMessage === 'string' ? { dmMessage: input.dmMessage.trim().slice(0, 4000) } : {}),
        ...(input.publicReply === null ? { publicReply: null } : typeof input.publicReply === 'string' ? { publicReply: input.publicReply.trim().slice(0, 1000) || null } : {}),
        ...(typeof input.semanticMatch === 'boolean' ? { semanticMatch: input.semanticMatch } : {}),
        ...(typeof input.sendPrivateReply === 'boolean' ? { sendPrivateReply: input.sendPrivateReply } : {}),
        ...(typeof input.replyPublicly === 'boolean' ? { replyPublicly: input.replyPublicly } : {}),
        ...(typeof input.active === 'boolean' ? { active: input.active } : {}),
      },
    });
  }

  async deleteAutomation(userId: string, automationId: string) {
    const row = await this.prisma.instagramCommentAutomation.findFirst({ where: { id: automationId, userId }, select: { id: true } });
    if (!row) throw new NotFoundException('Instagram automation topilmadi');
    return this.prisma.instagramCommentAutomation.delete({ where: { id: automationId }, select: { id: true, mediaId: true, triggerText: true } });
  }


  private automationData(userId: string, media: { id: string; caption?: string | null; permalink?: string | null }, input: {
    triggerText: string; dmMessage: string; publicReply?: string;
    semanticMatch?: boolean; sendPrivateReply?: boolean; replyPublicly?: boolean; active?: boolean;
  }) {
    const triggerText = input.triggerText.trim().slice(0, 2000);
    const dmMessage = input.dmMessage.trim().slice(0, 4000);
    if (!dmMessage) throw new BadRequestException('Direct xabari bo‘sh bo‘lishi mumkin emas');
    return {
      userId,
      mediaId: media.id,
      mediaCaption: media.caption ?? null,
      mediaPermalink: media.permalink ?? null,
      triggerText,
      triggerKey: this.normalizedTriggerOrThrow(triggerText),
      semanticMatch: input.semanticMatch !== false,
      dmMessage,
      publicReply: input.publicReply?.trim().slice(0, 1000) || null,
      sendPrivateReply: input.sendPrivateReply !== false,
      replyPublicly: input.replyPublicly === true,
      active: input.active !== false,
    };
  }

  private normalizedTriggerOrThrow(value: string): string {
    const triggerKey = normalizeInstagramAutomationTrigger(value);
    if (!triggerKey) throw new BadRequestException('Instagram automation triggeri bo‘sh bo‘lishi mumkin emas');
    return triggerKey;
  }

  private emptyStatus(): InstagramSettings {
    return {
      configured: this.graph.configured(), oauthReady: this.graph.oauthReady(), connected: false, status: this.graph.configured() ? 'DISCONNECTED' : 'not_configured',
      instagramUserId: null, username: null, displayName: null, profilePictureUrl: null, webhookSubscribed: false,
      enabled: false, dmEnabled: true, commentsEnabled: true, imageVisionEnabled: true,
      connectedAt: null, lastValidatedAt: null, lastErrorCode: null,
    };
  }
}
