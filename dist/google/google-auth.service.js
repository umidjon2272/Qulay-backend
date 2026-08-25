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
var GoogleAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAuthService = exports.GOOGLE_SCOPES = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const prisma_service_1 = require("../prisma/prisma.service");
const google_api_client_service_1 = require("./google-api-client.service");
const google_crypto_service_1 = require("./google-crypto.service");
const google_errors_1 = require("./google.errors");
exports.GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
];
let GoogleAuthService = GoogleAuthService_1 = class GoogleAuthService {
    constructor(config, prisma, crypto, api, activityLog) {
        this.config = config;
        this.prisma = prisma;
        this.crypto = crypto;
        this.api = api;
        this.activityLog = activityLog;
        this.logger = new common_1.Logger(GoogleAuthService_1.name);
        this.refreshes = new Map();
        this.usedStates = new Map();
    }
    connectUrl(userId) {
        this.purgeStates();
        const state = this.signState({ userId, nonce: (0, node_crypto_1.randomBytes)(18).toString('base64url'), expiresAt: Date.now() + 10 * 60_000 });
        const params = new URLSearchParams({
            client_id: this.config.getOrThrow('google.clientId'),
            redirect_uri: this.config.getOrThrow('google.redirectUri'),
            response_type: 'code',
            access_type: 'offline',
            prompt: 'consent',
            include_granted_scopes: 'true',
            scope: exports.GOOGLE_SCOPES.join(' '),
            state,
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    async callback(code, stateValue, oauthError) {
        if (oauthError)
            throw new google_errors_1.GoogleAdapterError('OAUTH_CANCELLED');
        const state = this.verifyState(stateValue);
        if (!code)
            throw new google_errors_1.GoogleAdapterError('INVALID_REQUEST');
        const token = await this.exchangeCode(code);
        const profile = await this.api.request('https://www.googleapis.com/oauth2/v3/userinfo', token.access_token, { resource: 'oauth' });
        if (!profile.sub)
            throw new google_errors_1.GoogleAdapterError('INVALID_REQUEST');
        const existing = await this.prisma.googleConnection.findUnique({ where: { userId: state.userId } });
        const scopes = token.scope?.split(' ').filter(Boolean) ?? [...exports.GOOGLE_SCOPES];
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
                status: client_1.GoogleConnectionStatus.CONNECTED,
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
                status: client_1.GoogleConnectionStatus.CONNECTED,
                connectedAt: new Date(),
            },
        });
        await this.activityLog.record({ userId: state.userId, action: activity_log_service_1.ACTIVITY_ACTIONS.GOOGLE_CONNECTED, entityType: 'GOOGLE_CONNECTION', metadata: { scopes } });
    }
    async getAccessToken(userId) {
        const connection = await this.prisma.googleConnection.findUnique({ where: { userId } });
        if (!connection || connection.status === client_1.GoogleConnectionStatus.ERROR) {
            throw new google_errors_1.GoogleAdapterError('TOKEN_REVOKED');
        }
        if (connection.status !== client_1.GoogleConnectionStatus.CONNECTED || !connection.encryptedAccessToken) {
            throw new google_errors_1.GoogleAdapterError('NOT_CONNECTED');
        }
        if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() > Date.now() + 30_000) {
            await this.touch(connection.id);
            return this.crypto.decrypt(connection.encryptedAccessToken);
        }
        const ongoing = this.refreshes.get(userId);
        if (ongoing)
            return ongoing;
        const refresh = this.refreshAccessToken(userId, connection).finally(() => this.refreshes.delete(userId));
        this.refreshes.set(userId, refresh);
        return refresh;
    }
    async status(userId) {
        const connection = await this.prisma.googleConnection.findUnique({ where: { userId } });
        const connected = connection?.status === client_1.GoogleConnectionStatus.CONNECTED;
        const scopes = new Set(connection?.scopes ?? []);
        return {
            connected,
            email: connection?.email ?? null,
            displayName: connection?.displayName ?? null,
            connectedAt: connection?.connectedAt?.toISOString() ?? null,
            calendarEnabled: connected && scopes.has('https://www.googleapis.com/auth/calendar.readonly') && scopes.has('https://www.googleapis.com/auth/calendar.events'),
            driveEnabled: connected && scopes.has('https://www.googleapis.com/auth/drive.metadata.readonly') && scopes.has('https://www.googleapis.com/auth/drive.readonly'),
        };
    }
    async disconnect(userId) {
        const connection = await this.prisma.googleConnection.findUnique({ where: { userId } });
        if (connection?.encryptedAccessToken) {
            try {
                const accessToken = this.crypto.decrypt(connection.encryptedAccessToken);
                await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: 'POST' });
            }
            catch (error) {
                this.logger.warn(`Google token revoke failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`);
            }
        }
        if (connection) {
            await this.prisma.googleConnection.update({
                where: { userId },
                data: { encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null, status: client_1.GoogleConnectionStatus.DISCONNECTED, connectedAt: null, lastUsedAt: null, scopes: [] },
            });
        }
        await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.GOOGLE_DISCONNECTED, entityType: 'GOOGLE_CONNECTION' });
        return { status: 'disconnected' };
    }
    async refreshAccessToken(userId, connection) {
        if (!connection.encryptedRefreshToken) {
            await this.markError(connection.userId);
            throw new google_errors_1.GoogleAdapterError('TOKEN_REVOKED');
        }
        let refreshToken;
        try {
            refreshToken = this.crypto.decrypt(connection.encryptedRefreshToken);
        }
        catch {
            await this.markError(userId);
            throw new google_errors_1.GoogleAdapterError('TOKEN_REVOKED');
        }
        try {
            const result = await this.tokenRequest({ client_id: this.config.getOrThrow('google.clientId'), client_secret: this.config.getOrThrow('google.clientSecret'), grant_type: 'refresh_token', refresh_token: refreshToken });
            const payload = result.payload;
            const response = result.response;
            if (!response.ok || !payload.access_token) {
                await this.markError(userId);
                throw new google_errors_1.GoogleAdapterError(payload.error === 'invalid_grant' ? 'TOKEN_REVOKED' : 'UNAVAILABLE', response.status);
            }
            await this.prisma.googleConnection.update({ where: { userId }, data: { encryptedAccessToken: this.crypto.encrypt(payload.access_token), accessTokenExpiresAt: this.expiry(payload.expires_in), status: client_1.GoogleConnectionStatus.CONNECTED, lastUsedAt: new Date() } });
            return payload.access_token;
        }
        catch (error) {
            if (error instanceof google_errors_1.GoogleAdapterError)
                throw error;
            await this.markError(userId);
            throw new google_errors_1.GoogleAdapterError('UNAVAILABLE');
        }
    }
    async exchangeCode(code) {
        const result = await this.tokenRequest({ code, client_id: this.config.getOrThrow('google.clientId'), client_secret: this.config.getOrThrow('google.clientSecret'), redirect_uri: this.config.getOrThrow('google.redirectUri'), grant_type: 'authorization_code' });
        const response = result.response;
        const payload = result.payload;
        if (!response.ok || !payload.access_token)
            throw new google_errors_1.GoogleAdapterError('UNAVAILABLE', response.status);
        return payload;
    }
    async tokenRequest(body) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const response = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString(),
                });
                const payload = await response.json();
                if ((0, google_errors_1.isRetryableGoogleStatus)(response.status) && attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, (0, google_errors_1.retryAfterMs)(attempt)));
                    continue;
                }
                return { response, payload };
            }
            catch {
                if (attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, (0, google_errors_1.retryAfterMs)(attempt)));
                    continue;
                }
                throw new google_errors_1.GoogleAdapterError('UNAVAILABLE');
            }
        }
        throw new google_errors_1.GoogleAdapterError('UNAVAILABLE');
    }
    signState(payload) {
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
        return `${encoded}.${(0, node_crypto_1.createHmac)('sha256', this.stateSecret()).update(encoded).digest('base64url')}`;
    }
    verifyState(value) {
        try {
            if (!value)
                throw new Error('missing');
            const [encoded, signature] = value.split('.');
            const expected = (0, node_crypto_1.createHmac)('sha256', this.stateSecret()).update(encoded).digest('base64url');
            if (!signature || signature.length !== expected.length || !(0, node_crypto_1.timingSafeEqual)(Buffer.from(signature), Buffer.from(expected)))
                throw new Error('signature');
            const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
            if (!payload.userId || !payload.nonce || payload.expiresAt < Date.now() || this.usedStates.has(payload.nonce))
                throw new Error('expired');
            this.usedStates.set(payload.nonce, payload.expiresAt);
            return payload;
        }
        catch {
            throw new google_errors_1.GoogleAdapterError('INVALID_STATE');
        }
    }
    stateSecret() {
        return `${this.config.getOrThrow('google.clientSecret')}:${this.config.getOrThrow('jwt.accessSecret')}`;
    }
    purgeStates() {
        const now = Date.now();
        for (const [nonce, expiresAt] of this.usedStates)
            if (expiresAt < now)
                this.usedStates.delete(nonce);
    }
    expiry(expiresIn) {
        return new Date(Date.now() + (expiresIn ?? 3600) * 1000);
    }
    touch(id) {
        return this.prisma.googleConnection.update({ where: { id }, data: { lastUsedAt: new Date() } });
    }
    markError(userId) {
        return this.prisma.googleConnection.update({ where: { userId }, data: { status: client_1.GoogleConnectionStatus.ERROR } });
    }
};
exports.GoogleAuthService = GoogleAuthService;
exports.GoogleAuthService = GoogleAuthService = GoogleAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        google_crypto_service_1.GoogleCryptoService,
        google_api_client_service_1.GoogleApiClientService,
        activity_log_service_1.ActivityLogService])
], GoogleAuthService);
//# sourceMappingURL=google-auth.service.js.map