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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const telegram_dto_1 = require("./dto/telegram.dto");
const telegram_integration_service_1 = require("./telegram-integration.service");
const security_rate_limit_service_1 = require("../common/security/security-rate-limit.service");
const rate_limit_exception_1 = require("../common/security/rate-limit.exception");
let TelegramController = class TelegramController {
    constructor(telegram, rateLimiter) {
        this.telegram = telegram;
        this.rateLimiter = rateLimiter;
    }
    connect(user, dto) {
        this.assertAllowed('telegram-connect', user.sub, 10);
        return this.telegram.connect(user.sub, dto.phoneNumber);
    }
    verifyCode(user, dto) {
        this.assertAllowed('telegram-verify-code', user.sub, 10);
        return this.telegram.verifyCode(user.sub, dto.code);
    }
    verifyPassword(user, dto) {
        this.assertAllowed('telegram-verify-password', user.sub, 10);
        return this.telegram.verifyPassword(user.sub, dto.password);
    }
    status(user) {
        return this.telegram.status(user.sub);
    }
    disconnect(user) {
        return this.telegram.disconnect(user.sub);
    }
    search(user, query) {
        return this.telegram.search(user.sub, query);
    }
    chats(user, query) {
        return this.telegram.chats(user.sub, query);
    }
    async send(user, dto) {
        const preview = await this.telegram.prepareTelegramMessage(user.sub, dto.peerId, dto.text);
        if (!dto.confirmed)
            return { status: 'confirmation_required', preview };
        const result = await this.telegram.sendMessage(user.sub, dto.peerId, dto.text);
        return { status: 'sent', messageId: result.messageId };
    }
    assertAllowed(scope, userId, maxAttempts) {
        if (!this.rateLimiter.isAllowed(scope, userId, maxAttempts, 15 * 60 * 1000)) {
            throw new rate_limit_exception_1.RateLimitException('Too many integration attempts. Try again later.');
        }
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Post)('connect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_dto_1.ConnectTelegramDto]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "connect", null);
__decorate([
    (0, common_1.Post)('verify-code'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_dto_1.VerifyTelegramCodeDto]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "verifyCode", null);
__decorate([
    (0, common_1.Post)('verify-password'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_dto_1.VerifyTelegramPasswordDto]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "verifyPassword", null);
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "status", null);
__decorate([
    (0, common_1.Delete)('disconnect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_dto_1.TelegramSearchQueryDto]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('chats'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_dto_1.TelegramChatsQueryDto]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "chats", null);
__decorate([
    (0, common_1.Post)('send'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_dto_1.SendTelegramMessageDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "send", null);
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('integrations/telegram'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [telegram_integration_service_1.TelegramIntegrationService, security_rate_limit_service_1.SecurityRateLimitService])
], TelegramController);
//# sourceMappingURL=telegram.controller.js.map