import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramAuthMode } from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramIntegrationService } from './instagram-integration.service';
import { parseInstagramJson } from './instagram-api-helpers';

export const INSTAGRAM_OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
] as const;

type OAuthState = { userId: string; nonce: string; expiresAt: number };
type ShortTokenResponse = { access_token?: string; user_id?: string | number };
type LongTokenResponse = { access_token?: string; token_type?: string; expires_in?: number };
type OAuthErrorBody = { error_message?: string; error_type?: string; code?: number; error?: { message?: string; type?: string; code?: number } };

@Injectable()
export class InstagramOAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly integration: InstagramIntegrationService,
  ) {}

  ready(): boolean {
    return this.config.get<boolean>('instagram.oauthReady') === true;
  }

  async connectUrl(userId: string): Promise<string> {
    this.assertReady();
    const now = new Date();
    const payload: OAuthState = { userId, nonce: randomBytes(18).toString('base64url'), expiresAt: now.getTime() + 10 * 60_000 };
    await this.prisma.instagramOAuthState.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { consumedAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
        ],
      },
    }).catch(() => undefined);
    await this.prisma.instagramOAuthState.create({
      data: { userId, nonceHash: this.nonceHash(payload.nonce), expiresAt: new Date(payload.expiresAt) },
    });
    const state = this.signState(payload);
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('instagram.appId'),
      redirect_uri: this.config.getOrThrow<string>('instagram.oauthRedirectUri'),
      response_type: 'code',
      scope: INSTAGRAM_OAUTH_SCOPES.join(','),
      state,
      enable_fb_login: '0',
      force_authentication: '1',
    });
    return `${this.config.get<string>('instagram.oauthAuthorizationUrl', 'https://www.instagram.com/oauth/authorize')}?${params.toString()}`;
  }

  async callback(code: string | undefined, stateValue: string | undefined, oauthError?: string): Promise<void> {
    this.assertReady();
    const state = this.verifyState(stateValue);
    await this.consumeState(state);
    const owner = await this.prisma.user.findUnique({ where: { id: state.userId }, select: { id: true } });
    if (!owner) throw this.failure('INSTAGRAM_OAUTH_USER_NOT_FOUND', 'QULAY AI foydalanuvchisi topilmadi');
    if (oauthError) throw this.failure('INSTAGRAM_OAUTH_CANCELLED', 'Instagram ulanishi bekor qilindi');
    if (!code) throw this.failure('INSTAGRAM_OAUTH_CODE_MISSING', 'Instagram authorization code kelmadi');

    const short = await this.exchangeCode(code);
    if (!short.access_token || !short.user_id) throw this.failure('INSTAGRAM_OAUTH_TOKEN_INVALID', 'Instagram token javobi to‘liq emas');
    const longLived = await this.exchangeLongLivedToken(short.access_token);
    if (!longLived.access_token) throw this.failure('INSTAGRAM_OAUTH_LONG_LIVED_TOKEN_INVALID', 'Instagram uzoq muddatli token bermadi');
    const tokenRefreshedAt = new Date();
    const expiresInSeconds = typeof longLived.expires_in === 'number' && Number.isFinite(longLived.expires_in) && longLived.expires_in > 0
      ? longLived.expires_in
      : undefined;
    await this.integration.connect(state.userId, {
      instagramUserId: String(short.user_id),
      accessToken: longLived.access_token,
      authMode: InstagramAuthMode.INSTAGRAM_LOGIN,
      tokenExpiresAt: expiresInSeconds ? new Date(tokenRefreshedAt.getTime() + expiresInSeconds * 1000) : undefined,
      tokenRefreshedAt,
    });
  }

  private async exchangeCode(code: string): Promise<ShortTokenResponse> {
    const form = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('instagram.appId'),
      client_secret: this.config.getOrThrow<string>('instagram.appSecret'),
      grant_type: 'authorization_code',
      redirect_uri: this.config.getOrThrow<string>('instagram.oauthRedirectUri'),
      code,
    });
    return this.oauthRequest<ShortTokenResponse>(this.config.get<string>('instagram.oauthTokenUrl', 'https://api.instagram.com/oauth/access_token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  }

  private async exchangeLongLivedToken(shortToken: string): Promise<LongTokenResponse> {
    const url = new URL(this.config.get<string>('instagram.oauthLongLivedTokenUrl', 'https://graph.instagram.com/access_token'));
    url.searchParams.set('grant_type', 'ig_exchange_token');
    url.searchParams.set('client_secret', this.config.getOrThrow<string>('instagram.appSecret'));
    url.searchParams.set('access_token', shortToken);
    return this.oauthRequest<LongTokenResponse>(url.toString(), { method: 'GET' });
  }

  private async oauthRequest<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }).catch(() => {
      throw new ServiceUnavailableException({ code: 'INSTAGRAM_OAUTH_UNAVAILABLE', message: 'Instagram login xizmati bilan ulanib bo‘lmadi' });
    });
    const rawBody = await response.text().catch(() => '');
    let body: T & OAuthErrorBody;
    try { body = rawBody ? parseInstagramJson<T & OAuthErrorBody>(rawBody) : {} as T & OAuthErrorBody; }
    catch { body = {} as T & OAuthErrorBody; }
    if (!response.ok) {
      const message = body.error_message ?? body.error?.message ?? 'Instagram login so‘rovi bajarilmadi';
      throw new BadRequestException({ code: 'INSTAGRAM_OAUTH_EXCHANGE_FAILED', message });
    }
    return body as T;
  }

  private signState(payload: OAuthState): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${createHmac('sha256', this.stateSecret()).update(encoded).digest('base64url')}`;
  }

  private verifyState(value: string | undefined): OAuthState {
    try {
      if (!value) throw new Error('missing');
      const [encoded, signature] = value.split('.');
      if (!encoded || !signature) throw new Error('malformed');
      const expected = createHmac('sha256', this.stateSecret()).update(encoded).digest('base64url');
      if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('signature');
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthState;
      if (!payload.userId || !payload.nonce || payload.expiresAt < Date.now()) throw new Error('expired');
      return payload;
    } catch {
      throw this.failure('INSTAGRAM_OAUTH_INVALID_STATE', 'Instagram login sessiyasi yaroqsiz yoki muddati tugagan');
    }
  }

  private stateSecret(): string {
    return `${this.config.getOrThrow<string>('instagram.appSecret')}:${this.config.getOrThrow<string>('jwt.accessSecret')}`;
  }

  private async consumeState(state: OAuthState): Promise<void> {
    const now = new Date();
    const consumed = await this.prisma.instagramOAuthState.updateMany({
      where: {
        userId: state.userId,
        nonceHash: this.nonceHash(state.nonce),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw this.failure('INSTAGRAM_OAUTH_INVALID_STATE', 'Instagram login sessiyasi yaroqsiz yoki muddati tugagan');
    }
  }

  private nonceHash(nonce: string): string {
    return createHash('sha256').update(nonce).digest('hex');
  }

  private assertReady(): void {
    if (!this.ready()) throw new ServiceUnavailableException({ code: 'INSTAGRAM_OAUTH_NOT_CONFIGURED', message: 'Instagram tez ulash hali sozlanmagan' });
  }

  private failure(code: string, message: string): BadRequestException {
    return new BadRequestException({ code, message });
  }

  errorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      const candidate = error as { getResponse?: () => unknown; message?: unknown };
      const response = typeof candidate.getResponse === 'function' ? candidate.getResponse() : null;
      if (response && typeof response === 'object' && 'code' in response && typeof (response as { code?: unknown }).code === 'string') return (response as { code: string }).code;
      if (typeof candidate.message === 'string') return candidate.message.match(/INSTAGRAM_[A-Z0-9_]+/)?.[0] ?? 'INSTAGRAM_OAUTH_FAILED';
    }
    return 'INSTAGRAM_OAUTH_FAILED';
  }
}
