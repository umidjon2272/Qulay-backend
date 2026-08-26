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
exports.TeleprotoTelegramClientService = exports.TelegramClientService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const teleproto_1 = require("teleproto");
const Utils_1 = require("teleproto/Utils");
const sessions_1 = require("teleproto/sessions");
const telegram_errors_1 = require("./telegram.errors");
class TelegramClientService {
}
exports.TelegramClientService = TelegramClientService;
let TeleprotoTelegramClientService = class TeleprotoTelegramClientService extends TelegramClientService {
    constructor(config) {
        super();
        this.apiId = config.get('telegram.apiId');
        this.apiHash = config.get('telegram.apiHash');
    }
    async beginLogin(phoneNumber) {
        const credentials = this.credentials();
        const client = this.client('');
        try {
            await client.connect();
            const result = await client.sendCode(credentials, phoneNumber);
            return { session: this.savedSession(client), phoneCodeHash: result.phoneCodeHash };
        }
        catch (error) {
            throw (0, telegram_errors_1.classifyTelegramError)(error);
        }
        finally {
            await client.disconnect().catch(() => undefined);
        }
    }
    async verifyCode(input) {
        const client = this.client(input.session);
        try {
            await client.connect();
            try {
                await client.invoke(new teleproto_1.Api.auth.SignIn({ phoneNumber: input.phoneNumber, phoneCodeHash: input.phoneCodeHash, phoneCode: input.code }));
            }
            catch (error) {
                const message = `${error.errorMessage ?? ''} ${error.message ?? ''}`.toUpperCase();
                if (message.includes('SESSION_PASSWORD_NEEDED'))
                    return { status: 'password_required', session: this.savedSession(client) };
                throw (0, telegram_errors_1.classifyTelegramError)(error);
            }
            return { status: 'connected', session: this.savedSession(client), account: await this.account(client) };
        }
        catch (error) {
            if (error instanceof telegram_errors_1.TelegramAdapterError)
                throw error;
            throw (0, telegram_errors_1.classifyTelegramError)(error);
        }
        finally {
            await client.disconnect().catch(() => undefined);
        }
    }
    async verifyPassword(input) {
        const credentials = this.credentials();
        const client = this.client(input.session);
        try {
            await client.connect();
            await client.signInWithPassword(credentials, { password: async () => input.password, onError: async () => true });
            return { session: this.savedSession(client), account: await this.account(client) };
        }
        catch (error) {
            if (error instanceof telegram_errors_1.TelegramAdapterError)
                throw error;
            throw (0, telegram_errors_1.classifyTelegramError)(error);
        }
        finally {
            await client.disconnect().catch(() => undefined);
        }
    }
    async logout(session) {
        const client = this.client(session);
        try {
            await client.connect();
            await client.logOut();
        }
        catch (error) {
            throw (0, telegram_errors_1.classifyTelegramError)(error);
        }
        finally {
            await client.disconnect().catch(() => undefined);
        }
    }
    async search(session, query, limit) {
        const peers = await this.listPeers(session, Math.min(100, Math.max(20, limit * 4)));
        const normalized = query.replace(/^@/, '').toLocaleLowerCase();
        return peers.filter((peer) => `${peer.displayName} ${peer.username ?? ''}`.toLocaleLowerCase().includes(normalized)).slice(0, limit);
    }
    async chats(session, search, limit) {
        const peers = await this.listPeers(session, Math.min(100, Math.max(limit, search ? 50 : limit)));
        if (!search)
            return peers.slice(0, limit);
        const normalized = search.toLocaleLowerCase();
        return peers.filter((peer) => `${peer.displayName} ${peer.username ?? ''}`.toLocaleLowerCase().includes(normalized)).slice(0, limit);
    }
    async resolvePeer(session, peerId) {
        const peers = await this.listPeers(session, 100);
        const peer = peers.find((item) => item.peerId === peerId);
        if (!peer)
            throw new telegram_errors_1.TelegramAdapterError('PEER_NOT_FOUND');
        return peer;
    }
    async sendMessage(session, peerId, text) {
        const client = this.client(session);
        try {
            await client.connect();
            const dialogs = await client.getDialogs({ limit: 100 });
            const dialog = dialogs.find((item) => item.entity && (0, Utils_1.getPeerId)(item.entity, true) === peerId);
            if (!dialog?.entity)
                throw new telegram_errors_1.TelegramAdapterError('PEER_NOT_FOUND');
            const message = await client.sendMessage(dialog.entity, { message: text });
            return { messageId: String(message.id), recipient: this.toPeer(dialog) };
        }
        catch (error) {
            if (error instanceof telegram_errors_1.TelegramAdapterError)
                throw error;
            const classified = (0, telegram_errors_1.classifyTelegramError)(error);
            throw classified.code === 'UNAVAILABLE' ? new telegram_errors_1.TelegramAdapterError('SEND_FAILED') : classified;
        }
        finally {
            await client.disconnect().catch(() => undefined);
        }
    }
    client(session) {
        const credentials = this.credentials();
        return new teleproto_1.TelegramClient(new sessions_1.StringSession(session), credentials.apiId, credentials.apiHash, {
            connectionRetries: 3, reconnectRetries: 2, floodSleepThreshold: 0, deviceModel: 'Qulay AI', appVersion: '1.0',
        });
    }
    credentials() {
        if (this.apiId === undefined || !this.apiHash) {
            throw new telegram_errors_1.TelegramAdapterError('NOT_CONFIGURED');
        }
        return { apiId: this.apiId, apiHash: this.apiHash };
    }
    savedSession(client) {
        return client.session.save();
    }
    async account(client) {
        const user = await client.getMe();
        return {
            telegramUserId: String(user.id), username: user.username ?? null,
            displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
            phoneNumber: user.phone ?? null,
        };
    }
    async listPeers(session, limit) {
        const client = this.client(session);
        try {
            await client.connect();
            const dialogs = await client.getDialogs({ limit });
            return dialogs.filter((dialog) => Boolean(dialog.entity)).map((dialog) => this.toPeer(dialog));
        }
        catch (error) {
            if (error instanceof telegram_errors_1.TelegramAdapterError)
                throw error;
            throw (0, telegram_errors_1.classifyTelegramError)(error);
        }
        finally {
            await client.disconnect().catch(() => undefined);
        }
    }
    toPeer(dialog) {
        const entity = dialog.entity;
        return {
            peerId: (0, Utils_1.getPeerId)(dialog.entity, true),
            type: dialog.isUser ? 'USER' : dialog.isChannel ? 'CHANNEL' : 'GROUP',
            displayName: dialog.title ?? dialog.name ?? ([entity.firstName, entity.lastName].filter(Boolean).join(' ') || 'Telegram chat'),
            username: entity.username ? `@${entity.username}` : null,
            lastActivity: dialog.date ? new Date(dialog.date * 1000).toISOString() : null,
        };
    }
};
exports.TeleprotoTelegramClientService = TeleprotoTelegramClientService;
exports.TeleprotoTelegramClientService = TeleprotoTelegramClientService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TeleprotoTelegramClientService);
//# sourceMappingURL=telegram-client.service.js.map