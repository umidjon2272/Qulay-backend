import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleConnection, GoogleConnectionStatus } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleApiClientService } from './google-api-client.service';
import { GoogleCryptoService } from './google-crypto.service';
import { GoogleAdapterError, isRetryableGoogleStatus, retryAfterMs } from './google.errors';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

type OAuthState = { userId: string; nonce: string; expiresAt: number };
type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
type GoogleProfile = { sub?: string; email?: string; name?: string };

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly refreshes = new Map<string, Promise<string>>();
  private readonly usedStates = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: GoogleCryptoService,
    private readonly api: GoogleApiClientService,
    private readonly activityLog: ActivityLogService,
  ) {}

  connectUrl(userId: string): string {
    this.assertConfigured();
    this.purgeStates();
    const state = this.signState({ userId, nonce: randomBytes(18).toString('base64url'), expiresAt: Date.now() + 10 * 60_000 });
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('google.clientId'),
      redirect_uri: this.config.getOrThrow<string>('google.redirectUri'),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: GOOGLE_SCOPES.join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async callback(code: string | undefined, stateValue: string | undefined, oauthError?: string): Promise<void> {
    this.assertConfigured();
    let stateValid = false;
    let userResolved = false;
    let exchangeSucceeded = false;
    let dbUpsertSucceeded = false;
    try {
      const state = this.verifyState(stateValue);
      stateValid = true;
      const owner = await this.prisma.user.findUnique({ where: { id: state.userId }, select: { id: true } });
      if (!owner) throw new GoogleAdapterError('INVALID_STATE');
      userResolved = true;
      if (oauthError) throw new GoogleAdapterError('OAUTH_CANCELLED');
      if (!code) throw new GoogleAdapterError('INVALID_REQUEST');
      const token = await this.exchangeCode(code);
      exchangeSucceeded = true;
      this.logger.log({ event: 'google_oauth_code_exchange', success: true, accessTokenPresent: Boolean(token.access_token), refreshTokenPresent: Boolean(token.refresh_token) });
      const profile = await this.api.request<GoogleProfile>('https://www.googleapis.com/oauth2/v3/userinfo', token.access_token, { resource: 'oauth' });
      if (!profile.sub) throw new GoogleAdapterError('INVALID_REQUEST');
      const existing = await this.prisma.googleConnection.findUnique({ where: { userId: state.userId } });
      const scopes = token.scope?.split(' ').filter(Boolean) ?? [...GOOGLE_SCOPES];
      await this.prisma.googleConnection.upsert({
      where: { userId: state.userId },
      create: {
        userId: state.userId,
        googleUserId: profile.sub,
        email: profile.email ?? null,
        displayName: profile.name ?? null,
        encryptedAccessToken: this.crypto.encrypt(token.access_token),
        encryptedRefreshToken: token.refresh_token ? this.crypto.encrypt(token.refresh_token) : existing?.encryptedRefreshToken ?? null,
        accessTokenExpiresAt: this.expiry(token.expires_in),
        scopes,
        status: GoogleConnectionStatus.CONNECTED,
        connectedAt: new Date(),
        lastUsedAt: null,
      },
      update: {
        googleUserId: profile.sub,
        email: profile.email ?? null,
        displayName: profile.name ?? null,
        encryptedAccessToken: this.crypto.encrypt(token.access_token),
        encryptedRefreshToken: token.refresh_token ? this.crypto.encrypt(token.refresh_token) : existing?.encryptedRefreshToken ?? null,
        accessTokenExpiresAt: this.expiry(token.expires_in),
        scopes,
        status: GoogleConnectionStatus.CONNECTED,
        connectedAt: new Date(),
      },
      });
      dbUpsertSucceeded = true;
      this.logger.log({ event: 'google_oauth_connection_persisted', success: true, finalStatus: GoogleConnectionStatus.CONNECTED });
      await this.activityLog.record({ userId: state.userId, action: ACTIVITY_ACTIONS.GOOGLE_CONNECTED, entityType: 'GOOGLE_CONNECTION', metadata: { scopes } });
    } catch (error) {
      this.logger.warn({ event: 'google_oauth_callback_failed', stateValid, userResolved, exchangeSucceeded, dbUpsertSucceeded, errorCode: error instanceof GoogleAdapterError ? error.code : 'UNAVAILABLE' });
      throw error;
    }
  }

  async getAccessToken(userId: string): Promise<string> {
    this.assertConfigured();
    const connection = await this.prisma.googleConnection.findUnique({ where: { userId } });
    if (!connection || connection.status === GoogleConnectionStatus.ERROR) {
      throw new GoogleAdapterError('TOKEN_REVOKED');
    }
    if (connection.status !== GoogleConnectionStatus.CONNECTED || !connection.encryptedAccessToken) {
      throw new GoogleAdapterError('NOT_CONNECTED');
    }
    if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() > Date.now() + 30_000) {
      await this.touch(connection.id);
      return this.crypto.decrypt(connection.encryptedAccessToken);
    }
    const ongoing = this.refreshes.get(userId);
    if (ongoing) return ongoing;
    const refresh = this.refreshAccessToken(userId, connection).finally(() => this.refreshes.delete(userId));
    this.refreshes.set(userId, refresh);
    return refresh;
  }

  async status(userId: string) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        status: 'not_configured',
        email: null,
        displayName: null,
        connectedAt: null,
        calendarEnabled: false,
        driveEnabled: false,
      };
    }
    const connection = await this.prisma.googleConnection.findUnique({ where: { userId } });
    const connected = connection?.status === GoogleConnectionStatus.CONNECTED;
    const scopes = new Set(connection?.scopes ?? []);
    return {
      configured: true,
      connected,
      status: connection?.status ?? GoogleConnectionStatus.DISCONNECTED,
      email: connection?.email ?? null,
      displayName: connection?.displayName ?? null,
      connectedAt: connection?.connectedAt?.toISOString() ?? null,
      calendarEnabled: connected && scopes.has('https://www.googleapis.com/auth/calendar.readonly') && scopes.has('https://www.googleapis.com/auth/calendar.events'),
      driveEnabled: connected && scopes.has('https://www.googleapis.com/auth/drive.metadata.readonly') && scopes.has('https://www.googleapis.com/auth/drive.readonly'),
    };
  }

  async disconnect(userId: string): Promise<{ status: 'disconnected' }> {
    this.assertConfigured();
    const connection = await this.prisma.googleConnection.findUnique({ where: { userId } });
    if (connection?.encryptedAccessToken) {
      try {
        const accessToken = this.crypto.decrypt(connection.encryptedAccessToken);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: 'POST' });
      } catch (error) {
        this.logger.warn(`Google token revoke failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    if (connection) {
      await this.prisma.googleConnection.update({
        where: { userId },
        data: { encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null, status: GoogleConnectionStatus.DISCONNECTED, connectedAt: null, lastUsedAt: null, scopes: [] },
      });
    }
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.GOOGLE_DISCONNECTED, entityType: 'GOOGLE_CONNECTION' });
    return { status: 'disconnected' };
  }

  private async refreshAccessToken(userId: string, connection: GoogleConnection): Promise<string> {
    if (!connection.encryptedRefreshToken) {
      await this.markError(connection.userId);
      throw new GoogleAdapterError('TOKEN_REVOKED');
    }
    let refreshToken: string;
    try { refreshToken = this.crypto.decrypt(connection.encryptedRefreshToken); } catch { await this.markError(userId); throw new GoogleAdapterError('TOKEN_REVOKED'); }
    try {
      const result = await this.tokenRequest({ client_id: this.config.getOrThrow<string>('google.clientId'), client_secret: this.config.getOrThrow<string>('google.clientSecret'), grant_type: 'refresh_token', refresh_token: refreshToken });
      const payload = result.payload as TokenResponse & { error?: string };
      const response = result.response;
      if (!response.ok || !payload.access_token) {
        await this.markError(userId);
        throw new GoogleAdapterError(payload.error === 'invalid_grant' ? 'TOKEN_REVOKED' : 'UNAVAILABLE', response.status);
      }
      await this.prisma.googleConnection.update({ where: { userId }, data: { encryptedAccessToken: this.crypto.encrypt(payload.access_token), accessTokenExpiresAt: this.expiry(payload.expires_in), status: GoogleConnectionStatus.CONNECTED, lastUsedAt: new Date() } });
      return payload.access_token;
    } catch (error) {
      if (error instanceof GoogleAdapterError) throw error;
      await this.markError(userId);
      throw new GoogleAdapterError('UNAVAILABLE');
    }
  }

  private async exchangeCode(code: string): Promise<TokenResponse> {
    const result = await this.tokenRequest({ code, client_id: this.config.getOrThrow<string>('google.clientId'), client_secret: this.config.getOrThrow<string>('google.clientSecret'), redirect_uri: this.config.getOrThrow<string>('google.redirectUri'), grant_type: 'authorization_code' });
    const response = result.response;
    const payload = result.payload as TokenResponse;
    if (!response.ok || !payload.access_token) throw new GoogleAdapterError('UNAVAILABLE', response.status);
    return payload;
  }

  private async tokenRequest(body: Record<string, string>): Promise<{ response: Response; payload: unknown }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString(),
        });
        const payload = await response.json() as unknown;
        if (isRetryableGoogleStatus(response.status) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs(attempt)));
          continue;
        }
        return { response, payload };
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs(attempt)));
          continue;
        }
        throw new GoogleAdapterError('UNAVAILABLE');
      }
    }
    throw new GoogleAdapterError('UNAVAILABLE');
  }

  private signState(payload: OAuthState): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${createHmac('sha256', this.stateSecret()).update(encoded).digest('base64url')}`;
  }

  private verifyState(value: string | undefined): OAuthState {
    try {
      if (!value) throw new Error('missing');
      const [encoded, signature] = value.split('.');
      const expected = createHmac('sha256', this.stateSecret()).update(encoded).digest('base64url');
      if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('signature');
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthState;
      if (!payload.userId || !payload.nonce || payload.expiresAt < Date.now() || this.usedStates.has(payload.nonce)) throw new Error('expired');
      this.usedStates.set(payload.nonce, payload.expiresAt);
      return payload;
    } catch {
      throw new GoogleAdapterError('INVALID_STATE');
    }
  }

  private stateSecret(): string {
    return `${this.config.getOrThrow<string>('google.clientSecret')}:${this.config.getOrThrow<string>('jwt.accessSecret')}`;
  }

  private purgeStates(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.usedStates) if (expiresAt < now) this.usedStates.delete(nonce);
  }

  private expiry(expiresIn?: number): Date {
    return new Date(Date.now() + (expiresIn ?? 3600) * 1000);
  }

  private touch(id: string): Promise<unknown> {
    return this.prisma.googleConnection.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  private markError(userId: string): Promise<unknown> {
    return this.prisma.googleConnection.update({ where: { userId }, data: { status: GoogleConnectionStatus.ERROR } });
  }

  private isConfigured(): boolean {
    return this.config.get<boolean>('google.configured', false);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) throw new GoogleAdapterError('NOT_CONFIGURED');
  }
}
