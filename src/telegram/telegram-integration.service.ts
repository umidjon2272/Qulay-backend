import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramConnection, TelegramConnectionStatus } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChatsQueryDto, TelegramSearchQueryDto } from './dto/telegram.dto';
import { mapTelegramError } from './telegram.errors';
import { TelegramClientService, TelegramPeer } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';

type ConnectedConnection = TelegramConnection & { encryptedSession: string };

@Injectable()
export class TelegramIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TelegramCryptoService,
    private readonly telegramClient: TelegramClientService,
    private readonly contactsService: ContactsService,
    private readonly activityLog: ActivityLogService,
    private readonly config: ConfigService,
  ) {}

  async connect(userId: string, phoneNumber: string): Promise<{ status: 'code_required' }> {
    this.assertConfigured();
    try {
      const pending = await this.telegramClient.beginLogin(phoneNumber);
      await this.prisma.telegramConnection.upsert({
        where: { userId },
        create: {
          userId,
          phoneNumber: this.crypto.encrypt(phoneNumber),
          encryptedSession: this.crypto.encrypt(pending.session),
          encryptedPhoneCodeHash: this.crypto.encrypt(pending.phoneCodeHash),
          status: TelegramConnectionStatus.AWAITING_CODE,
        },
        update: {
          phoneNumber: this.crypto.encrypt(phoneNumber),
          encryptedSession: this.crypto.encrypt(pending.session),
          encryptedPhoneCodeHash: this.crypto.encrypt(pending.phoneCodeHash),
          telegramUserId: null,
          username: null,
          displayName: null,
          status: TelegramConnectionStatus.AWAITING_CODE,
          connectedAt: null,
          lastUsedAt: new Date(),
        },
      });
      return { status: 'code_required' };
    } catch (error) {
      await this.markError(userId);
      throw mapTelegramError(error);
    }
  }

  async verifyCode(userId: string, code: string): Promise<{ status: 'connected' | 'password_required' }> {
    this.assertConfigured();
    const connection = await this.getPendingConnection(userId, TelegramConnectionStatus.AWAITING_CODE);
    try {
      const result = await this.telegramClient.verifyCode({
        session: this.decryptRequired(connection.encryptedSession),
        phoneNumber: this.crypto.decrypt(this.decryptRequired(connection.phoneNumber)),
        phoneCodeHash: this.crypto.decrypt(this.decryptRequired(connection.encryptedPhoneCodeHash)),
        code,
      });
      if (result.status === 'password_required') {
        await this.prisma.telegramConnection.update({ where: { userId }, data: { encryptedSession: this.crypto.encrypt(result.session), status: TelegramConnectionStatus.AWAITING_PASSWORD, lastUsedAt: new Date() } });
        return { status: 'password_required' };
      }
      await this.finalizeConnection(userId, connection, result.session, result.account);
      return { status: 'connected' };
    } catch (error) {
      throw this.handleAuthError(userId, error);
    }
  }

  async verifyPassword(userId: string, password: string): Promise<{ status: 'connected' }> {
    this.assertConfigured();
    const connection = await this.getPendingConnection(userId, TelegramConnectionStatus.AWAITING_PASSWORD);
    try {
      const result = await this.telegramClient.verifyPassword({ session: this.decryptRequired(connection.encryptedSession), password });
      await this.finalizeConnection(userId, connection, result.session, result.account);
      return { status: 'connected' };
    } catch (error) {
      throw this.handleAuthError(userId, error);
    }
  }

  async status(userId: string) {
    if (!this.isConfigured()) return { connected: false, status: 'not_configured', username: null, displayName: null, maskedPhone: null, connectedAt: null };
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection) return { connected: false, status: TelegramConnectionStatus.DISCONNECTED, username: null, displayName: null, maskedPhone: null, connectedAt: null };
    return {
      connected: connection.status === TelegramConnectionStatus.CONNECTED,
      status: connection.status,
      username: connection.username,
      displayName: connection.displayName,
      maskedPhone: this.crypto.maskPhone(connection.phoneNumber),
      connectedAt: connection.connectedAt,
    };
  }

  async disconnect(userId: string): Promise<{ status: 'disconnected' }> {
    this.assertConfigured();
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (connection?.encryptedSession) {
      try {
        await this.telegramClient.logout(this.crypto.decrypt(connection.encryptedSession));
      } catch {
        // Telegram logout is best effort; local credentials are always removed.
      }
    }
    if (connection) {
      await this.prisma.telegramConnection.update({
        where: { userId },
        data: { telegramUserId: null, phoneNumber: null, username: null, displayName: null, encryptedSession: null, encryptedPhoneCodeHash: null, status: TelegramConnectionStatus.DISCONNECTED, connectedAt: null, lastUsedAt: new Date() },
      });
    }
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.TELEGRAM_DISCONNECTED, entityType: 'TELEGRAM_CONNECTION', metadata: { source: 'TELEGRAM' } });
    return { status: 'disconnected' };
  }

  async search(userId: string, query: TelegramSearchQueryDto) {
    this.assertConfigured();
    const connection = await this.connected(userId);
    try {
      const peers = await this.telegramClient.search(connection.encryptedSession, query.q, query.limit);
      return this.withContactMatches(userId, peers);
    } catch (error) {
      throw mapTelegramError(error);
    }
  }

  async chats(userId: string, query: TelegramChatsQueryDto) {
    this.assertConfigured();
    const connection = await this.connected(userId);
    try {
      const peers = await this.telegramClient.chats(connection.encryptedSession, query.search, query.limit);
      return this.withContactMatches(userId, peers);
    } catch (error) {
      throw mapTelegramError(error);
    }
  }

  async prepareTelegramMessage(userId: string, peerId: string, text: string) {
    this.assertConfigured();
    const connection = await this.connected(userId);
    try {
      const recipient = await this.telegramClient.resolvePeer(connection.encryptedSession, peerId);
      return { recipient, text, confirmationRequired: true };
    } catch (error) {
      throw mapTelegramError(error);
    }
  }

  async sendMessage(userId: string, peerId: string, text: string): Promise<{ messageId: string; recipient: TelegramPeer }> {
    this.assertConfigured();
    const connection = await this.connected(userId);
    try {
      const result = await this.telegramClient.sendMessage(connection.encryptedSession, peerId, text);
      await this.prisma.telegramConnection.update({ where: { userId }, data: { lastUsedAt: new Date() } });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.TELEGRAM_MESSAGE_SENT, entityType: 'TELEGRAM_MESSAGE', metadata: { source: 'TELEGRAM', peerId, recipientType: result.recipient.type, recipientName: result.recipient.displayName } });
      return result;
    } catch (error) {
      throw mapTelegramError(error);
    }
  }

  async sendSelfNotification(userId: string, text: string): Promise<{ messageId: string; recipient: TelegramPeer }> {
    this.assertConfigured();
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection?.telegramUserId) {
      throw new BadRequestException('Connected Telegram self-chat is unavailable');
    }
    return this.sendMessage(userId, connection.telegramUserId, text);
  }

  private async finalizeConnection(userId: string, connection: TelegramConnection, session: string, account?: { telegramUserId: string; username: string | null; displayName: string | null; phoneNumber: string | null }): Promise<void> {
    if (!account) throw new BadRequestException('Telegram account details were unavailable');
    await this.prisma.telegramConnection.update({
      where: { userId },
      data: {
        encryptedSession: this.crypto.encrypt(session),
        encryptedPhoneCodeHash: null,
        phoneNumber: connection.phoneNumber,
        telegramUserId: account.telegramUserId,
        username: account.username,
        displayName: account.displayName,
        status: TelegramConnectionStatus.CONNECTED,
        connectedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.TELEGRAM_CONNECTED, entityType: 'TELEGRAM_CONNECTION', metadata: { source: 'TELEGRAM', telegramUserId: account.telegramUserId, username: account.username } });
  }

  private async connected(userId: string): Promise<ConnectedConnection> {
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== TelegramConnectionStatus.CONNECTED || !connection.encryptedSession) throw new BadRequestException('Telegram account is not connected');
    return { ...connection, encryptedSession: this.crypto.decrypt(connection.encryptedSession) };
  }

  private async getPendingConnection(userId: string, status: TelegramConnectionStatus): Promise<TelegramConnection> {
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== status || !connection.encryptedSession) throw new BadRequestException('Telegram login state is unavailable');
    return connection;
  }

  private decryptRequired(value: string | null): string {
    if (!value) throw new BadRequestException('Telegram login state is unavailable');
    return value;
  }

  private async markError(userId: string): Promise<void> {
    await this.prisma.telegramConnection.updateMany({ where: { userId }, data: { status: TelegramConnectionStatus.ERROR } });
  }

  private handleAuthError(userId: string, error: unknown) {
    const mapped = mapTelegramError(error);
    if (mapped.getStatus() >= 500) void this.markError(userId);
    return mapped;
  }

  private async withContactMatches(userId: string, peers: TelegramPeer[]) {
    return Promise.all(peers.map(async (peer) => {
      const username = peer.username?.replace(/^@/, '').toLocaleLowerCase();
      if (!username) return peer;
      const result = await this.contactsService.listForUser(userId, { search: username, page: 1, limit: 20 } as never);
      const exact = result.items.find((contact) => contact.telegramUsername?.replace(/^@/, '').toLocaleLowerCase() === username);
      return exact ? { ...peer, contactId: exact.id } : peer;
    }));
  }

  private isConfigured(): boolean {
    return this.config.get<boolean>('telegram.configured', false);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) throw new ServiceUnavailableException('Telegram integratsiyasi hozir sozlanmagan');
  }
}
