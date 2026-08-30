import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramConnection, TelegramConnectionStatus } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChatsQueryDto, TelegramSearchQueryDto } from './dto/telegram.dto';
import { isTelegramAuthInvalid, mapTelegramError, TelegramAdapterError, telegramErrorCode } from './telegram.errors';
import { TelegramClientService, TelegramPeer, TelegramSentCode } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';

type ConnectedConnection = TelegramConnection & { encryptedSession: string };
type CodeRequiredResponse = { status: 'code_required'; delivery: TelegramSentCode['delivery']; nextDelivery: TelegramSentCode['nextDelivery']; timeoutSeconds: TelegramSentCode['timeoutSeconds'] };

@Injectable()
export class TelegramIntegrationService {
  private readonly logger = new Logger(TelegramIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: TelegramCryptoService,
    private readonly telegramClient: TelegramClientService,
    private readonly contactsService: ContactsService,
    private readonly activityLog: ActivityLogService,
    private readonly config: ConfigService,
  ) {}

  async connect(userId: string, phoneNumber: string): Promise<CodeRequiredResponse> {
    this.assertConfigured();
    try {
      const pending = await this.telegramClient.beginLogin(phoneNumber);
      const now = new Date();
      await this.prisma.telegramConnection.upsert({
        where: { userId },
        create: {
          userId,
          phoneNumber: this.crypto.encrypt(phoneNumber),
          encryptedSession: this.crypto.encrypt(pending.session),
          encryptedPhoneCodeHash: this.crypto.encrypt(pending.phoneCodeHash),
          codeSentAt: now,
          codeResendAfterSeconds: pending.timeoutSeconds,
          status: TelegramConnectionStatus.AWAITING_CODE,
        },
        update: {
          phoneNumber: this.crypto.encrypt(phoneNumber),
          encryptedSession: this.crypto.encrypt(pending.session),
          encryptedPhoneCodeHash: this.crypto.encrypt(pending.phoneCodeHash),
          codeSentAt: now,
          codeResendAfterSeconds: pending.timeoutSeconds,
          telegramUserId: null,
          username: null,
          displayName: null,
          status: TelegramConnectionStatus.AWAITING_CODE,
          connectedAt: null,
          lastUsedAt: now,
        },
      });
      this.logCodeRequested('connect', pending);
      return { status: 'code_required', delivery: pending.delivery, nextDelivery: pending.nextDelivery, timeoutSeconds: pending.timeoutSeconds };
    } catch (error) {
      await this.markError(userId);
      throw mapTelegramError(error);
    }
  }

  async resendCode(userId: string): Promise<CodeRequiredResponse> {
    this.assertConfigured();
    const connection = await this.getPendingConnection(userId, TelegramConnectionStatus.AWAITING_CODE);
    this.assertResendAllowed(connection);
    try {
      const pending = await this.telegramClient.resendCode({
        session: this.decryptPendingSession(connection),
        phoneNumber: this.crypto.decrypt(this.requireStored(connection.phoneNumber)),
        phoneCodeHash: this.crypto.decrypt(this.requireStored(connection.encryptedPhoneCodeHash)),
      });
      await this.prisma.telegramConnection.update({
        where: { userId },
        data: {
          encryptedSession: this.crypto.encrypt(pending.session),
          encryptedPhoneCodeHash: this.crypto.encrypt(pending.phoneCodeHash),
          codeSentAt: new Date(),
          codeResendAfterSeconds: pending.timeoutSeconds,
          lastUsedAt: new Date(),
        },
      });
      this.logCodeRequested('resend', pending);
      return { status: 'code_required', delivery: pending.delivery, nextDelivery: pending.nextDelivery, timeoutSeconds: pending.timeoutSeconds };
    } catch (error) {
      throw this.handleAuthError(userId, error);
    }
  }

  /** Enforces Telegram's own resend timeout locally, without re-hitting Telegram just to learn we're too early. */
  private assertResendAllowed(connection: TelegramConnection): void {
    if (!connection.codeSentAt || !connection.codeResendAfterSeconds) return;
    const elapsedSeconds = (Date.now() - connection.codeSentAt.getTime()) / 1000;
    const remaining = connection.codeResendAfterSeconds - elapsedSeconds;
    if (remaining > 0) throw mapTelegramError(new TelegramAdapterError('FLOOD_WAIT', Math.ceil(remaining)));
  }

  private logCodeRequested(source: 'connect' | 'resend', pending: TelegramSentCode): void {
    this.logger.log({
      event: 'telegram_code_requested',
      source,
      delivery: pending.delivery,
      nextDelivery: pending.nextDelivery,
      timeoutSeconds: pending.timeoutSeconds,
      rawType: pending.rawType,
      rawNextType: pending.rawNextType,
    });
  }

  async verifyCode(userId: string, code: string): Promise<{ status: 'connected' | 'password_required' }> {
    this.assertConfigured();
    const connection = await this.getPendingConnection(userId, TelegramConnectionStatus.AWAITING_CODE);
    try {
      const result = await this.telegramClient.verifyCode({
        session: this.decryptPendingSession(connection),
        phoneNumber: this.crypto.decrypt(this.requireStored(connection.phoneNumber)),
        phoneCodeHash: this.crypto.decrypt(this.requireStored(connection.encryptedPhoneCodeHash)),
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
      const result = await this.telegramClient.verifyPassword({ session: this.decryptPendingSession(connection), password });
      await this.finalizeConnection(userId, connection, result.session, result.account);
      return { status: 'connected' };
    } catch (error) {
      throw this.handleAuthError(userId, error);
    }
  }

  async status(userId: string) {
    if (!this.isConfigured()) return { connected: false, status: 'not_configured', username: null, displayName: null, maskedPhone: null, connectedAt: null, temporaryError: false, lastErrorAt: null as Date | null, lastErrorCode: null as string | null, lastValidatedAt: null as Date | null };
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection) return { connected: false, status: TelegramConnectionStatus.DISCONNECTED, username: null, displayName: null, maskedPhone: null, connectedAt: null, temporaryError: false, lastErrorAt: null as Date | null, lastErrorCode: null as string | null, lastValidatedAt: null as Date | null };
    let temporaryError = false;
    if (connection.status === TelegramConnectionStatus.CONNECTED && connection.encryptedSession) {
      try {
        const account = await this.telegramClient.validateSession(this.crypto.decrypt(connection.encryptedSession));
        await this.prisma.telegramConnection.update({ where: { userId }, data: { lastValidatedAt: new Date(), lastErrorAt: null, lastErrorCode: null, telegramUserId: account.telegramUserId, username: account.username, displayName: account.displayName } });
      } catch (error) {
        if (isTelegramAuthInvalid(error)) {
          await this.revokeConnection(userId, telegramErrorCode(error));
          return { connected: false, status: TelegramConnectionStatus.DISCONNECTED, username: null, displayName: null, maskedPhone: null, connectedAt: null, temporaryError: false, lastErrorAt: null as Date | null, lastErrorCode: telegramErrorCode(error) as string | null, lastValidatedAt: null as Date | null };
        }
        temporaryError = true;
        await this.recordConnectionError(userId, error);
      }
    }
    return {
      connected: connection.status === TelegramConnectionStatus.CONNECTED,
      status: connection.status,
      username: connection.username,
      displayName: connection.displayName,
      maskedPhone: this.crypto.maskPhone(connection.phoneNumber),
      connectedAt: connection.connectedAt,
      temporaryError,
      lastErrorAt: temporaryError ? new Date() : connection.lastErrorAt,
      lastErrorCode: connection.lastErrorCode,
      lastValidatedAt: connection.lastValidatedAt,
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
        data: { telegramUserId: null, phoneNumber: null, username: null, displayName: null, encryptedSession: null, encryptedPhoneCodeHash: null, codeSentAt: null, codeResendAfterSeconds: null, status: TelegramConnectionStatus.DISCONNECTED, connectedAt: null, lastValidatedAt: null, lastErrorAt: null, lastErrorCode: null, lastUsedAt: new Date() },
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
      throw await this.handleConnectedError(userId, error);
    }
  }

  async chats(userId: string, query: TelegramChatsQueryDto) {
    this.assertConfigured();
    const connection = await this.connected(userId);
    try {
      const peers = await this.telegramClient.chats(connection.encryptedSession, query.search, query.limit);
      return this.withContactMatches(userId, peers);
    } catch (error) {
      throw await this.handleConnectedError(userId, error);
    }
  }

  async prepareTelegramMessage(userId: string, peerId: string, text: string) {
    this.assertConfigured();
    const connection = await this.connected(userId);
    try {
      const recipient = await this.telegramClient.resolvePeer(connection.encryptedSession, peerId);
      return { recipient, text, confirmationRequired: true };
    } catch (error) {
      throw await this.handleConnectedError(userId, error);
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
      throw await this.handleConnectedError(userId, error);
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
        codeSentAt: null,
        codeResendAfterSeconds: null,
        phoneNumber: connection.phoneNumber,
        telegramUserId: account.telegramUserId,
        username: account.username,
        displayName: account.displayName,
        status: TelegramConnectionStatus.CONNECTED,
        connectedAt: new Date(),
        lastValidatedAt: new Date(),
        lastErrorAt: null,
        lastErrorCode: null,
        lastUsedAt: new Date(),
      },
    });
    await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.TELEGRAM_CONNECTED, entityType: 'TELEGRAM_CONNECTION', metadata: { source: 'TELEGRAM', telegramUserId: account.telegramUserId, username: account.username } });
  }

  private async connected(userId: string): Promise<ConnectedConnection> {
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== TelegramConnectionStatus.CONNECTED || !connection.encryptedSession) throw new BadRequestException('Telegram account is not connected');
    const session = this.crypto.decrypt(connection.encryptedSession);
    try {
      await this.telegramClient.validateSession(session);
      await this.prisma.telegramConnection.update({ where: { userId }, data: { lastValidatedAt: new Date(), lastErrorAt: null, lastErrorCode: null } });
    } catch (error) {
      throw await this.handleConnectedError(userId, error);
    }
    return { ...connection, encryptedSession: session };
  }

  private async handleConnectedError(userId: string, error: unknown) {
    if (isTelegramAuthInvalid(error)) await this.revokeConnection(userId, telegramErrorCode(error));
    else await this.recordConnectionError(userId, error);
    return mapTelegramError(error);
  }

  private async recordConnectionError(userId: string, error: unknown): Promise<void> {
    await this.prisma.telegramConnection.updateMany({ where: { userId, status: TelegramConnectionStatus.CONNECTED }, data: { lastErrorAt: new Date(), lastErrorCode: telegramErrorCode(error) } });
  }

  private async revokeConnection(userId: string, errorCode: string): Promise<void> {
    await this.prisma.telegramConnection.updateMany({ where: { userId }, data: { encryptedSession: null, encryptedPhoneCodeHash: null, codeSentAt: null, codeResendAfterSeconds: null, status: TelegramConnectionStatus.DISCONNECTED, lastErrorAt: new Date(), lastErrorCode: errorCode } });
  }

  /** Returns the row as stored — `encryptedSession`/`encryptedPhoneCodeHash` are still ciphertext. Use `decryptPendingSession()` before handing the session to the Telegram client. */
  private async getPendingConnection(userId: string, status: TelegramConnectionStatus): Promise<TelegramConnection> {
    const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
    if (!connection || connection.status !== status || !connection.encryptedSession) throw new BadRequestException('Telegram login state is unavailable');
    return connection;
  }

  /** Asserts a stored (possibly-encrypted) field is present; does NOT decrypt it. */
  private requireStored(value: string | null): string {
    if (!value) throw new BadRequestException('Telegram login state is unavailable');
    return value;
  }

  /** Single point of truth for reading a pending connection's session: always decrypted, never raw ciphertext. */
  private decryptPendingSession(connection: TelegramConnection): string {
    return this.crypto.decrypt(this.requireStored(connection.encryptedSession));
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
