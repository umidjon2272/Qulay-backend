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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PasswordResetService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetService = exports.FORGOT_PASSWORD_RESPONSE = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const node_crypto_1 = require("node:crypto");
const activity_log_service_1 = require("../../activity-log/activity-log.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const email_delivery_adapter_1 = require("./email-delivery.adapter");
const password_reset_rate_limiter_service_1 = require("./password-reset-rate-limiter.service");
const rate_limit_exception_1 = require("../../common/security/rate-limit.exception");
exports.FORGOT_PASSWORD_RESPONSE = {
    success: true,
    message: 'Agar bu email ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash ko‘rsatmasi yuboriladi.',
};
const INVALID_RESET_TOKEN_HASH = bcrypt.hashSync('invalid-password-reset-token', 10);
let PasswordResetService = PasswordResetService_1 = class PasswordResetService {
    constructor(prisma, configService, rateLimiter, emailAdapter) {
        this.prisma = prisma;
        this.configService = configService;
        this.rateLimiter = rateLimiter;
        this.emailAdapter = emailAdapter;
        this.logger = new common_1.Logger(PasswordResetService_1.name);
    }
    async forgotPassword(dto, ip) {
        const normalizedEmail = this.normalizeEmail(dto.email);
        const rawToken = (0, node_crypto_1.randomBytes)(48).toString('base64url');
        const tokenFingerprint = this.fingerprint(rawToken);
        const tokenHash = await bcrypt.hash(tokenFingerprint, this.saltRounds());
        const allowed = this.rateLimiter.isAllowed(ip, normalizedEmail);
        const user = allowed
            ? await this.prisma.user.findUnique({ where: { email: normalizedEmail } })
            : null;
        if (!user || user.status !== client_1.UserStatus.ACTIVE)
            return exports.FORGOT_PASSWORD_RESPONSE;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.expiresInMinutes() * 60 * 1000);
        try {
            await this.prisma.$transaction(async (transaction) => {
                await transaction.passwordResetToken.updateMany({
                    where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
                    data: { expiresAt: now },
                });
                await transaction.passwordResetToken.create({
                    data: { userId: user.id, tokenFingerprint, tokenHash, expiresAt },
                });
                await transaction.activityLog.create({
                    data: {
                        userId: user.id,
                        action: activity_log_service_1.ACTIVITY_ACTIONS.PASSWORD_RESET_REQUESTED,
                        entityType: 'PASSWORD_RESET',
                    },
                });
            });
            const resetUrl = `${this.frontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
            await this.emailAdapter.sendPasswordResetEmail({
                to: normalizedEmail,
                resetUrl,
                expiresInMinutes: this.expiresInMinutes(),
            });
        }
        catch {
            this.logger.error('Password reset request could not be completed');
        }
        return exports.FORGOT_PASSWORD_RESPONSE;
    }
    async resetPassword(dto, ip = 'unknown') {
        if (dto.newPassword !== dto.confirmPassword) {
            throw new common_1.BadRequestException('Parollar mos kelmaydi.');
        }
        const rawToken = dto.token;
        const tokenFingerprint = this.fingerprint(rawToken);
        if (!this.rateLimiter.isResetAllowed(ip, tokenFingerprint)) {
            throw new rate_limit_exception_1.RateLimitException('Too many password reset attempts');
        }
        let resetToken;
        try {
            resetToken = await this.prisma.passwordResetToken.findFirst({
                where: { tokenFingerprint },
                include: { user: true },
            });
        }
        catch {
            throw new common_1.InternalServerErrorException('Unable to reset password');
        }
        const hashMatches = await bcrypt.compare(tokenFingerprint, resetToken?.tokenHash ?? INVALID_RESET_TOKEN_HASH);
        const now = new Date();
        if (!resetToken || !hashMatches || resetToken.expiresAt <= now || resetToken.usedAt || resetToken.user.status !== client_1.UserStatus.ACTIVE) {
            throw new common_1.BadRequestException('Reset token yaroqsiz yoki muddati tugagan.');
        }
        const newPasswordHash = await bcrypt.hash(dto.newPassword, this.saltRounds());
        try {
            await this.prisma.$transaction(async (transaction) => {
                const claimed = await transaction.passwordResetToken.updateMany({
                    where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
                    data: { usedAt: now },
                });
                if (claimed.count !== 1)
                    throw new common_1.BadRequestException('Reset token yaroqsiz yoki muddati tugagan.');
                const updatedUser = await transaction.user.updateMany({
                    where: { id: resetToken.userId, status: client_1.UserStatus.ACTIVE },
                    data: { passwordHash: newPasswordHash },
                });
                if (updatedUser.count !== 1)
                    throw new common_1.BadRequestException('Reset token yaroqsiz yoki muddati tugagan.');
                await transaction.refreshToken.updateMany({
                    where: { userId: resetToken.userId, revokedAt: null },
                    data: { revokedAt: now },
                });
                await transaction.activityLog.create({
                    data: {
                        userId: resetToken.userId,
                        action: activity_log_service_1.ACTIVITY_ACTIONS.PASSWORD_RESET_COMPLETED,
                        entityType: 'PASSWORD_RESET',
                    },
                });
            });
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException)
                throw error;
            throw new common_1.InternalServerErrorException('Unable to reset password');
        }
        return { success: true, message: 'Parol muvaffaqiyatli yangilandi.' };
    }
    cleanupExpiredOrUsed() {
        const now = new Date();
        return this.prisma.passwordResetToken.deleteMany({
            where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] },
        });
    }
    normalizeEmail(email) { return email.trim().toLowerCase(); }
    fingerprint(token) { return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex'); }
    saltRounds() { return this.configService.get('bcryptSaltRounds', 12); }
    expiresInMinutes() { return this.configService.get('passwordResetExpiresMinutes', 30); }
    frontendUrl() { return this.configService.getOrThrow('frontendUrl').replace(/\/$/, ''); }
};
exports.PasswordResetService = PasswordResetService;
exports.PasswordResetService = PasswordResetService = PasswordResetService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(email_delivery_adapter_1.EMAIL_DELIVERY_ADAPTER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        password_reset_rate_limiter_service_1.PasswordResetRateLimiterService, Object])
], PasswordResetService);
//# sourceMappingURL=password-reset.service.js.map