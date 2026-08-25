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
exports.ActivityLogService = exports.ACTIVITY_ACTIONS = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
exports.ACTIVITY_ACTIONS = {
    TASK_CREATED: 'TASK_CREATED',
    TASK_COMPLETED: 'TASK_COMPLETED',
    REMINDER_CREATED: 'REMINDER_CREATED',
    MEETING_CREATED: 'MEETING_CREATED',
    NOTE_CREATED: 'NOTE_CREATED',
    CONTACT_CREATED: 'CONTACT_CREATED',
    CONTACT_UPDATED: 'CONTACT_UPDATED',
    CONTACT_DELETED: 'CONTACT_DELETED',
    MEMORY_CREATED: 'MEMORY_CREATED',
    MEMORY_UPDATED: 'MEMORY_UPDATED',
    MEMORY_DELETED: 'MEMORY_DELETED',
    FINANCE_TRANSACTION_CREATED: 'FINANCE_TRANSACTION_CREATED',
    FINANCE_TRANSACTION_UPDATED: 'FINANCE_TRANSACTION_UPDATED',
    FINANCE_TRANSACTION_DELETED: 'FINANCE_TRANSACTION_DELETED',
    FINANCE_CATEGORY_CREATED: 'FINANCE_CATEGORY_CREATED',
    FINANCE_CATEGORY_UPDATED: 'FINANCE_CATEGORY_UPDATED',
    FINANCE_CATEGORY_DELETED: 'FINANCE_CATEGORY_DELETED',
    AI_TOOL_EXECUTED: 'AI_TOOL_EXECUTED',
    TELEGRAM_CONNECTED: 'TELEGRAM_CONNECTED',
    TELEGRAM_DISCONNECTED: 'TELEGRAM_DISCONNECTED',
    TELEGRAM_MESSAGE_SENT: 'TELEGRAM_MESSAGE_SENT',
    NOTIFICATION_SENT: 'NOTIFICATION_SENT',
    NOTIFICATION_FAILED: 'NOTIFICATION_FAILED',
    GOOGLE_CONNECTED: 'GOOGLE_CONNECTED',
    GOOGLE_DISCONNECTED: 'GOOGLE_DISCONNECTED',
    GOOGLE_CALENDAR_EVENT_CREATED: 'GOOGLE_CALENDAR_EVENT_CREATED',
    GOOGLE_CALENDAR_EVENT_UPDATED: 'GOOGLE_CALENDAR_EVENT_UPDATED',
    GOOGLE_CALENDAR_EVENT_DELETED: 'GOOGLE_CALENDAR_EVENT_DELETED',
    FILE_UPLOADED: 'FILE_UPLOADED',
    FILE_DELETED: 'FILE_DELETED',
    PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
    PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGIN_SUCCEEDED: 'LOGIN_SUCCEEDED',
    LOGIN_BLOCKED: 'LOGIN_BLOCKED',
    REGISTERED: 'REGISTERED',
    REGISTER_FAILED: 'REGISTER_FAILED',
    REFRESH_SUCCEEDED: 'REFRESH_SUCCEEDED',
    LOGOUT_COMPLETED: 'LOGOUT_COMPLETED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
    FOLDER_CREATED: 'FOLDER_CREATED',
    FOLDER_UPDATED: 'FOLDER_UPDATED',
    FOLDER_DELETED: 'FOLDER_DELETED',
};
let ActivityLogService = class ActivityLogService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    record(input) {
        return this.prisma.activityLog.create({
            data: {
                userId: input.userId,
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                metadata: input.metadata,
            },
        });
    }
};
exports.ActivityLogService = ActivityLogService;
exports.ActivityLogService = ActivityLogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ActivityLogService);
//# sourceMappingURL=activity-log.service.js.map