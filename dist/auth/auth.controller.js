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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const auth_service_1 = require("./auth.service");
const forgot_password_dto_1 = require("./dto/forgot-password.dto");
const reset_password_dto_1 = require("./dto/reset-password.dto");
const password_reset_service_1 = require("./password-reset/password-reset.service");
const change_password_dto_1 = require("./dto/change-password.dto");
const login_dto_1 = require("./dto/login.dto");
const refresh_token_dto_1 = require("./dto/refresh-token.dto");
const register_dto_1 = require("./dto/register.dto");
const security_rate_limit_service_1 = require("../common/security/security-rate-limit.service");
const rate_limit_exception_1 = require("../common/security/rate-limit.exception");
const security_limits_constants_1 = require("../common/security/security-limits.constants");
let AuthController = class AuthController {
    constructor(authService, passwordResetService, rateLimiter) {
        this.authService = authService;
        this.passwordResetService = passwordResetService;
        this.rateLimiter = rateLimiter;
    }
    forgotPassword(dto, request) {
        return this.passwordResetService.forgotPassword(dto, request.ip ?? 'unknown');
    }
    resetPassword(dto, request) {
        return this.passwordResetService.resetPassword(dto, request.ip ?? 'unknown');
    }
    register(dto, request) {
        const ip = request.ip ?? 'unknown';
        if (!this.rateLimiter.isAllowed('register-ip', ip, security_limits_constants_1.SECURITY_LIMITS.registerPerIp.max, security_limits_constants_1.SECURITY_LIMITS.registerPerIp.windowMs)
            || !this.rateLimiter.isAllowed('register-email', dto.email.trim().toLowerCase(), security_limits_constants_1.SECURITY_LIMITS.registerPerEmail.max, security_limits_constants_1.SECURITY_LIMITS.registerPerEmail.windowMs)) {
            throw new rate_limit_exception_1.RateLimitException('Too many registration attempts. Try again later.');
        }
        return this.authService.register(dto);
    }
    login(dto, request) {
        const ip = request.ip ?? 'unknown';
        if (!this.rateLimiter.isAllowed('login-ip', ip, security_limits_constants_1.SECURITY_LIMITS.loginPerIp.max, security_limits_constants_1.SECURITY_LIMITS.loginPerIp.windowMs)
            || !this.rateLimiter.isAllowed('login-email', dto.email.trim().toLowerCase(), security_limits_constants_1.SECURITY_LIMITS.loginPerEmail.max, security_limits_constants_1.SECURITY_LIMITS.loginPerEmail.windowMs)) {
            throw new rate_limit_exception_1.RateLimitException('Too many login attempts. Try again later.');
        }
        return this.authService.login(dto, ip);
    }
    refresh(dto) {
        return this.authService.refresh(dto);
    }
    logout(dto) {
        return this.authService.logout(dto);
    }
    me(user) {
        return this.authService.me(user);
    }
    changePassword(user, dto) {
        return this.authService.changePassword(user.sub, dto);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [forgot_password_dto_1.ForgotPasswordDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reset_password_dto_1.ResetPasswordDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Patch)('change-password'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, change_password_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "changePassword", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        password_reset_service_1.PasswordResetService,
        security_rate_limit_service_1.SecurityRateLimitService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map