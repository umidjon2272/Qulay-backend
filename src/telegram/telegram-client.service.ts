import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'teleproto';
import { getPeerId } from 'teleproto/Utils';
import { StringSession } from 'teleproto/sessions';
import { classifyTelegramError, TelegramAdapterError } from './telegram.errors';

export type TelegramAccount = { telegramUserId: string; username: string | null; displayName: string | null; phoneNumber: string | null };
export type TelegramPeer = { peerId: string; type: 'USER' | 'GROUP' | 'CHANNEL'; displayName: string; username: string | null; lastActivity: string | null };
export type TelegramPendingLogin = { encryptedSessionSource: string; phoneCodeHash: string };

export abstract class TelegramClientService {
  abstract beginLogin(phoneNumber: string): Promise<{ session: string; phoneCodeHash: string }>;
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
  private readonly apiId: number | undefined;
  private readonly apiHash: string | undefined;

  constructor(config: ConfigService) {
    super();
    this.apiId = config.get<number>('telegram.apiId');
    this.apiHash = config.get<string>('telegram.apiHash');
  }

  async beginLogin(phoneNumber: string): Promise<{ session: string; phoneCodeHash: string }> {
    const credentials = this.credentials();
    const client = this.client('');
    try {
      await client.connect();
      const result = await client.sendCode(credentials, phoneNumber);
      return { session: this.savedSession(client), phoneCodeHash: result.phoneCodeHash };
    } catch (error) {
      throw classifyTelegramError(error);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
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
