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
var AuthSecurityAuditService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthSecurityAuditService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const activity_log_service_1 = require("../activity-log/activity-log.service");
let AuthSecurityAuditService = AuthSecurityAuditService_1 = class AuthSecurityAuditService {
    constructor(activityLog) {
        this.activityLog = activityLog;
        this.logger = new common_1.Logger(AuthSecurityAuditService_1.name);
    }
    async recordUserAction(userId, action, reason) {
        try {
            await this.activityLog.record({
                userId,
                action,
                entityType: 'AUTH',
                metadata: reason ? { reason } : undefined,
            });
        }
        catch {
            this.logger.warn(`Unable to persist auth activity: ${action}`);
        }
    }
    recordSuspicious(action, ip, normalizedEmail) {
        const identifierFingerprint = (0, node_crypto_1.createHash)('sha256').update(normalizedEmail).digest('hex').slice(0, 16);
        this.logger.warn(`Suspicious auth activity action=${action} ip=${ip || 'unknown'} identifier=${identifierFingerprint}`);
    }
};
exports.AuthSecurityAuditService = AuthSecurityAuditService;
AuthSecurityAuditService.actions = {
    LOGIN_FAILED: activity_log_service_1.ACTIVITY_ACTIONS.LOGIN_FAILED,
    LOGIN_SUCCEEDED: activity_log_service_1.ACTIVITY_ACTIONS.LOGIN_SUCCEEDED,
    LOGIN_BLOCKED: activity_log_service_1.ACTIVITY_ACTIONS.LOGIN_BLOCKED,
    REGISTERED: activity_log_service_1.ACTIVITY_ACTIONS.REGISTERED,
    REGISTER_FAILED: activity_log_service_1.ACTIVITY_ACTIONS.REGISTER_FAILED,
    REFRESH_SUCCEEDED: activity_log_service_1.ACTIVITY_ACTIONS.REFRESH_SUCCEEDED,
    LOGOUT_COMPLETED: activity_log_service_1.ACTIVITY_ACTIONS.LOGOUT_COMPLETED,
    PASSWORD_CHANGED: activity_log_service_1.ACTIVITY_ACTIONS.PASSWORD_CHANGED,
};
exports.AuthSecurityAuditService = AuthSecurityAuditService = AuthSecurityAuditService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [activity_log_service_1.ActivityLogService])
], AuthSecurityAuditService);
//# sourceMappingURL=auth-security-audit.service.js.map