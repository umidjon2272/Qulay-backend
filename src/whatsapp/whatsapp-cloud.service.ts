import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCryptoService } from './whatsapp-crypto.service';
import { APP_ERROR_CODES } from '../common/errors/app-error-codes';

export type WhatsAppProfile = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
};

@Injectable()
export class WhatsAppCloudService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: WhatsAppCryptoService,
  ) {}

  configured(): boolean {
    return Boolean(
      this.config.get<string>('whatsapp.appSecret') &&
      this.config.get<string>('whatsapp.webhookVerifyToken') &&
      this.config.get<string>('whatsapp.tokenEncryptionKey'),
    );
  }


  embeddedSignupConfigured(): boolean {
    return Boolean(
      this.config.get<string>('whatsapp.appId') &&
      this.config.get<string>('whatsapp.embeddedSignupConfigId') &&
      this.appSecret() &&
      this.config.get<string>('whatsapp.tokenEncryptionKey'),
    );
  }

  embeddedSignupPublicConfig(): { ready: boolean; appId: string | null; configId: string | null; graphApiVersion: string } {
    return {
      ready: this.embeddedSignupConfigured(),
      appId: this.config.get<string>('whatsapp.appId') ?? null,
      configId: this.config.get<string>('whatsapp.embeddedSignupConfigId') ?? null,
      graphApiVersion: this.graphVersion(),
    };
  }

  async exchangeEmbeddedSignupCode(code: string): Promise<string> {
    const cleanCode = code.trim();
    const appId = this.config.get<string>('whatsapp.appId');
    const appSecret = this.appSecret();
    if (!this.embeddedSignupConfigured() || !appId || !appSecret) {
      throw new ServiceUnavailableException('WhatsApp Embedded Signup hali sozlanmagan');
    }
    if (!cleanCode || cleanCode.length > 4096) throw new BadRequestException('WhatsApp authorization code noto‘g‘ri');
    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code: cleanCode });
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}/oauth/access_token?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    }).catch(() => { throw new ServiceUnavailableException('WhatsApp authorization tokenini olib bo‘lmadi'); });
    const body = await response.json().catch(() => ({})) as { access_token?: string; error?: { code?: number } };
    if (!response.ok || !body.access_token) {
      const codeValue = body.error?.code ? `WHATSAPP_GRAPH_${body.error.code}` : `WHATSAPP_GRAPH_HTTP_${response.status}`;
      throw new ServiceUnavailableException(codeValue);
    }
    return body.access_token;
  }

  graphVersion(): string {
    return this.config.get<string>('whatsapp.graphApiVersion', 'v24.0');
  }

  webhookVerifyToken(): string | undefined {
    return this.config.get<string>('whatsapp.webhookVerifyToken');
  }

  appSecret(): string | undefined {
    return this.config.get<string>('whatsapp.appSecret');
  }

  async verifyPhoneNumber(accessToken: string, phoneNumberId: string): Promise<WhatsAppProfile> {
    const cleanId = phoneNumberId.trim();
    if (!/^\d{5,30}$/.test(cleanId)) throw new BadRequestException('WhatsApp Phone Number ID noto‘g‘ri');
    const data = await this.graphJson<{ id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      `/${encodeURIComponent(cleanId)}?fields=id,display_phone_number,verified_name,quality_rating`,
      accessToken,
    );
    if (!data.id) throw new ServiceUnavailableException('WhatsApp raqamini tekshirib bo‘lmadi');
    return {
      phoneNumberId: data.id,
      displayPhoneNumber: data.display_phone_number ?? null,
      verifiedName: data.verified_name ?? null,
      qualityRating: data.quality_rating ?? null,
    };
  }

  async subscribeWaba(accessToken: string, wabaId: string): Promise<boolean> {
    const cleanId = wabaId.trim();
    if (!/^\d{5,30}$/.test(cleanId)) throw new BadRequestException({
      code: APP_ERROR_CODES.WHATSAPP_PHONE_OR_WABA_INVALID,
      message: 'WhatsApp Business Account ID noto‘g‘ri',
    });
    const body = await this.graphJson<{ success?: boolean }>(
      `/${encodeURIComponent(cleanId)}/subscribed_apps`,
      accessToken,
      { method: 'POST' },
    );
    if (body.success !== true) {
      throw new ServiceUnavailableException({
        code: APP_ERROR_CODES.WHATSAPP_WEBHOOK_SUBSCRIBE_FAILED,
        message: 'WhatsApp WABA webhook obunasini yoqib bo‘lmadi',
      });
    }
    return true;
  }

  async sendText(userId: string, waId: string, text: string): Promise<string | null> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection?.encryptedAccessToken || !connection.phoneNumberId || !['CONNECTED', 'DEGRADED'].includes(connection.status)) {
      throw new ServiceUnavailableException('WhatsApp ulanmagan');
    }
    const accessToken = this.crypto.decrypt(connection.encryptedAccessToken);
    const body = await this.graphJson<{ messages?: Array<{ id?: string }> }>(
      `/${encodeURIComponent(connection.phoneNumberId)}/messages`,
      accessToken,
      {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: waId,
          type: 'text',
          text: { preview_url: false, body: text.slice(0, 4000) },
        },
      },
    );
    await this.prisma.whatsAppConnection.update({ where: { userId }, data: { lastUsedAt: new Date(), lastErrorCode: null, lastErrorAt: null } }).catch(() => undefined);
    return body.messages?.[0]?.id ?? null;
  }

  async downloadMedia(userId: string, mediaId: string, maxBytes = 6 * 1024 * 1024): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection?.encryptedAccessToken || !['CONNECTED', 'DEGRADED'].includes(connection.status)) throw new ServiceUnavailableException('WhatsApp ulanmagan');
    const accessToken = this.crypto.decrypt(connection.encryptedAccessToken);
    const metadata = await this.graphJson<{ url?: string; mime_type?: string; file_size?: number }>(`/${encodeURIComponent(mediaId)}`, accessToken);
    if (!metadata.url) throw new ServiceUnavailableException('WhatsApp media manzili olinmadi');
    if (typeof metadata.file_size === 'number' && metadata.file_size > maxBytes) throw new BadRequestException('WhatsApp media juda katta');
    const response = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => { throw new ServiceUnavailableException('WhatsApp mediani yuklab bo‘lmadi'); });
    if (!response.ok) throw new ServiceUnavailableException('WhatsApp mediani yuklab bo‘lmadi');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) throw new BadRequestException('WhatsApp media bo‘sh yoki juda katta');
    return { buffer, mimeType: metadata.mime_type ?? response.headers.get('content-type') ?? 'audio/ogg', size: buffer.length };
  }

  async testConnection(userId: string): Promise<WhatsAppProfile> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection?.encryptedAccessToken) throw new ServiceUnavailableException('WhatsApp ulanmagan');
    try {
      const accessToken = this.crypto.decrypt(connection.encryptedAccessToken);
      const profile = await this.verifyPhoneNumber(accessToken, connection.phoneNumberId);
      let webhookSubscribed = connection.webhookSubscribed;
      let status: 'CONNECTED' | 'DEGRADED' = 'CONNECTED';
      let lastErrorCode: string | null = null;
      if (connection.wabaId) {
        try {
          webhookSubscribed = await this.subscribeWaba(accessToken, connection.wabaId);
        } catch (error) {
          // Phone/token are valid, so keep the usable connection instead of
          // turning a webhook-subscription problem into a total disconnect.
          status = 'DEGRADED';
          webhookSubscribed = false;
          lastErrorCode = this.errorCode(error);
        }
      }
      await this.prisma.whatsAppConnection.update({
        where: { userId },
        data: {
          status,
          webhookSubscribed,
          displayPhoneNumber: profile.displayPhoneNumber,
          verifiedName: profile.verifiedName,
          qualityRating: profile.qualityRating,
          lastValidatedAt: new Date(),
          lastErrorAt: lastErrorCode ? new Date() : null,
          lastErrorCode,
        },
      });
      return profile;
    } catch (error) {
      const code = this.errorCode(error);
      const authFailure = ['WHATSAPP_GRAPH_190', 'WHATSAPP_GRAPH_HTTP_401', 'WHATSAPP_GRAPH_HTTP_403', APP_ERROR_CODES.WHATSAPP_ACCESS_TOKEN_INVALID].includes(code);
      await this.prisma.whatsAppConnection.update({ where: { userId }, data: { status: authFailure ? 'ERROR' : 'DEGRADED', lastErrorAt: new Date(), lastErrorCode: code } }).catch(() => undefined);
      throw error;
    }
  }

  private async graphJson<T>(path: string, accessToken: string, options?: { method?: string; body?: unknown }): Promise<T> {
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}${path}`, {
      method: options?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new ServiceUnavailableException({
        code: APP_ERROR_CODES.WHATSAPP_GRAPH_UNAVAILABLE,
        message: 'WhatsApp Cloud API bilan vaqtinchalik ulanib bo‘lmadi',
      });
    });
    const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: number; type?: string } };
    if (!response.ok) {
      const metaCode = body.error?.code;
      if (metaCode === 190 || response.status === 401) {
        throw new UnauthorizedException({
          code: APP_ERROR_CODES.WHATSAPP_ACCESS_TOKEN_INVALID,
          message: 'WhatsApp Access Token yaroqsiz yoki muddati tugagan',
        });
      }
      if (metaCode === 10 || metaCode === 200 || response.status === 403) {
        throw new ForbiddenException({
          code: APP_ERROR_CODES.WHATSAPP_PERMISSION_REQUIRED,
          message: 'WhatsApp tokenida kerakli ruxsatlar yetarli emas',
        });
      }
      if (metaCode === 100 || response.status === 400 || response.status === 404) {
        throw new BadRequestException({
          code: APP_ERROR_CODES.WHATSAPP_PHONE_OR_WABA_INVALID,
          message: 'Phone Number ID yoki WhatsApp Business Account ID noto‘g‘ri',
        });
      }
      throw new ServiceUnavailableException({
        code: APP_ERROR_CODES.WHATSAPP_GRAPH_UNAVAILABLE,
        message: 'WhatsApp Cloud API so‘rovi vaqtinchalik bajarilmadi',
      });
    }
    return body as T;
  }

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
