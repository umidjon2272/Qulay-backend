import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCryptoService } from './whatsapp-crypto.service';

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
    if (!/^\d{5,30}$/.test(cleanId)) throw new BadRequestException('WhatsApp Business Account ID noto‘g‘ri');
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(cleanId)}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12_000),
    }).catch(() => { throw new ServiceUnavailableException('WhatsApp webhook subscription ishlamadi'); });
    if (!response.ok) return false;
    const body = await response.json().catch(() => ({})) as { success?: boolean };
    return body.success === true;
  }

  async sendText(userId: string, waId: string, text: string): Promise<string | null> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection?.encryptedAccessToken || !connection.phoneNumberId || connection.status !== 'CONNECTED') {
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

  async downloadMedia(userId: string, mediaId: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection?.encryptedAccessToken || connection.status !== 'CONNECTED') throw new ServiceUnavailableException('WhatsApp ulanmagan');
    const accessToken = this.crypto.decrypt(connection.encryptedAccessToken);
    const metadata = await this.graphJson<{ url?: string; mime_type?: string; file_size?: number }>(`/${encodeURIComponent(mediaId)}`, accessToken);
    if (!metadata.url) throw new ServiceUnavailableException('WhatsApp audio manzili olinmadi');
    const maxBytes = 6 * 1024 * 1024;
    if (typeof metadata.file_size === 'number' && metadata.file_size > maxBytes) throw new BadRequestException('WhatsApp golos juda katta');
    const response = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => { throw new ServiceUnavailableException('WhatsApp audioni yuklab bo‘lmadi'); });
    if (!response.ok) throw new ServiceUnavailableException('WhatsApp audioni yuklab bo‘lmadi');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) throw new BadRequestException('WhatsApp golos bo‘sh yoki juda katta');
    return { buffer, mimeType: metadata.mime_type ?? response.headers.get('content-type') ?? 'audio/ogg', size: buffer.length };
  }

  async testConnection(userId: string): Promise<WhatsAppProfile> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!connection?.encryptedAccessToken) throw new ServiceUnavailableException('WhatsApp ulanmagan');
    try {
      const profile = await this.verifyPhoneNumber(this.crypto.decrypt(connection.encryptedAccessToken), connection.phoneNumberId);
      await this.prisma.whatsAppConnection.update({ where: { userId }, data: { status: 'CONNECTED', lastValidatedAt: new Date(), lastErrorAt: null, lastErrorCode: null } });
      return profile;
    } catch (error) {
      const code = this.errorCode(error);
      const authFailure = ['WHATSAPP_GRAPH_190', 'WHATSAPP_GRAPH_HTTP_401', 'WHATSAPP_GRAPH_HTTP_403'].includes(code);
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
    }).catch(() => { throw new ServiceUnavailableException('WhatsApp Cloud API bilan ulanib bo‘lmadi'); });
    const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } };
    if (!response.ok) {
      const code = body.error?.code ? `WHATSAPP_GRAPH_${body.error.code}` : `WHATSAPP_GRAPH_HTTP_${response.status}`;
      throw new ServiceUnavailableException(code);
    }
    return body as T;
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message.match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'FAILED';
    }
    return 'FAILED';
  }
}
