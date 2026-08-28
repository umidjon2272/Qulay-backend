import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'teleproto';
import { getPeerId } from 'teleproto/Utils';
import { StringSession } from 'teleproto/sessions';
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
  abstract beginLogin(phoneNumber: string): Promise<TelegramSentCode>;
  abstract resendCode(input: { session: string; phoneNumber: string; phoneCodeHash: string }): Promise<TelegramSentCode>;
  abstract verifyCode(input: { session: string; phoneNumber: string; phoneCodeHash: string; code: string }): Promise<{ status: 'connected' | 'password_required'; session: string; account?: TelegramAccount }>;
  abstract verifyPassword(input: { session: string; password: string }): Promise<{ session: string; account: TelegramAccount }>;
  abstract logout(session: string): Promise<void>;
  abstract search(session: string, query: string, limit: number): Promise<TelegramPeer[]>;
  abstract chats(session: string, search: string | undefined, limit: number): Promise<TelegramPeer[]>;
  abstract resolvePeer(session: string, peerId: string): Promise<TelegramPeer>;
  abstract sendMessage(session: string, peerId: string, text: string): Promise<{ messageId: string; recipient: TelegramPeer }>;
}

@Injectable()
export class TeleprotoTelegramClientService extends TelegramClientService {
  private readonly logger = new Logger(TeleprotoTelegramClientService.name);
  private readonly apiId: number | undefined;
  private readonly apiHash: string | undefined;

  constructor(config: ConfigService) {
    super();
    this.apiId = config.get<number>('telegram.apiId');
    this.apiHash = config.get<string>('telegram.apiHash');
  }

  async beginLogin(phoneNumber: string): Promise<TelegramSentCode> {
    const client = this.client('');
    try {
      await client.connect();
      const sentCode = await this.requestSentCode(client, phoneNumber);
      return { session: this.savedSession(client), ...this.describeSentCode(sentCode) };
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async resendCode(input: { session: string; phoneNumber: string; phoneCodeHash: string }): Promise<TelegramSentCode> {
    const client = this.client(input.session);
    try {
      await client.connect();
      const result = await client.invoke(new Api.auth.ResendCode({ phoneNumber: input.phoneNumber, phoneCodeHash: input.phoneCodeHash }));
      this.logSentCodeDiagnostic('resend_code', result);
      if (!(result instanceof Api.auth.SentCode)) throw new TelegramAdapterError('UNAVAILABLE');
      return { session: this.savedSession(client), ...this.describeSentCode(result) };
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  /** Raw `auth.SendCode` invocation (bypasses the high-level `sendCode()` helper, which discards delivery metadata). */
  private async requestSentCode(client: TelegramClient, phoneNumber: string): Promise<Api.auth.SentCode> {
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
      if ((error as { errorMessage?: string }).errorMessage === 'AUTH_RESTART') return this.requestSentCode(client, phoneNumber);
      throw error;
    }
    this.logSentCodeDiagnostic('send_code', result);
    if (!(result instanceof Api.auth.SentCode)) throw new TelegramAdapterError('UNAVAILABLE');
    return result;
  }

  /**
   * TEMPORARY production diagnostic (safe fields only — no phone number, phoneCodeHash, code, API credentials, or session).
   * Logs the raw Telegram response verbatim so we can see exactly what Telegram sent, without inferring or forcing anything.
   * Remove once the "code never arrives" investigation is closed.
   */
  private logSentCodeDiagnostic(source: 'send_code' | 'resend_code', result: Api.auth.TypeSentCode): void {
    const responseKind = result instanceof Api.auth.SentCode
      ? 'auth.SentCode'
      : result instanceof Api.auth.SentCodeSuccess
        ? 'auth.SentCodeSuccess'
        : result instanceof Api.auth.SentCodePaymentRequired
          ? 'auth.SentCodePaymentRequired'
          : 'other';
    const sentCode = result instanceof Api.auth.SentCode ? result : null;
    this.logger.log({
      event: 'telegram_sent_code_diagnostic',
      source,
      responseKind,
      rawType: sentCode?.type?.className ?? null,
      delivery: sentCode ? this.mapDeliveryType(sentCode.type) : null,
      codeLength: sentCode ? this.sentCodeLength(sentCode.type) : null,
      rawNextType: sentCode?.nextType?.className ?? null,
      nextDelivery: sentCode?.nextType ? this.mapNextDeliveryType(sentCode.nextType) : null,
      timeoutSeconds: sentCode?.timeout ?? null,
    });
  }

  private sentCodeLength(type: Api.auth.TypeSentCodeType): number | null {
    const withLength = type as { length?: number };
    return typeof withLength.length === 'number' ? withLength.length : null;
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
    try {
      await client.connect();
      try {
        await client.invoke(new Api.auth.SignIn({ phoneNumber: input.phoneNumber, phoneCodeHash: input.phoneCodeHash, phoneCode: input.code }));
      } catch (error) {
        const message = `${(error as { errorMessage?: string }).errorMessage ?? ''} ${(error as Error).message ?? ''}`.toUpperCase();
        if (message.includes('SESSION_PASSWORD_NEEDED')) return { status: 'password_required', session: this.savedSession(client) };
        throw classifyTelegramError(error);
      }
      return { status: 'connected', session: this.savedSession(client), account: await this.account(client) };
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      throw classifyTelegramError(error);
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

  async search(session: string, query: string, limit: number): Promise<TelegramPeer[]> {
    const peers = await this.listPeers(session, Math.min(100, Math.max(20, limit * 4)));
    const normalized = query.replace(/^@/, '').toLocaleLowerCase();
    return peers.filter((peer) => `${peer.displayName} ${peer.username ?? ''}`.toLocaleLowerCase().includes(normalized)).slice(0, limit);
  }

  async chats(session: string, search: string | undefined, limit: number): Promise<TelegramPeer[]> {
    const peers = await this.listPeers(session, Math.min(100, Math.max(limit, search ? 50 : limit)));
    if (!search) return peers.slice(0, limit);
    const normalized = search.toLocaleLowerCase();
    return peers.filter((peer) => `${peer.displayName} ${peer.username ?? ''}`.toLocaleLowerCase().includes(normalized)).slice(0, limit);
  }

  async resolvePeer(session: string, peerId: string): Promise<TelegramPeer> {
    const peers = await this.listPeers(session, 100);
    const peer = peers.find((item) => item.peerId === peerId);
    if (!peer) throw new TelegramAdapterError('PEER_NOT_FOUND');
    return peer;
  }

  async sendMessage(session: string, peerId: string, text: string): Promise<{ messageId: string; recipient: TelegramPeer }> {
    const client = this.client(session);
    try {
      await client.connect();
      const dialogs = await client.getDialogs({ limit: 100 });
      const dialog = dialogs.find((item) => item.entity && getPeerId(item.entity, true) === peerId);
      if (!dialog?.entity) throw new TelegramAdapterError('PEER_NOT_FOUND');
      const message = await client.sendMessage(dialog.entity, { message: text });
      return { messageId: String(message.id), recipient: this.toPeer(dialog) };
    } catch (error) {
      if (error instanceof TelegramAdapterError) throw error;
      const classified = classifyTelegramError(error);
      throw classified.code === 'UNAVAILABLE' ? new TelegramAdapterError('SEND_FAILED') : classified;
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  private client(session: string): TelegramClient {
    const credentials = this.credentials();
    return new TelegramClient(new StringSession(session), credentials.apiId, credentials.apiHash, {
      connectionRetries: 3, reconnectRetries: 2, floodSleepThreshold: 0, deviceModel: 'Qulay AI', appVersion: '1.0',
    });
  }

  private credentials(): { apiId: number; apiHash: string } {
    if (this.apiId === undefined || !this.apiHash) {
      throw new TelegramAdapterError('NOT_CONFIGURED');
    }
    return { apiId: this.apiId, apiHash: this.apiHash };
  }

  private savedSession(client: TelegramClient): string {
    return (client.session as StringSession).save();
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
}
