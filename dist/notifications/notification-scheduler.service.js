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
exports.NotificationSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationSchedulerService = class NotificationSchedulerService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    scheduleTaskNotification(userId, task) {
        return this.replaceEntityNotifications(userId, 'TASK', task.id, task.dueDate && task.status !== 'COMPLETED' ? [{
                type: client_1.NotificationType.TASK,
                title: `Vazifa: ${task.title}`,
                message: 'Vazifa muddati keldi.',
                entityType: 'TASK', entityId: task.id, scheduledAt: task.dueDate,
            }] : []);
    }
    scheduleReminderNotification(userId, reminder) {
        return this.replaceEntityNotifications(userId, 'REMINDER', reminder.id, reminder.status === 'ACTIVE' ? [{
                type: client_1.NotificationType.REMINDER,
                title: `Eslatma: ${reminder.title}`,
                message: reminder.description || 'Eslatma vaqti keldi.',
                entityType: 'REMINDER', entityId: reminder.id, scheduledAt: reminder.remindAt,
            }] : []);
    }
    async scheduleMeetingNotification(userId, meeting) {
        const preference = await this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
        const minutes = meeting.reminderMinutesBefore ?? preference.defaultMeetingMinutesBefore;
        const drafts = [];
        if (meeting.status !== 'CANCELLED' && meeting.status !== 'COMPLETED') {
            const reminderAt = new Date(meeting.startsAt.getTime() - minutes * 60_000);
            if (minutes > 0)
                drafts.push({
                    type: client_1.NotificationType.MEETING,
                    title: `Uchrashuv yaqin: ${meeting.title}`,
                    message: `${minutes} daqiqadan keyin uchrashuv boshlanadi.`,
                    entityType: 'MEETING', entityId: meeting.id, scheduledAt: reminderAt,
                    metadata: { kind: 'REMINDER', minutesBefore: minutes },
                });
            drafts.push({
                type: client_1.NotificationType.MEETING,
                title: `Uchrashuv: ${meeting.title}`,
                message: 'Uchrashuv boshlanmoqda.',
                entityType: 'MEETING', entityId: meeting.id, scheduledAt: meeting.startsAt,
                metadata: { kind: 'START' },
            });
        }
        return this.replaceEntityNotifications(userId, 'MEETING', meeting.id, drafts);
    }
    cancelEntityNotifications(userId, entityType, entityId) {
        return this.prisma.notification.updateMany({
            where: { userId, entityType, entityId, status: 'PENDING' },
            data: { status: 'CANCELLED', claimedAt: null, claimToken: null },
        });
    }
    async rescheduleEntityNotifications(userId, entityType, entityId, drafts) {
        await this.cancelEntityNotifications(userId, entityType, entityId);
        return this.replaceEntityNotifications(userId, entityType, entityId, drafts, true);
    }
    async replaceEntityNotifications(userId, entityType, entityId, drafts, alreadyCancelled = false) {
        if (!alreadyCancelled)
            await this.cancelEntityNotifications(userId, entityType, entityId);
        if (!drafts.length)
            return [];
        const preference = await this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
        const channels = drafts.length ? await this.channelsFor(drafts[0].type, preference, userId) : [];
        if (!channels.length)
            return [];
        const rows = drafts.flatMap((draft) => channels.map((channel) => ({
            userId,
            ...draft,
            title: this.sanitize(draft.title),
            message: this.sanitize(draft.message),
            channel,
            metadata: draft.metadata,
        })));
        return this.prisma.$transaction(rows.map((data) => this.prisma.notification.create({ data })));
    }
    async channelsFor(type, preference, userId) {
        const enabled = type === client_1.NotificationType.TASK ? preference.taskEnabled
            : type === client_1.NotificationType.REMINDER ? preference.reminderEnabled
                : type === client_1.NotificationType.MEETING ? preference.meetingEnabled
                    : type === client_1.NotificationType.AI ? preference.aiEnabled : true;
        if (!enabled)
            return [];
        const channels = [client_1.NotificationChannel.IN_APP];
        if (preference.telegramEnabled) {
            const connection = await this.prisma.telegramConnection.findUnique({ where: { userId }, select: { status: true, telegramUserId: true } });
            if (connection?.status === client_1.TelegramConnectionStatus.CONNECTED && connection.telegramUserId)
                channels.push(client_1.NotificationChannel.TELEGRAM);
        }
        if (preference.webPushEnabled)
            channels.push(client_1.NotificationChannel.WEB_PUSH);
        return channels;
    }
    sanitize(value) {
        return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    }
};
exports.NotificationSchedulerService = NotificationSchedulerService;
exports.NotificationSchedulerService = NotificationSchedulerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationSchedulerService);
//# sourceMappingURL=notification-scheduler.service.js.map