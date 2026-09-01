import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'teleproto';
import { getPeerId } from 'teleproto/Utils';
import { returnBigInt } from 'teleproto/Helpers';
import { StringSession } from 'teleproto/sessions';
import { createHash, randomUUID } from 'node:crypto';
import { classifyTelegramError, TelegramAdapterError } from './telegram.errors';

export type TelegramAccount = { telegramUserId: string; username: string | null; displayName: string | null; phoneNumber: string | null };
export type TelegramPeer = { peerId: string; type: 'USER' | 'GROUP' | 'CHANNEL'; displayName: string; username: string | null; lastActivity: string | null };
export type TelegramPendingLogin = { encryptedSessionSource: string; phoneCodeHash: string };

/** Normalized delivery channel derived from Telegram's real `auth.SentCodeType`/`auth.CodeType` constructor. */
export type TelegramDeliveryType = 'telegram_app' | 'sms' | 'call' | 'email' | 'fragment' | 'firebase_sms' | 'unknown';

export type TelegramSentCodeMeta = {
  delivery: TelegramDeliveryType;
  nextDelivery: TelegramDeliveryType | null;
  timeoutSeconds: number | null;
  /** Raw teleproto/MTProto constructor name (e.g. "auth.SentCodeTypeApp") for safe, non-PII logging. */
  rawType: string;
  rawNextType: string | null;
};

export type TelegramSentCode = { session: string; phoneCodeHash: string } & TelegramSentCodeMeta;

export abstract class TelegramClientService {
  abstract beginLogin(phoneNumber: string, userScopeId?: string): Promise<TelegramSentCode>;
  abstract resendCode(input: { session: string; phoneNumber: string; phoneCodeHash: string }): Promise<TelegramSentCode>;
  abstract verifyCode(input: { session: string; phoneNumber: string; phoneCodeHash: string; code: string }): Promise<{ status: 'connected' | 'password_required'; session: string; account?: TelegramAccount }>;
  abstract verifyPassword(input: { session: string; password: string }): Promise<{ session: string; account: TelegramAccount }>;
  abstract validateSession(session: string): Promise<TelegramAccount>;
  abstract logout(session: string): Promise<void>;
  abstract search(session: string, query: string, limit: number): Promise<TelegramPeer[]>;
  abstract chats(session: string, search: string | undefined, limit: number): Promise<TelegramPeer[]>;
  abstract resolvePeer(session: string, peerId: string): Promise<TelegramPeer>;
  abstract sendMessage(session: string, peerId: string, text: string): Promise<{ messageId: string; recipient: TelegramPeer }>;
}

@Injectable()
export class TeleprotoTelegramClientService extends TelegramClientService {
  private readonly logger = new Logger(TeleprotoTelegramClientService.name);
  private readonly peerEntityCache = new Map<string, { entity: Api.TypeUser | Api.TypeChat; peer: TelegramPeer; expiresAt: number }>();
  private readonly apiId: number | undefined;
  private readonly apiHash: string | undefined;

  constructor(config: ConfigService) {
    super();
    this.apiId = config.get<number>('telegram.apiId');
    this.apiHash = config.get<string>('telegram.apiHash');
  }

  async beginLogin(phoneNumber: string, userScopeId = 'unscoped'): Promise<TelegramSentCode> {
    const normalizedPhone = this.normalizeLoginPhone(phoneNumber);
    const clientInstanceId = randomUUID();
    const client = this.client('');
    const sessionEmptyBeforeSendCode = !this.savedSession(client);
    let connected = false;
    try {
      await client.connect();
      connected = true;
      const isUserAuthorized = await client.checkAuthorization();
      this.logSendCodeState('telegram_send_code_started', client, clientInstanceId, userScopeId, isUserAuthorized, sessionEmptyBeforeSendCode);
      if (isUserAuthorized) throw new TelegramAdapterError('ALREADY_AUTHORIZED', undefined, undefined, undefined, true, true);
      const sentCode = await this.requestSentCode(client, normalizedPhone);
      this.logger.log({
        event: 'telegram_send_code_completed', clientInstanceId, userScopeId, isUserAuthorized,
        sessionEmptyBeforeSendCode, selectedDcId: client.session.dcId || null,
        returnedType: sentCode.type?.className ?? 'unknown', nextType: sentCode.nextType?.className ?? null,
        timeoutSeconds: sentCode.timeout ?? null,
      });
      return { session: this.savedSession(client), ...this.describeSentCode(sentCode) };
    } catch (error) {
      throw this.withAuthContext(error, connected, Boolean(this.savedSession(client)));
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  private logSendCodeState(event: string, client: TelegramClient, clientInstanceId: string, userScopeId: string, isUserAuthorized: boolean, sessionEmptyBeforeSendCode: boolean): void {
    this.logger.log({ event, clientInstanceId, userScopeId, isUserAuthorized, sessionEmptyBeforeSendCode, selectedDcId: client.session.dcId || null, clientConnected: true });
  }

  private normalizeLoginPhone(phoneNumber: string): string {
    const normalized = phoneNumber.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new TelegramAdapterError('INVALID_PHONE');
    return normalized;
  }

  async resendCode(input: { session: string; phoneNumber: string; phoneCodeHash: string }): Promise<TelegramSentCode> {
    const client = this.client(input.session);
    let connected = false;
    try {
      await client.connect();
      connected = true;
      const result = await client.invoke(new Api.auth.ResendCode({ phoneNumber: input.phoneNumber, phoneCodeHash: input.phoneCodeHash }));
      if (!(result instanceof Api.auth.SentCode)) throw new TelegramAdapterError('UNAVAILABLE');
      return { session: this.savedSession(client), ...this.describeSentCode(result) };
    } catch (error) {
      throw this.withAuthContext(error, connected, Boolean(input.session));
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  /** Raw `auth.SendCode` invocation (bypasses the high-level `sendCode()` helper, which discards delivery metadata). */
  private async requestSentCode(client: TelegramClient, phoneNumber: string, authRestartAttempted = false): Promise<Api.auth.SentCode> {
    const credentials = this.credentials();
    let result: Api.auth.TypeSentCode;
    try {
      result = await client.invoke(new Api.auth.SendCode({
        phoneNumber,
        apiId: credentials.apiId,
        apiHash: credentials.apiHash,
        settings: new Api.CodeSettings({}),
      }));
    } catch (error) {
      if ((error as { errorMessage?: string }).errorMessage === 'AUTH_RESTART' && !authRestartAttempted) return this.requestSentCode(client, phoneNumber, true);
      throw error;
    }
    if (!(result instanceof Api.auth.SentCode)) throw new TelegramAdapterError('UNAVAILABLE');
    return result;
  }

  private describeSentCode(sentCode: Api.auth.SentCode): { phoneCodeHash: string } & TelegramSentCodeMeta {
    return {
      phoneCodeHash: sentCode.phoneCodeHash,
      delivery: this.mapDeliveryType(sentCode.type),
      nextDelivery: sentCode.nextType ? this.mapNextDeliveryType(sentCode.nextType) : null,
      timeoutSeconds: sentCode.timeout ?? null,
      rawType: sentCode.type?.className ?? 'unknown',
      rawNextType: sentCode.nextType?.className ?? null,
    };
  }

  private mapDeliveryType(type: Api.auth.TypeSentCodeType): TelegramDeliveryType {
    if (type instanceof Api.auth.SentCodeTypeApp) return 'telegram_app';
    if (type instanceof Api.auth.SentCodeTypeSms || type instanceof Api.auth.SentCodeTypeSmsWord || type instanceof Api.auth.SentCodeTypeSmsPhrase) return 'sms';
    if (type instanceof Api.auth.SentCodeTypeCall || type instanceof Api.auth.SentCodeTypeFlashCall || type instanceof Api.auth.SentCodeTypeMissedCall) return 'call';
    if (type instanceof Api.auth.SentCodeTypeFragmentSms) return 'fragment';
    if (type instanceof Api.auth.SentCodeTypeFirebaseSms) return 'firebase_sms';
    if (type instanceof Api.auth.SentCodeTypeEmailCode || type instanceof Api.auth.SentCodeTypeSetUpEmailRequired) return 'email';
    return 'unknown';
  }

  private mapNextDeliveryType(type: Api.auth.TypeCodeType): TelegramDeliveryType {
    if (type instanceof Api.auth.CodeTypeSms) return 'sms';
    if (type instanceof Api.auth.CodeTypeCall || type instanceof Api.auth.CodeTypeFlashCall || type instanceof Api.auth.CodeTypeMissedCall) return 'call';
    if (type instanceof Api.auth.CodeTypeFragmentSms) return 'fragment';
    return 'unknown';
  }

  async verifyCode(input: { session: string; phoneNumber: string; phoneCodeHash: string; code: string }): Promise<{ status: 'connected' | 'password_required'; session: string; account?: TelegramAccount }> {
    const client = this.client(input.session);
    let connected = false;
    try {
      await client.connect();
      connected = true;
      try {
        await client.invoke(new Api.auth.SignIn({ phoneNumber: input.phoneNumber, phoneCodeHash: input.phoneCodeHash, phoneCode: input.code }));
      } catch (error) {
        const message = `${(error as { errorMessage?: string }).errorMessage ?? ''} ${(error as Error).message ?? ''}`.toUpperCase();
        if (message.includes('SESSION_PASSWORD_NEEDED')) return { status: 'password_required', session: this.savedSession(client) };
        throw classifyTelegramError(error);
      }
      return { status: 'connected', session: this.savedSession(client), account: await this.account(client) };
    } catch (error) {
      throw this.withAuthContext(error, connected, Boolean(input.session));
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async verifyPassword(input: { session: string; password: string }): Promise<{ session: string; account: TelegramAccount }> {
    const credentials = this.credentials();
    const client = this.client(input.session);
    try {
      await client.connect();
      await client.signInWithPassword(credentials, { password: async () => input.password, onError: async () => true });
      return { session: this.savedSession(client), account: await this.account(client) };
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async logout(session: string): Promise<void> {
    const client = this.client(session);
    try {
      await client.connect();
      await client.logOut();
    } catch (error) {
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async validateSession(session: string): Promise<TelegramAccount> {
    const client = this.client(session);
    try {
      await client.connect();
      return await this.account(client);
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async search(session: string, query: string, limit: number): Promise<TelegramPeer[]> {
    const client = this.client(session);
    const normalized = this.normalizeQuery(query);
    if (!normalized) return [];
    try {
      await client.connect();
      await client.getMe();

      const candidates: TelegramPeer[] = [];
      const dialogs = await client.getDialogs({ limit: Math.min(100, Math.max(20, limit * 4)) });
      for (const dialog of dialogs) {
        if (!dialog.entity) continue;
        const entity = dialog.entity as Api.TypeUser | Api.TypeChat;
        const peer = this.toPeer(dialog);
        candidates.push(peer);
        this.rememberPeerEntity(session, entity, peer);
      }

      const contacts = await client.invoke(new Api.contacts.GetContacts({ hash: returnBigInt(0) }));
      if ('users' in contacts) {
        for (const entity of contacts.users) {
          const peer = this.entityToPeer(entity);
          candidates.push(peer);
          this.rememberPeerEntity(session, entity, peer);
        }
      }

      if (this.isUsernameLike(normalized)) {
        try {
          const resolved = await client.invoke(new Api.contacts.ResolveUsername({ username: normalized }));
          for (const entity of [...resolved.users, ...resolved.chats]) {
            const peer = this.entityToPeer(entity);
            candidates.push(peer);
            this.rememberPeerEntity(session, entity, peer);
          }
        } catch (error) {
          const classified = classifyTelegramError(error);
          if (classified.code !== 'PEER_NOT_FOUND') throw classified;
        }
        const global = await client.invoke(new Api.contacts.Search({ q: normalized, limit }));
        for (const entity of [...global.users, ...global.chats]) {
          const peer = this.entityToPeer(entity);
          candidates.push(peer);
          this.rememberPeerEntity(session, entity, peer);
        }
      }

      return this.rankAndDeduplicate(candidates, normalized).slice(0, limit);
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async chats(session: string, search: string | undefined, limit: number): Promise<TelegramPeer[]> {
    const peers = await this.listPeers(session, Math.min(100, Math.max(limit, search ? 50 : limit)));
    if (!search) return peers.slice(0, limit);
    const normalized = search.toLocaleLowerCase();
    return peers.filter((peer) => `${peer.displayName} ${peer.username ?? ''}`.toLocaleLowerCase().includes(normalized)).slice(0, limit);
  }

  async resolvePeer(session: string, peerId: string): Promise<TelegramPeer> {
    const client = this.client(session);
    try {
      await client.connect();
      const resolved = await this.findPeerEntity(client, session, peerId);
      if (!resolved) throw new TelegramAdapterError('PEER_NOT_FOUND');
      return resolved.peer;
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async sendMessage(session: string, peerId: string, text: string): Promise<{ messageId: string; recipient: TelegramPeer }> {
    const client = this.client(session);
    try {
      await client.connect();
      const resolved = await this.findPeerEntity(client, session, peerId);
      if (!resolved) throw new TelegramAdapterError('PEER_NOT_FOUND');
      const message = await client.sendMessage(resolved.entity, { message: text });
      return { messageId: String(message.id), recipient: resolved.peer };
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      const classified = classifyTelegramError(error);
      throw classified.code === 'UNAVAILABLE' ? new TelegramAdapterError('SEND_FAILED') : classified;
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }


  private async findPeerEntity(client: TelegramClient, session: string, peerId: string): Promise<{ entity: Api.TypeUser | Api.TypeChat; peer: TelegramPeer } | null> {
    const dialogs = await client.getDialogs({ limit: 100 });
    const dialog = dialogs.find((item) => item.entity && getPeerId(item.entity, true) === peerId);
    if (dialog?.entity) {
      const entity = dialog.entity as Api.TypeUser | Api.TypeChat;
      const peer = this.toPeer(dialog);
      this.rememberPeerEntity(session, entity, peer);
      return { entity, peer };
    }

    const contacts = await client.invoke(new Api.contacts.GetContacts({ hash: returnBigInt(0) }));
    if ('users' in contacts) {
      const entity = contacts.users.find((item) => getPeerId(item as any, true) === peerId);
      if (entity) {
        const peer = this.entityToPeer(entity);
        this.rememberPeerEntity(session, entity, peer);
        return { entity, peer };
      }
    }

    const cached = this.getRememberedPeerEntity(session, peerId);
    return cached ? { entity: cached.entity, peer: cached.peer } : null;
  }

  private rememberPeerEntity(session: string, entity: Api.TypeUser | Api.TypeChat, peer?: TelegramPeer): void {
    const normalizedPeer = peer ?? this.entityToPeer(entity);
    this.peerEntityCache.set(this.peerCacheKey(session, normalizedPeer.peerId), { entity, peer: normalizedPeer, expiresAt: Date.now() + 10 * 60_000 });
    if (this.peerEntityCache.size > 500) {
      const now = Date.now();
      for (const [key, value] of this.peerEntityCache) if (value.expiresAt <= now) this.peerEntityCache.delete(key);
      while (this.peerEntityCache.size > 500) this.peerEntityCache.delete(this.peerEntityCache.keys().next().value as string);
    }
  }

  private getRememberedPeerEntity(session: string, peerId: string): { entity: Api.TypeUser | Api.TypeChat; peer: TelegramPeer } | null {
    const key = this.peerCacheKey(session, peerId);
    const cached = this.peerEntityCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) { this.peerEntityCache.delete(key); return null; }
    return { entity: cached.entity, peer: cached.peer };
  }

  private peerCacheKey(session: string, peerId: string): string {
    const sessionFingerprint = createHash('sha256').update(session).digest('hex').slice(0, 16);
    return `${sessionFingerprint}:${peerId}`;
  }

  private client(session: string): TelegramClient {
    const credentials = this.credentials();
    return new TelegramClient(new StringSession(session), credentials.apiId, credentials.apiHash, {
      connectionRetries: 3, reconnectRetries: 2, floodSleepThreshold: 0, deviceModel: 'Qulay AI', appVersion: '1.0',
    });
  }

  private credentials(): { apiId: number; apiHash: string } {
    const apiId = this.apiId;
    if (apiId === undefined || !Number.isSafeInteger(apiId) || apiId <= 0 || !this.apiHash) {
      throw new TelegramAdapterError('NOT_CONFIGURED');
    }
    return { apiId, apiHash: this.apiHash };
  }

  private savedSession(client: TelegramClient): string {
    return (client.session as StringSession).save();
  }

  private withAuthContext(error: unknown, clientConnected: boolean, authSessionExists: boolean): TelegramAdapterError {
    const classified = classifyTelegramError(error);
    return new TelegramAdapterError(classified.code, classified.retryAfterSeconds, classified.rpcErrorMessage, classified.rpcCode, clientConnected, authSessionExists);
  }

  private async account(client: TelegramClient): Promise<TelegramAccount> {
    const user = await client.getMe();
    return {
      telegramUserId: String(user.id), username: user.username ?? null,
      displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
      phoneNumber: user.phone ?? null,
    };
  }

  private async listPeers(session: string, limit: number): Promise<TelegramPeer[]> {
    const client = this.client(session);
    try {
      await client.connect();
      const dialogs = await client.getDialogs({ limit });
      return dialogs.filter((dialog) => Boolean(dialog.entity)).map((dialog) => this.toPeer(dialog));
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  private toPeer(dialog: { entity?: unknown; isUser: boolean; isChannel: boolean; title?: string; name?: string; date?: number }): TelegramPeer {
    const entity = dialog.entity as { username?: string; firstName?: string; lastName?: string };
    return {
      peerId: getPeerId(dialog.entity as any, true),
      type: dialog.isUser ? 'USER' : dialog.isChannel ? 'CHANNEL' : 'GROUP',
      displayName: dialog.title ?? dialog.name ?? ([entity.firstName, entity.lastName].filter(Boolean).join(' ') || 'Telegram chat'),
      username: entity.username ? `@${entity.username}` : null,
      lastActivity: dialog.date ? new Date(dialog.date * 1000).toISOString() : null,
    };
  }

  private entityToPeer(entity: Api.TypeUser | Api.TypeChat): TelegramPeer {
    const value = entity as unknown as { firstName?: string; lastName?: string; title?: string; username?: string; className?: string };
    const className = value.className ?? '';
    const type: TelegramPeer['type'] = className.includes('User') ? 'USER' : className.includes('Channel') ? 'CHANNEL' : 'GROUP';
    return {
      peerId: getPeerId(entity as any, true),
      type,
      displayName: value.title ?? ([value.firstName, value.lastName].filter(Boolean).join(' ') || 'Telegram chat'),
      username: value.username ? `@${value.username}` : null,
      lastActivity: null,
    };
  }

  private normalizeQuery(query: string): string {
    return query.trim().replace(/^@+/, '').normalize('NFKC').toLocaleLowerCase();
  }

  private isUsernameLike(query: string): boolean {
    return /^[a-z0-9_]{5,32}$/i.test(query);
  }

  private rankAndDeduplicate(peers: TelegramPeer[], query: string): TelegramPeer[] {
    const matches = peers.filter((peer) => {
      const name = peer.displayName.trim().normalize('NFKC').toLocaleLowerCase();
      const username = this.normalizeQuery(peer.username ?? '');
      return name.includes(query) || username.includes(query);
    });
    matches.sort((left, right) => Number(this.normalizeQuery(right.username ?? '') === query) - Number(this.normalizeQuery(left.username ?? '') === query));
    return [...new Map(matches.map((peer) => [peer.peerId, peer])).values()];
  }
}
