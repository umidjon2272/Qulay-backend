import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramAuthMode, InstagramConnection } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramCryptoService } from './instagram-crypto.service';
import { buildPrivateReplyRequest, parseInstagramJson } from './instagram-api-helpers';
import { InstagramMediaComment, parseInstagramMediaComments } from './instagram-comment-parser';
import { InstagramConversationMessage, parseInstagramConversationMessages } from './instagram-dm-parser';

export type InstagramProfile = {
  id: string;
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
};

export type InstagramMedia = {
  id: string;
  caption: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
};

export type InstagramConversation = {
  id: string;
  updatedTime: string | null;
};



type GraphErrorBody = { error?: { message?: string; code?: number; error_subcode?: number; type?: string } };

type GraphOptions = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown };

@Injectable()
export class InstagramGraphService {
  private readonly tokenRefreshes = new Map<string, Promise<InstagramConnection>>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: InstagramCryptoService,
  ) {}

  configured(): boolean {
    return this.config.get<boolean>('instagram.configured') === true;
  }

  oauthReady(): boolean {
    return this.config.get<boolean>('instagram.oauthReady') === true;
  }

  graphVersion(): string {
    return this.config.get<string>('instagram.graphApiVersion', 'v24.0');
  }

  webhookVerifyToken(): string | undefined {
    return this.config.get<string>('instagram.webhookVerifyToken');
  }

  appSecret(): string | undefined {
    return this.config.get<string>('instagram.appSecret');
  }

  appId(): string | undefined {
    return this.config.get<string>('instagram.appId');
  }

  async verifyProfile(accessToken: string, instagramUserId: string, authMode: InstagramAuthMode = InstagramAuthMode.FACEBOOK_LOGIN): Promise<InstagramProfile> {
    const cleanId = instagramUserId.trim();
    if (!/^\d{5,40}$/.test(cleanId)) throw new BadRequestException('Instagram User ID noto‘g‘ri');

    if (authMode === InstagramAuthMode.INSTAGRAM_LOGIN) {
      // Instagram Login exposes the professional account id as `user_id`. Keep
      // the token-exchange id as the canonical fallback and fetch only fields
      // guaranteed by the basic business scope first; richer profile fields
      // are best-effort because Meta rolls them out independently.
      const basic = await this.graphJson<{ id?: string; user_id?: string | number; username?: string }>(
        '/me?fields=user_id,username',
        accessToken,
        undefined,
        authMode,
      );
      const resolvedId = String(basic.user_id ?? cleanId);
      if (!/^\d{5,40}$/.test(resolvedId)) throw new ServiceUnavailableException('Instagram akkauntini tekshirib bo‘lmadi');

      let rich: { username?: string; name?: string; profile_picture_url?: string } = {};
      try {
        rich = await this.graphJson<{ username?: string; name?: string; profile_picture_url?: string }>(
          `/${encodeURIComponent(cleanId)}?fields=username,name,profile_picture_url`,
          accessToken,
          undefined,
          authMode,
        );
      } catch {
        // Basic identity already verified; optional display metadata must not
        // make a valid connection fail.
      }

      return {
        id: resolvedId,
        username: rich.username?.trim() || basic.username?.trim() || null,
        name: rich.name?.trim() || null,
        profilePictureUrl: rich.profile_picture_url?.trim() || null,
      };
    }

    const data = await this.graphJson<{ id?: string; username?: string; name?: string; profile_picture_url?: string }>(
      `/${encodeURIComponent(cleanId)}?fields=id,username,name,profile_picture_url`,
      accessToken,
      undefined,
      authMode,
    );
    const resolvedId = String(data.id ?? '');
    if (!/^\d{5,40}$/.test(resolvedId)) throw new ServiceUnavailableException('Instagram akkauntini tekshirib bo‘lmadi');
    return {
      id: resolvedId,
      username: data.username?.trim() || null,
      name: data.name?.trim() || null,
      profilePictureUrl: data.profile_picture_url?.trim() || null,
    };
  }

  async subscribeWebhooks(accessToken: string, instagramUserId: string, authMode: InstagramAuthMode = InstagramAuthMode.FACEBOOK_LOGIN): Promise<boolean> {
    const cleanId = instagramUserId.trim();
    const attempts = [
      'messages,messaging_postbacks,message_reactions,comments,mentions',
      'messages,messaging_postbacks,comments',
      'messages,comments',
    ];
    let lastError: unknown;
    for (const fields of attempts) {
      try {
        const result = await this.graphJson<{ success?: boolean }>(
          `/${encodeURIComponent(cleanId)}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`,
          accessToken,
          { method: 'POST' },
          authMode,
        );
        if (result.success === true) return true;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return false;
  }

  async listMedia(userId: string, limit = 25): Promise<InstagramMedia[]> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    const take = Math.max(1, Math.min(50, limit));
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const data = await this.graphJson<{ data?: Array<Record<string, unknown>> }>(
      `/${encodeURIComponent(connection.instagramUserId)}/media?fields=${fields}&limit=${take}`,
      token,
      undefined,
      connection.authMode,
    );
    await this.touch(userId);
    return (data.data ?? []).slice(0, take).map(item => ({
      id: String(item.id ?? ''),
      caption: typeof item.caption === 'string' ? item.caption : null,
      mediaType: typeof item.media_type === 'string' ? item.media_type : null,
      mediaUrl: typeof item.media_url === 'string' ? item.media_url : null,
      thumbnailUrl: typeof item.thumbnail_url === 'string' ? item.thumbnail_url : null,
      permalink: typeof item.permalink === 'string' ? item.permalink : null,
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : null,
    })).filter(item => item.id);
  }

  async listMediaComments(userId: string, mediaId: string, limit = 100): Promise<InstagramMediaComment[]> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    const take = Math.max(1, Math.min(500, limit));
    const pageSize = Math.min(100, take);
    const fields = 'id,text,username,timestamp,from,user';
    const rows: Array<Record<string, unknown>> = [];
    let after: string | undefined;
    for (let page = 0; page < 5 && rows.length < take; page += 1) {
      const cursor = after ? `&after=${encodeURIComponent(after)}` : '';
      const data = await this.graphJson<{
        data?: Array<Record<string, unknown>>;
        paging?: { cursors?: { after?: string }; next?: string };
      }>(
        `/${encodeURIComponent(mediaId)}/comments?fields=${fields}&limit=${Math.min(pageSize, take - rows.length)}${cursor}`,
        token,
        undefined,
        connection.authMode,
      );
      rows.push(...(data.data ?? []));
      const nextAfter = data.paging?.cursors?.after?.trim();
      if (!data.paging?.next || !nextAfter || nextAfter === after) break;
      after = nextAfter;
    }
    await this.touch(userId);
    return parseInstagramMediaComments(mediaId, rows.slice(0, take));
  }

  async listConversations(userId: string, limit = 50): Promise<InstagramConversation[]> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    const take = Math.max(1, Math.min(50, limit));
    const platform = connection.authMode === InstagramAuthMode.FACEBOOK_LOGIN ? '&platform=instagram' : '';
    const data = await this.graphJson<{ data?: Array<Record<string, unknown>> }>(
      `/${encodeURIComponent(connection.instagramUserId)}/conversations?fields=id,updated_time&limit=${take}${platform}`,
      token,
      undefined,
      connection.authMode,
    );
    await this.touch(userId);
    return (data.data ?? []).map(item => ({
      id: String(item.id ?? '').trim(),
      updatedTime: typeof item.updated_time === 'string' ? item.updated_time : null,
    })).filter(item => item.id);
  }

  async listConversationMessages(userId: string, conversationId: string): Promise<InstagramConversationMessage[]> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    const fields = encodeURIComponent('messages.limit(20){id,created_time,from,to,message}');
    const data = await this.graphJson<{ messages?: { data?: Array<Record<string, unknown>> } }>(
      `/${encodeURIComponent(conversationId)}?fields=${fields}`,
      token,
      undefined,
      connection.authMode,
    );
    const rows = data.messages?.data ?? [];
    const parsed = parseInstagramConversationMessages(rows);
    const parsedById = new Map(parsed.map(item => [item.id, item]));

    // Meta can return only message ids from the conversation edge. Image-only
    // messages may also need a detail request to expose attachment metadata.
    // Resolve only incomplete/image-only rows; keep the normal text path cheap.
    const detailIds = rows
      .map(item => String(item.id ?? item.message_id ?? '').trim())
      .filter(id => {
        if (!id) return false;
        const row = parsedById.get(id);
        return !row || (!row.text && row.imageUrls.length === 0);
      });
    if (detailIds.length) {
      const details = await Promise.all(detailIds.map(async messageId => {
        const path = `/${encodeURIComponent(messageId)}?fields=id,created_time,from,to,message,attachments`;
        try {
          return await this.graphJson<Record<string, unknown>>(path, token, undefined, connection.authMode);
        } catch {
          try {
            return await this.graphJson<Record<string, unknown>>(
              `/${encodeURIComponent(messageId)}?fields=id,created_time,from,to,message`,
              token,
              undefined,
              connection.authMode,
            );
          } catch {
            return null;
          }
        }
      }));
      for (const row of parseInstagramConversationMessages(details.filter((item): item is Record<string, unknown> => Boolean(item)))) {
        parsedById.set(row.id, row);
      }
    }
    const resolved = [...parsedById.values()];
    await this.touch(userId);
    return resolved;
  }

  async getMedia(userId: string, mediaId: string): Promise<InstagramMedia | null> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    try {
      const item = await this.graphJson<Record<string, unknown>>(
        `/${encodeURIComponent(mediaId)}/?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp`,
        token,
        undefined,
        connection.authMode,
      );
      await this.touch(userId);
      if (!item.id) return null;
      return {
        id: String(item.id),
        caption: typeof item.caption === 'string' ? item.caption : null,
        mediaType: typeof item.media_type === 'string' ? item.media_type : null,
        mediaUrl: typeof item.media_url === 'string' ? item.media_url : null,
        thumbnailUrl: typeof item.thumbnail_url === 'string' ? item.thumbnail_url : null,
        permalink: typeof item.permalink === 'string' ? item.permalink : null,
        timestamp: typeof item.timestamp === 'string' ? item.timestamp : null,
      };
    } catch {
      return null;
    }
  }

  async sendText(userId: string, recipientId: string, text: string): Promise<string | null> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    const body = await this.graphJson<{ message_id?: string; recipient_id?: string }>(
      `/${encodeURIComponent(connection.instagramUserId)}/messages`,
      token,
      { method: 'POST', body: { recipient: { id: recipientId }, message: { text: text.slice(0, 1000) } } },
      connection.authMode,
    );
    await this.touch(userId);
    return body.message_id ?? null;
  }

  async privateReplyToComment(userId: string, commentId: string, message: string): Promise<string | null> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    const request = buildPrivateReplyRequest(connection.authMode, connection.instagramUserId, commentId, message.slice(0, 1000));
    const body = await this.graphJson<{ id?: string; message_id?: string }>(
      request.path,
      token,
      { method: 'POST', body: request.body },
      connection.authMode,
    );
    await this.touch(userId);
    return body.id ?? body.message_id ?? null;
  }

  async replyToComment(userId: string, commentId: string, message: string): Promise<string | null> {
    const connection = await this.connectionForUser(userId);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    const body = await this.graphJson<{ id?: string }>(
      `/${encodeURIComponent(commentId)}/replies`,
      token,
      { method: 'POST', body: { message: message.slice(0, 1000) } },
      connection.authMode,
    );
    await this.touch(userId);
    return body.id ?? null;
  }

  async downloadAttachment(url: string, maxBytes = 8 * 1024 * 1024): Promise<{ buffer: Buffer; mimeType: string }> {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new BadRequestException('Instagram rasm manzili noto‘g‘ri'); }
    if (parsed.protocol !== 'https:') throw new BadRequestException('Instagram rasm manzili xavfsiz emas');
    const response = await fetch(parsed.toString(), { signal: AbortSignal.timeout(20_000), redirect: 'follow' }).catch(() => {
      throw new ServiceUnavailableException('Instagram rasmini yuklab bo‘lmadi');
    });
    if (!response.ok) throw new ServiceUnavailableException('Instagram rasmini yuklab bo‘lmadi');
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) throw new BadRequestException('Instagram rasmi juda katta');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) throw new BadRequestException('Instagram rasmi bo‘sh yoki juda katta');
    const mimeType = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
    return { buffer, mimeType };
  }

  async testConnection(userId: string): Promise<InstagramProfile> {
    const connection = await this.connectionForUser(userId, true);
    const token = this.crypto.decrypt(connection.encryptedAccessToken);
    try {
      const profile = await this.verifyProfile(token, connection.instagramUserId, connection.authMode);
      let webhookSubscribed = connection.webhookSubscribed;
      let status: 'CONNECTED' | 'DEGRADED' = 'CONNECTED';
      let lastErrorCode: string | null = null;
      try { webhookSubscribed = await this.subscribeWebhooks(token, connection.instagramUserId, connection.authMode); }
      catch (error) { status = 'DEGRADED'; webhookSubscribed = false; lastErrorCode = this.errorCode(error); }
      await this.prisma.instagramConnection.update({
        where: { userId },
        data: {
          username: profile.username,
          displayName: profile.name,
          profilePictureUrl: profile.profilePictureUrl,
          status,
          webhookSubscribed,
          lastValidatedAt: new Date(),
          lastErrorCode,
          lastErrorAt: lastErrorCode ? new Date() : null,
        },
      });
      return profile;
    } catch (error) {
      await this.prisma.instagramConnection.update({
        where: { userId },
        data: { status: this.isAuthFailure(error) ? 'ERROR' : 'DEGRADED', lastErrorAt: new Date(), lastErrorCode: this.errorCode(error) },
      }).catch(() => undefined);
      throw error;
    }
  }

  safeId(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 10);
  }

  private async connectionForUser(userId: string, includeError = false): Promise<InstagramConnection> {
    let connection = await this.prisma.instagramConnection.findUnique({ where: { userId } });
    if (!connection?.encryptedAccessToken || (!includeError && !['CONNECTED', 'DEGRADED'].includes(connection.status))) {
      throw new ServiceUnavailableException('Instagram ulanmagan');
    }
    if (connection.authMode === InstagramAuthMode.INSTAGRAM_LOGIN && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= Date.now()) {
      const error = new UnauthorizedException({ code: 'INSTAGRAM_ACCESS_TOKEN_INVALID', message: 'Instagram Access Token yaroqsiz yoki muddati tugagan' });
      await this.prisma.instagramConnection.update({
        where: { userId },
        data: { status: 'ERROR', lastErrorAt: new Date(), lastErrorCode: 'INSTAGRAM_ACCESS_TOKEN_INVALID' },
      }).catch(() => undefined);
      throw error;
    }
    if (this.shouldRefreshToken(connection)) {
      try { connection = await this.refreshConnectionToken(connection); }
      catch (error) {
        if (this.errorCode(error) === 'INSTAGRAM_ACCESS_TOKEN_INVALID') {
          await this.prisma.instagramConnection.update({
            where: { userId },
            data: { status: 'ERROR', lastErrorAt: new Date(), lastErrorCode: 'INSTAGRAM_ACCESS_TOKEN_INVALID' },
          }).catch(() => undefined);
          throw error;
        }
        // Keep the still-valid token on a temporary refresh failure; the
        // actual Graph call will determine whether it remains usable.
      }
    }
    return connection;
  }

  private shouldRefreshToken(connection: InstagramConnection): boolean {
    if (connection.authMode !== InstagramAuthMode.INSTAGRAM_LOGIN || !connection.tokenExpiresAt) return false;
    const expiresAt = connection.tokenExpiresAt.getTime();
    const now = Date.now();
    return expiresAt > now && expiresAt <= now + 7 * 24 * 60 * 60_000;
  }

  private async refreshConnectionToken(connection: InstagramConnection): Promise<InstagramConnection> {
    const existing = this.tokenRefreshes.get(connection.userId);
    if (existing) return existing;
    const task = this.performTokenRefresh(connection).finally(() => {
      if (this.tokenRefreshes.get(connection.userId) === task) this.tokenRefreshes.delete(connection.userId);
    });
    this.tokenRefreshes.set(connection.userId, task);
    return task;
  }

  private async performTokenRefresh(connection: InstagramConnection): Promise<InstagramConnection> {
    const currentToken = this.crypto.decrypt(connection.encryptedAccessToken);
    const base = this.config.get<string>('instagram.loginGraphBaseUrl', 'https://graph.instagram.com').replace(/\/$/u, '');
    const url = new URL(`${base}/refresh_access_token`);
    url.searchParams.set('grant_type', 'ig_refresh_token');
    url.searchParams.set('access_token', currentToken);
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) }).catch(() => {
      throw new ServiceUnavailableException({ code: 'INSTAGRAM_TOKEN_REFRESH_UNAVAILABLE', message: 'Instagram tokenini yangilab bo‘lmadi' });
    });
    const rawBody = await response.text().catch(() => '');
    let body: { access_token?: string; token_type?: string; expires_in?: number } & GraphErrorBody;
    try { body = rawBody ? parseInstagramJson<typeof body>(rawBody) : {}; }
    catch { body = {}; }
    if (!response.ok || !body.access_token) {
      const code = body.error?.code;
      if (code === 190 || response.status === 401) {
        throw new UnauthorizedException({ code: 'INSTAGRAM_ACCESS_TOKEN_INVALID', message: 'Instagram Access Token yaroqsiz yoki muddati tugagan' });
      }
      throw new ServiceUnavailableException({ code: 'INSTAGRAM_TOKEN_REFRESH_FAILED', message: 'Instagram tokenini yangilab bo‘lmadi' });
    }
    const refreshedAt = new Date();
    const expiresIn = typeof body.expires_in === 'number' && Number.isFinite(body.expires_in) && body.expires_in > 0 ? body.expires_in : 60 * 24 * 60 * 60;
    const tokenExpiresAt = new Date(refreshedAt.getTime() + expiresIn * 1000);
    const encryptedAccessToken = this.crypto.encrypt(body.access_token);
    await this.prisma.instagramConnection.update({
      where: { userId: connection.userId },
      data: { encryptedAccessToken, tokenExpiresAt, tokenRefreshedAt: refreshedAt },
    });
    return { ...connection, encryptedAccessToken, tokenExpiresAt, tokenRefreshedAt: refreshedAt };
  }

  private async touch(userId: string): Promise<void> {
    await this.prisma.instagramConnection.update({ where: { userId }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }

  private async graphJson<T>(path: string, accessToken: string, options?: GraphOptions, authMode: InstagramAuthMode = InstagramAuthMode.FACEBOOK_LOGIN): Promise<T> {
    const base = authMode === InstagramAuthMode.INSTAGRAM_LOGIN
      ? this.config.get<string>('instagram.loginGraphBaseUrl', 'https://graph.instagram.com').replace(/\/$/u, '')
      : this.config.get<string>('instagram.graphBaseUrl', 'https://graph.facebook.com').replace(/\/$/u, '');
    const response = await fetch(`${base}/${this.graphVersion()}${path}`, {
      method: options?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new ServiceUnavailableException({ code: 'INSTAGRAM_GRAPH_UNAVAILABLE', message: 'Instagram API bilan vaqtinchalik ulanib bo‘lmadi' });
    });
    const rawBody = await response.text().catch(() => '');
    let body: T & GraphErrorBody;
    try { body = rawBody ? parseInstagramJson<T & GraphErrorBody>(rawBody) : {} as T & GraphErrorBody; }
    catch { body = {} as T & GraphErrorBody; }
    if (!response.ok) {
      const code = body.error?.code;
      if (code === 190 || response.status === 401) throw new UnauthorizedException({ code: 'INSTAGRAM_ACCESS_TOKEN_INVALID', message: 'Instagram Access Token yaroqsiz yoki muddati tugagan' });
      if (code === 10 || code === 200 || response.status === 403) throw new ForbiddenException({ code: 'INSTAGRAM_PERMISSION_REQUIRED', message: 'Instagram tokenida kerakli ruxsatlar yetarli emas' });
      if (code === 100 || response.status === 400 || response.status === 404) throw new BadRequestException({ code: 'INSTAGRAM_ACCOUNT_OR_OBJECT_INVALID', message: 'Instagram akkaunti, post yoki comment ID noto‘g‘ri' });
      throw new ServiceUnavailableException({ code: `INSTAGRAM_GRAPH_${code ?? response.status}`, message: 'Instagram API so‘rovi vaqtinchalik bajarilmadi' });
    }
    return body as T;
  }

  private isAuthFailure(error: unknown): boolean {
    const code = this.errorCode(error);
    return code === 'INSTAGRAM_ACCESS_TOKEN_INVALID' || code === 'INSTAGRAM_PERMISSION_REQUIRED';
  }

  errorCode(error: unknown): string {
    if (error && typeof error === 'object') {
      const candidate = error as { getResponse?: () => unknown; message?: unknown };
      const response = typeof candidate.getResponse === 'function' ? candidate.getResponse() : null;
      if (response && typeof response === 'object' && 'code' in response && typeof (response as { code?: unknown }).code === 'string') return (response as { code: string }).code;
      if (typeof candidate.message === 'string') return candidate.message.match(/[A-Z][A-Z0-9_]{3,}/u)?.[0] ?? 'FAILED';
    }
    return 'FAILED';
  }
}
