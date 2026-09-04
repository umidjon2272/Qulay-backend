import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'telegram';
import { getPeerId } from 'telegram/Utils';
import { returnBigInt } from 'telegram/Helpers';
import { Logger as GramJsLogger, LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { createHash, randomUUID } from 'node:crypto';
import { classifyTelegramError, TelegramAdapterError } from './telegram.errors';

export type TelegramAccount = { telegramUserId: string; username: string | null; displayName: string | null; phoneNumber: string | null };
export type TelegramPeer = { peerId: string; type: 'USER' | 'GROUP' | 'CHANNEL'; displayName: string; username: string | null; lastActivity: string | null };
export type TelegramPendingLogin = { encryptedSessionSource: string; phoneCodeHash: string };

/** Normalized delivery channel derived from Telegram's real `auth.SentCodeType`/`auth.CodeType` constructor. */
export type TelegramDeliveryType = 'telegram_app' | 'sms' | 'call' | 'email' | 'fragment' | 'firebase_sms' | 'email_setup' | 'unknown';

export type TelegramSentCodeMeta = {
  delivery: TelegramDeliveryType;
  nextDelivery: TelegramDeliveryType | null;
  timeoutSeconds: number | null;
  /** Raw GramJS/MTProto constructor name (e.g. "auth.SentCodeTypeApp") for safe, non-PII logging. */
  rawType: string;
  rawNextType: string | null;
  selectedDcId: number | null;
};

export type TelegramSentCode = { session: string; phoneCodeHash: string } & TelegramSentCodeMeta;
export type TelegramQrResult =
  | { status: 'pending'; session: string; qrUrl?: string; expiresAt?: string }
  | { status: 'connected'; session: string; account: TelegramAccount }
  | { status: 'password_required'; session: string };

export abstract class TelegramClientService {
  abstract beginLogin(phoneNumber: string, userScopeId?: string): Promise<TelegramSentCode>;
  abstract beginQrLogin(): Promise<TelegramQrResult>;
  abstract checkQrLogin(session: string): Promise<TelegramQrResult>;
  abstract pollQrLogin(session: string): Promise<TelegramQrResult>;
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
export class GramJsTelegramClientService extends TelegramClientService {
  private readonly logger = new Logger(GramJsTelegramClientService.name);
  private readonly peerEntityCache = new Map<string, { entity: Api.TypeUser | Api.TypeChat; peer: TelegramPeer; expiresAt: number }>();
  private readonly activeQrLogins = new Map<string, {
    client: TelegramClient;
    updateReceived: boolean;
    expiresAt: number;
  }>();
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
      return { session: this.savedSession(client), ...this.describeSentCode(sentCode), selectedDcId: client.session.dcId || null };
    } catch (error) {
      throw this.withAuthContext(error, connected, Boolean(this.savedSession(client)));
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async beginQrLogin(): Promise<TelegramQrResult> {
    this.cleanupExpiredQrLogins();

    const client = this.client('');
    let connected = false;
    let keepAlive = false;

    try {
      await client.connect();
      connected = true;

      if (await client.checkAuthorization()) {
        return {
          status: 'connected',
          session: this.savedSession(client),
          account: await this.account(client),
        };
      }

      const result = await this.exportQrToken(client);

      if (result instanceof Api.auth.LoginTokenSuccess) {
        return {
          status: 'connected',
          session: this.savedSession(client),
          account: await this.account(client),
        };
      }

      if (!(result instanceof Api.auth.LoginToken)) {
        throw new TelegramAdapterError('UNAVAILABLE');
      }

      const session = this.savedSession(client);

      if (session) {
        const key = this.qrSessionKey(session);
        const state = {
          client,
          updateReceived: false,
          expiresAt: result.expires * 1000,
        };

        client.addEventHandler((update: Api.TypeUpdate) => {
          if (update instanceof Api.UpdateLoginToken) {
            state.updateReceived = true;
            this.logger.log({
              event: 'telegram_qr_login_token_update',
              sessionExists: true,
              selectedDcId: client.session.dcId || null,
            });
          }
        });

        this.activeQrLogins.set(key, state);
        keepAlive = true;
      }

      return {
        status: 'pending',
        session,
        qrUrl: this.qrUrl(result.token),
        expiresAt: new Date(result.expires * 1000).toISOString(),
      };
    } catch (error) {
      if (this.isQrPasswordRequired(error)) {
        return { status: 'password_required', session: this.savedSession(client) };
      }
      throw this.withAuthContext(error, connected, Boolean(this.savedSession(client)));
    } finally {
      if (!keepAlive) {
        await client.disconnect().catch(() => undefined);
      }
    }
  }

  async pollQrLogin(session: string): Promise<TelegramQrResult> {
    if (!session) throw new TelegramAdapterError('CONNECTION_EXPIRED');

    const key = this.qrSessionKey(session);
    const active = this.activeQrLogins.get(key);

    if (active) {
      try {
        const result = await this.exportQrToken(active.client);
        return await this.resolveQrTokenResult(active.client, result, key);
      } catch (error) {
        if (this.isQrPasswordRequired(error)) {
          return { status: 'password_required', session: this.savedSession(active.client) };
        }
        throw this.withAuthContext(error, true, Boolean(this.savedSession(active.client)));
      }
    }

    // Render restart / process recycle fallback:
    // rebuild the SAME auth key, then export once to reconcile accepted QR state.
    return this.qrLogin(session);
  }

  async checkQrLogin(session: string): Promise<TelegramQrResult> {
    if (!session) throw new TelegramAdapterError('CONNECTION_EXPIRED');

    const key = this.qrSessionKey(session);
    const active = this.activeQrLogins.get(key);

    if (active) {
      try {
        const authorized = await active.client.checkAuthorization();

        this.logger.log({
          event: 'telegram_qr_status_checked',
          sessionExists: true,
          activeClient: true,
          clientConnected: true,
          authorized,
          updateReceived: active.updateReceived,
          selectedDcId: active.client.session.dcId || null,
        });

        if (authorized) {
          const account = await this.account(active.client);
          const saved = this.savedSession(active.client);
          await this.closeActiveQrLogin(key);
          return { status: 'connected', session: saved, account };
        }

        // Telegram's documented QR flow emits UpdateLoginToken after the
        // phone accepts the QR. Only then perform the required second
        // ExportLoginToken call, which returns LoginTokenSuccess (or migrate).
        if (active.updateReceived) {
          const result = await this.exportQrToken(active.client);
          return await this.resolveQrTokenResult(active.client, result, key);
        }

        // Keep the displayed QR stable until its actual expiry.
        if (Date.now() >= active.expiresAt) {
          const result = await this.exportQrToken(active.client);
          return await this.resolveQrTokenResult(active.client, result, key);
        }

        return { status: 'pending', session: this.savedSession(active.client) };
      } catch (error) {
        if (this.isQrPasswordRequired(error)) {
          return { status: 'password_required', session: this.savedSession(active.client) };
        }
        throw this.withAuthContext(error, true, Boolean(this.savedSession(active.client)));
      }
    }

    // If Render restarted, the in-memory UpdateLoginToken listener is gone.
    // Reconnect the persisted auth key. If already authorized => success.
    // Otherwise export once, producing either LoginTokenSuccess or a fresh QR.
    return this.qrLogin(session);
  }

  private async qrLogin(session: string): Promise<TelegramQrResult> {
    const client = this.client(session);
    let connected = false;

    try {
      await client.connect();
      connected = true;

      if (await client.checkAuthorization()) {
        return {
          status: 'connected',
          session: this.savedSession(client),
          account: await this.account(client),
        };
      }

      const result = await this.exportQrToken(client);

      if (result instanceof Api.auth.LoginTokenSuccess) {
        return {
          status: 'connected',
          session: this.savedSession(client),
          account: await this.account(client),
        };
      }

      if (!(result instanceof Api.auth.LoginToken)) {
        throw new TelegramAdapterError('UNAVAILABLE');
      }

      return {
        status: 'pending',
        session: this.savedSession(client),
        qrUrl: this.qrUrl(result.token),
        expiresAt: new Date(result.expires * 1000).toISOString(),
      };
    } catch (error) {
      if (this.isQrPasswordRequired(error)) {
        return { status: 'password_required', session: this.savedSession(client) };
      }
      throw this.withAuthContext(error, connected, Boolean(this.savedSession(client)));
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  private async resolveQrTokenResult(
    client: TelegramClient,
    result: Api.auth.TypeLoginToken,
    key: string,
  ): Promise<TelegramQrResult> {
    if (result instanceof Api.auth.LoginTokenSuccess) {
      const account = await this.account(client);
      const session = this.savedSession(client);
      await this.closeActiveQrLogin(key);
      return { status: 'connected', session, account };
    }

    if (!(result instanceof Api.auth.LoginToken)) {
      throw new TelegramAdapterError('UNAVAILABLE');
    }

    const active = this.activeQrLogins.get(key);
    if (active) {
      active.updateReceived = false;
      active.expiresAt = result.expires * 1000;
    }

    return {
      status: 'pending',
      session: this.savedSession(client),
      qrUrl: this.qrUrl(result.token),
      expiresAt: new Date(result.expires * 1000).toISOString(),
    };
  }

  private qrUrl(token: Buffer | Uint8Array): string {
    return `tg://login?token=${Buffer.from(token).toString('base64url')}`;
  }

  private qrSessionKey(session: string): string {
    return createHash('sha256').update(session).digest('hex');
  }

  private isQrPasswordRequired(error: unknown): boolean {
    const candidate = error as { errorMessage?: string; message?: string };
    const message = `${candidate.errorMessage ?? ''} ${candidate.message ?? ''}`.toUpperCase();
    return message.includes('SESSION_PASSWORD_NEEDED');
  }

  private cleanupExpiredQrLogins(): void {
    const now = Date.now();

    for (const [key, state] of this.activeQrLogins.entries()) {
      // Extra grace period allows frontend to refresh an expired QR.
      if (now <= state.expiresAt + 120_000) continue;
      this.activeQrLogins.delete(key);
      void state.client.disconnect().catch(() => undefined);
    }
  }

  private async closeActiveQrLogin(key: string): Promise<void> {
    const state = this.activeQrLogins.get(key);
    if (!state) return;

    this.activeQrLogins.delete(key);
    await state.client.disconnect().catch(() => undefined);
  }
  private async exportQrToken(client: TelegramClient): Promise<Api.auth.TypeLoginToken> {
    const credentials = this.credentials();
    const result = await client.invoke(new Api.auth.ExportLoginToken({ apiId: credentials.apiId, apiHash: credentials.apiHash, exceptIds: [] }));
    if (!(result instanceof Api.auth.LoginTokenMigrateTo)) return result;
    await client._switchDC(result.dcId);
    return client.invoke(new Api.auth.ImportLoginToken({ token: result.token }));
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
      return { session: this.savedSession(client), ...this.describeSentCode(result), selectedDcId: client.session.dcId || null };
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
      if (/^AUTH_RESTART(?:_\d+)?$/.test((error as { errorMessage?: string }).errorMessage ?? '') && !authRestartAttempted) return this.requestSentCode(client, phoneNumber, true);
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
      selectedDcId: null,
    };
  }

  private mapDeliveryType(type: Api.auth.TypeSentCodeType): TelegramDeliveryType {
    if (type instanceof Api.auth.SentCodeTypeApp) return 'telegram_app';
    if (type instanceof Api.auth.SentCodeTypeSms || type instanceof Api.auth.SentCodeTypeSmsWord || type instanceof Api.auth.SentCodeTypeSmsPhrase) return 'sms';
    if (type instanceof Api.auth.SentCodeTypeCall || type instanceof Api.auth.SentCodeTypeFlashCall || type instanceof Api.auth.SentCodeTypeMissedCall) return 'call';
    if (type instanceof Api.auth.SentCodeTypeFragmentSms) return 'fragment';
    if (type instanceof Api.auth.SentCodeTypeFirebaseSms) return 'firebase_sms';
    if (type instanceof Api.auth.SentCodeTypeSetUpEmailRequired) return 'email_setup';
    if (type instanceof Api.auth.SentCodeTypeEmailCode) return 'email';
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
      await client.invoke(new Api.auth.LogOut());
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
    const normalized = this.normalizeQuery(query);
    if (!normalized) return [];

    const cached = this.getRememberedPeers(session);
    const cachedRanked = this.rankAndDeduplicate(cached, normalized).slice(0, limit);

    const searchOnce = async (): Promise<TelegramPeer[]> => {
      const client = this.client(session);
      const candidates: TelegramPeer[] = [...cached];
      let transientError: TelegramAdapterError | null = null;

      const rememberError = (error: unknown) => {
        const classified = classifyTelegramError(error);
        if (classified.code === 'CONNECTION_EXPIRED') throw classified;
        if (classified.code !== 'PEER_NOT_FOUND' && !transientError) transientError = classified;
      };

      const addEntity = (entity: Api.TypeUser | Api.TypeChat) => {
        const peer = this.entityToPeer(entity);
        candidates.push(peer);
        this.rememberPeerEntity(session, entity, peer);
      };

      try {
        await client.connect();

        // Dialogs and contacts are independent sources. A temporary failure in one
        // source must not hide valid matches from the other source or from cache.
        try {
          const dialogs = await client.getDialogs({ limit: Math.min(120, Math.max(40, limit * 6)) });
          for (const dialog of dialogs) {
            if (!dialog.entity) continue;
            const entity = dialog.entity as Api.TypeUser | Api.TypeChat;
            const peer = this.toPeer(dialog);
            candidates.push(peer);
            this.rememberPeerEntity(session, entity, peer);
          }
        } catch (error) {
          rememberError(error);
        }

        try {
          const contacts = await client.invoke(new Api.contacts.GetContacts({ hash: returnBigInt(0) }));
          if ('users' in contacts) {
            for (const entity of contacts.users) addEntity(entity);
          }
        } catch (error) {
          rememberError(error);
        }

        let ranked = this.rankAndDeduplicate(candidates, normalized);

        // A single cached/dialog match can be stale or incomplete. Search Telegram
        // globally unless we already have enough local candidates for the chooser.
        if (ranked.length < Math.min(limit, 3)) {
          if (this.isUsernameLike(normalized)) {
            try {
              const resolved = await client.invoke(new Api.contacts.ResolveUsername({ username: normalized }));
              for (const entity of [...resolved.users, ...resolved.chats]) addEntity(entity);
            } catch (error) {
              rememberError(error);
            }
          }

          const globalQueries = [
            ...new Set([normalized, this.comparableQuery(normalized)].filter(Boolean)),
          ];

          for (const globalQuery of globalQueries) {
            try {
              const global = await client.invoke(
                new Api.contacts.Search({
                  q: globalQuery,
                  limit: Math.min(50, Math.max(limit * 2, 10)),
                }),
              );
              for (const entity of [...global.users, ...global.chats]) addEntity(entity);
            } catch (error) {
              rememberError(error);
            }

            ranked = this.rankAndDeduplicate(candidates, normalized);
            if (ranked.length >= limit) break;
          }
        }

        ranked = this.rankAndDeduplicate(candidates, normalized);
        if (ranked.length) return ranked.slice(0, limit);
        if (transientError) throw transientError;
        return [];
      } catch (error) {
        if (error instanceof TelegramAdapterError) throw error;
        throw classifyTelegramError(error);
      } finally {
        await client.disconnect().catch(() => undefined);
      }
    };

    try {
      return await searchOnce();
    } catch (error) {
      const classified = error instanceof TelegramAdapterError ? error : classifyTelegramError(error);

      // Known peers remain usable as a graceful search fallback during a short
      // Telegram/DC outage.
      if (classified.code === 'UNAVAILABLE' && cachedRanked.length) return cachedRanked;

      // Read-only search is safe to retry once with a fresh MTProto connection.
      if (classified.code === 'UNAVAILABLE') {
        await new Promise((resolve) => setTimeout(resolve, 180));
        try {
          return await searchOnce();
        } catch (retryError) {
          const retryClassified = retryError instanceof TelegramAdapterError
            ? retryError
            : classifyTelegramError(retryError);
          if (retryClassified.code === 'UNAVAILABLE' && cachedRanked.length) return cachedRanked;
          throw retryClassified;
        }
      }

      throw classified;
    }
  }

  async chats(session: string, search: string | undefined, limit: number): Promise<TelegramPeer[]> {
    if (search?.trim()) return this.search(session, search, limit);
    return (await this.listPeers(session, Math.min(100, Math.max(limit, 20)))).slice(0, limit);
  }

  async resolvePeer(session: string, peerId: string): Promise<TelegramPeer> {
    const cached = this.getRememberedPeerEntity(session, peerId);
    if (cached) return cached.peer;

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
    const cached = this.getRememberedPeerEntity(session, peerId);
    if (cached) return { entity: cached.entity, peer: cached.peer };

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

    return null;
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
      baseLogger: new GramJsLogger(LogLevel.NONE),
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

  private comparableQuery(value: string): string {
    const honorifics = new Set(['aka', 'opa', 'aki', 'aka.', 'opa.', 'brat', 'bro']);
    return this.normalizeQuery(value)
      .replace(/[^\p{L}\p{N}_]+/gu, ' ')
      .split(/\s+/)
      .filter((token) => token && !honorifics.has(token))
      .join(' ')
      .trim();
  }

  private isUsernameLike(query: string): boolean {
    return /^[a-z0-9_]{5,32}$/i.test(query);
  }

  private getRememberedPeers(session: string): TelegramPeer[] {
    const prefix = `${createHash('sha256').update(session).digest('hex').slice(0, 16)}:`;
    const now = Date.now();
    const peers: TelegramPeer[] = [];
    for (const [key, value] of this.peerEntityCache) {
      if (!key.startsWith(prefix)) continue;
      if (value.expiresAt <= now) { this.peerEntityCache.delete(key); continue; }
      peers.push(value.peer);
    }
    return peers;
  }

  private rankAndDeduplicate(peers: TelegramPeer[], query: string): TelegramPeer[] {
    const normalizedQuery = this.normalizeQuery(query);
    const comparableQuery = this.comparableQuery(normalizedQuery);
    const queryTokens = comparableQuery.split(' ').filter(Boolean);
    const score = (peer: TelegramPeer) => {
      const name = this.normalizeQuery(peer.displayName);
      const comparableName = this.comparableQuery(name);
      const username = this.normalizeQuery(peer.username ?? '');
      if (username === normalizedQuery) return 100;
      if (name === normalizedQuery || comparableName === comparableQuery) return 90;
      if (username.startsWith(normalizedQuery)) return 80;
      if (name.startsWith(normalizedQuery) || (comparableQuery && comparableName.startsWith(comparableQuery))) return 70;
      if (name.includes(normalizedQuery) || username.includes(normalizedQuery)) return 60;
      if (comparableQuery && comparableName.includes(comparableQuery)) return 55;
      if (queryTokens.length && queryTokens.every((token) => comparableName.split(' ').some((part) => part.startsWith(token)))) return 50;
      return 0;
    };
    const unique = [...new Map(peers.map((peer) => [peer.peerId, peer])).values()]
      .map((peer) => ({ peer, score: score(peer) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);
    return unique.map((item) => item.peer);
  }
}
