"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const common_module_1 = require("../common/common.module");
const activity_log_module_1 = require("../activity-log/activity-log.module");
const users_module_1 = require("../users/users.module");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const email_delivery_adapter_1 = require("./password-reset/email-delivery.adapter");
const noop_email_delivery_adapter_1 = require("./password-reset/noop-email-delivery.adapter");
const password_reset_rate_limiter_service_1 = require("./password-reset/password-reset-rate-limiter.service");
const password_reset_service_1 = require("./password-reset/password-reset.service");
const login_brute_force_service_1 = require("./login-brute-force.service");
const auth_security_audit_service_1 = require("./auth-security-audit.service");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [common_module_1.CommonModule, users_module_1.UsersModule, activity_log_module_1.ActivityLogModule],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            password_reset_service_1.PasswordResetService,
            password_reset_rate_limiter_service_1.PasswordResetRateLimiterService,
            login_brute_force_service_1.LoginBruteForceService,
            auth_security_audit_service_1.AuthSecurityAuditService,
            noop_email_delivery_adapter_1.NoopEmailDeliveryAdapter,
            { provide: email_delivery_adapter_1.EMAIL_DELIVERY_ADAPTER, useExisting: noop_email_delivery_adapter_1.NoopEmailDeliveryAdapter },
        ],
        exports: [auth_service_1.AuthService, password_reset_service_1.PasswordResetService],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map