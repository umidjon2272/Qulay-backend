"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const contacts_service_1 = require("../contacts/contacts.service");
const prisma_service_1 = require("../prisma/prisma.service");
const telegram_errors_1 = require("./telegram.errors");
const telegram_client_service_1 = require("./telegram-client.service");
const telegram_crypto_service_1 = require("./telegram-crypto.service");
let TelegramIntegrationService = class TelegramIntegrationService {
    constructor(prisma, crypto, telegramClient, contactsService, activityLog) {
        this.prisma = prisma;
        this.crypto = crypto;
        this.telegramClient = telegramClient;
        this.contactsService = contactsService;
        this.activityLog = activityLog;
    }
    async connect(userId, phoneNumber) {
        try {
            const pending = await this.telegramClient.beginLogin(phoneNumber);
            await this.prisma.telegramConnection.upsert({
                where: { userId },
                create: {
                    userId,
                    phoneNumber: this.crypto.encrypt(phoneNumber),
                    encryptedSession: this.crypto.encrypt(pending.session),
                    encryptedPhoneCodeHash: this.crypto.encrypt(pending.phoneCodeHash),
                    status: client_1.TelegramConnectionStatus.AWAITING_CODE,
                },
                update: {
                    phoneNumber: this.crypto.encrypt(phoneNumber),
                    encryptedSession: this.crypto.encrypt(pending.session),
                    encryptedPhoneCodeHash: this.crypto.encrypt(pending.phoneCodeHash),
                    telegramUserId: null,
                    username: null,
                    displayName: null,
                    status: client_1.TelegramConnectionStatus.AWAITING_CODE,
                    connectedAt: null,
                    lastUsedAt: new Date(),
                },
            });
            return { status: 'code_required' };
        }
        catch (error) {
            await this.markError(userId);
            throw (0, telegram_errors_1.mapTelegramError)(error);
        }
    }
    async verifyCode(userId, code) {
        const connection = await this.getPendingConnection(userId, client_1.TelegramConnectionStatus.AWAITING_CODE);
        try {
            const result = await this.telegramClient.verifyCode({
                session: this.decryptRequired(connection.encryptedSession),
                phoneNumber: this.crypto.decrypt(this.decryptRequired(connection.phoneNumber)),
                phoneCodeHash: this.crypto.decrypt(this.decryptRequired(connection.encryptedPhoneCodeHash)),
                code,
            });
            if (result.status === 'password_required') {
                await this.prisma.telegramConnection.update({ where: { userId }, data: { encryptedSession: this.crypto.encrypt(result.session), status: client_1.TelegramConnectionStatus.AWAITING_PASSWORD, lastUsedAt: new Date() } });
                return { status: 'password_required' };
            }
            await this.finalizeConnection(userId, connection, result.session, result.account);
            return { status: 'connected' };
        }
        catch (error) {
            throw this.handleAuthError(userId, error);
        }
    }
    async verifyPassword(userId, password) {
        const connection = await this.getPendingConnection(userId, client_1.TelegramConnectionStatus.AWAITING_PASSWORD);
        try {
            const result = await this.telegramClient.verifyPassword({ session: this.decryptRequired(connection.encryptedSession), password });
            await this.finalizeConnection(userId, connection, result.session, result.account);
            return { status: 'connected' };
        }
        catch (error) {
            throw this.handleAuthError(userId, error);
        }
    }
    async status(userId) {
        const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
        if (!connection)
            return { connected: false, status: client_1.TelegramConnectionStatus.DISCONNECTED, username: null, displayName: null, maskedPhone: null, connectedAt: null };
        return {
            connected: connection.status === client_1.TelegramConnectionStatus.CONNECTED,
            status: connection.status,
            username: connection.username,
            displayName: connection.displayName,
            maskedPhone: this.crypto.maskPhone(connection.phoneNumber),
            connectedAt: connection.connectedAt,
        };
    }
    async disconnect(userId) {
        const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
        if (connection?.encryptedSession) {
            try {
                await this.telegramClient.logout(this.crypto.decrypt(connection.encryptedSession));
            }
            catch {
            }
        }
        if (connection) {
            await this.prisma.telegramConnection.update({
                where: { userId },
                data: { telegramUserId: null, phoneNumber: null, username: null, displayName: null, encryptedSession: null, encryptedPhoneCodeHash: null, status: client_1.TelegramConnectionStatus.DISCONNECTED, connectedAt: null, lastUsedAt: new Date() },
            });
        }
        await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.TELEGRAM_DISCONNECTED, entityType: 'TELEGRAM_CONNECTION', metadata: { source: 'TELEGRAM' } });
        return { status: 'disconnected' };
    }
    async search(userId, query) {
        const connection = await this.connected(userId);
        try {
            const peers = await this.telegramClient.search(connection.encryptedSession, query.q, query.limit);
            return this.withContactMatches(userId, peers);
        }
        catch (error) {
            throw (0, telegram_errors_1.mapTelegramError)(error);
        }
    }
    async chats(userId, query) {
        const connection = await this.connected(userId);
        try {
            const peers = await this.telegramClient.chats(connection.encryptedSession, query.search, query.limit);
            return this.withContactMatches(userId, peers);
        }
        catch (error) {
            throw (0, telegram_errors_1.mapTelegramError)(error);
        }
    }
    async prepareTelegramMessage(userId, peerId, text) {
        const connection = await this.connected(userId);
        try {
            const recipient = await this.telegramClient.resolvePeer(connection.encryptedSession, peerId);
            return { recipient, text, confirmationRequired: true };
        }
        catch (error) {
            throw (0, telegram_errors_1.mapTelegramError)(error);
        }
    }
    async sendMessage(userId, peerId, text) {
        const connection = await this.connected(userId);
        try {
            const result = await this.telegramClient.sendMessage(connection.encryptedSession, peerId, text);
            await this.prisma.telegramConnection.update({ where: { userId }, data: { lastUsedAt: new Date() } });
            await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.TELEGRAM_MESSAGE_SENT, entityType: 'TELEGRAM_MESSAGE', metadata: { source: 'TELEGRAM', peerId, recipientType: result.recipient.type, recipientName: result.recipient.displayName } });
            return result;
        }
        catch (error) {
            throw (0, telegram_errors_1.mapTelegramError)(error);
        }
    }
    async sendSelfNotification(userId, text) {
        const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
        if (!connection?.telegramUserId) {
            throw new common_1.BadRequestException('Connected Telegram self-chat is unavailable');
        }
        return this.sendMessage(userId, connection.telegramUserId, text);
    }
    async finalizeConnection(userId, connection, session, account) {
        if (!account)
            throw new common_1.BadRequestException('Telegram account details were unavailable');
        await this.prisma.telegramConnection.update({
            where: { userId },
            data: {
                encryptedSession: this.crypto.encrypt(session),
                encryptedPhoneCodeHash: null,
                phoneNumber: connection.phoneNumber,
                telegramUserId: account.telegramUserId,
                username: account.username,
                displayName: account.displayName,
                status: client_1.TelegramConnectionStatus.CONNECTED,
                connectedAt: new Date(),
                lastUsedAt: new Date(),
            },
        });
        await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.TELEGRAM_CONNECTED, entityType: 'TELEGRAM_CONNECTION', metadata: { source: 'TELEGRAM', telegramUserId: account.telegramUserId, username: account.username } });
    }
    async connected(userId) {
        const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
        if (!connection || connection.status !== client_1.TelegramConnectionStatus.CONNECTED || !connection.encryptedSession)
            throw new common_1.BadRequestException('Telegram account is not connected');
        return { ...connection, encryptedSession: this.crypto.decrypt(connection.encryptedSession) };
    }
    async getPendingConnection(userId, status) {
        const connection = await this.prisma.telegramConnection.findUnique({ where: { userId } });
        if (!connection || connection.status !== status || !connection.encryptedSession)
            throw new common_1.BadRequestException('Telegram login state is unavailable');
        return connection;
    }
    decryptRequired(value) {
        if (!value)
            throw new common_1.BadRequestException('Telegram login state is unavailable');
        return value;
    }
    async markError(userId) {
        await this.prisma.telegramConnection.updateMany({ where: { userId }, data: { status: client_1.TelegramConnectionStatus.ERROR } });
    }
    handleAuthError(userId, error) {
        const mapped = (0, telegram_errors_1.mapTelegramError)(error);
        if (mapped.getStatus() >= 500)
            void this.markError(userId);
        return mapped;
    }
    async withContactMatches(userId, peers) {
        return Promise.all(peers.map(async (peer) => {
            const username = peer.username?.replace(/^@/, '').toLocaleLowerCase();
            if (!username)
                return peer;
            const result = await this.contactsService.listForUser(userId, { search: username, page: 1, limit: 20 });
            const exact = result.items.find((contact) => contact.telegramUsername?.replace(/^@/, '').toLocaleLowerCase() === username);
            return exact ? { ...peer, contactId: exact.id } : peer;
        }));
    }
};
exports.TelegramIntegrationService = TelegramIntegrationService;
exports.TelegramIntegrationService = TelegramIntegrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_crypto_service_1.TelegramCryptoService,
        telegram_client_service_1.TelegramClientService,
        contacts_service_1.ContactsService,
        activity_log_service_1.ActivityLogService])
], TelegramIntegrationService);
//# sourceMappingURL=telegram-integration.service.js.map