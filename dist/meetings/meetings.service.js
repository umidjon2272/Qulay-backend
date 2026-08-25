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
exports.MeetingsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const date_utils_1 = require("../common/date.utils");
const prisma_service_1 = require("../prisma/prisma.service");
const notification_scheduler_service_1 = require("../notifications/notification-scheduler.service");
let MeetingsService = class MeetingsService {
    constructor(prisma, activityLog, notificationScheduler) {
        this.prisma = prisma;
        this.activityLog = activityLog;
        this.notificationScheduler = notificationScheduler;
    }
    async listForUser(userId, query) {
        const startsAt = {};
        if (query.date) {
            Object.assign(startsAt, (0, date_utils_1.utcDayRange)(query.date));
        }
        if (query.from) {
            startsAt.gte = (0, date_utils_1.parseDateTime)(query.from);
        }
        if (query.to) {
            startsAt.lt = (0, date_utils_1.parseDateTime)(query.to);
        }
        if (startsAt.gte && startsAt.lt && startsAt.gte >= startsAt.lt) {
            throw new common_1.BadRequestException('from must be before to');
        }
        const where = {
            userId,
            status: query.status,
            ...(Object.keys(startsAt).length > 0 ? { startsAt } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.meeting.findMany({
                where,
                orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.meeting.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getForUser(userId, id) {
        const meeting = await this.prisma.meeting.findFirst({ where: { id, userId } });
        if (!meeting) {
            throw new common_1.NotFoundException('Meeting was not found');
        }
        return meeting;
    }
    async createForUser(userId, dto) {
        await this.assertContactOwnership(userId, dto.contactId);
        const startsAt = (0, date_utils_1.parseDateTime)(dto.startsAt);
        const endsAt = (0, date_utils_1.parseDateTime)(dto.endsAt);
        this.assertTimeOrder(startsAt, endsAt);
        const meeting = await this.prisma.meeting.create({
            data: {
                userId,
                title: dto.title,
                description: dto.description,
                participant: dto.participant,
                location: dto.location,
                startsAt,
                endsAt,
                reminderMinutesBefore: dto.reminderMinutesBefore ?? 15,
                status: dto.status ?? client_1.MeetingStatus.SCHEDULED,
                contactId: dto.contactId,
            },
        });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.MEETING_CREATED,
            entityType: 'MEETING',
            entityId: meeting.id,
        });
        await this.notificationScheduler?.scheduleMeetingNotification(userId, meeting);
        return meeting;
    }
    async updateForUser(userId, id, dto) {
        const current = await this.getForUser(userId, id);
        await this.assertContactOwnership(userId, dto.contactId);
        const startsAt = dto.startsAt ? (0, date_utils_1.parseDateTime)(dto.startsAt) : current.startsAt;
        const endsAt = dto.endsAt ? (0, date_utils_1.parseDateTime)(dto.endsAt) : current.endsAt;
        this.assertTimeOrder(startsAt, endsAt);
        const meeting = await this.prisma.meeting.update({
            where: { id: current.id },
            data: {
                title: dto.title,
                description: dto.description,
                participant: dto.participant,
                location: dto.location,
                startsAt: dto.startsAt ? startsAt : undefined,
                endsAt: dto.endsAt ? endsAt : undefined,
                reminderMinutesBefore: dto.reminderMinutesBefore,
                status: dto.status,
                contactId: dto.contactId,
            },
        });
        await this.notificationScheduler?.scheduleMeetingNotification(userId, meeting);
        return meeting;
    }
    async deleteForUser(userId, id) {
        await this.getForUser(userId, id);
        await this.prisma.meeting.delete({ where: { id } });
        await this.notificationScheduler?.cancelEntityNotifications(userId, 'MEETING', id);
        return { message: 'Meeting deleted successfully' };
    }
    async cancelForUser(userId, id) {
        await this.getForUser(userId, id);
        const meeting = await this.prisma.meeting.update({
            where: { id },
            data: { status: client_1.MeetingStatus.CANCELLED },
        });
        await this.notificationScheduler?.cancelEntityNotifications(userId, 'MEETING', id);
        return meeting;
    }
    assertTimeOrder(startsAt, endsAt) {
        if (endsAt <= startsAt) {
            throw new common_1.BadRequestException('endsAt must be after startsAt');
        }
    }
    async assertContactOwnership(userId, contactId) {
        if (!contactId) {
            return;
        }
        const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId } });
        if (!contact) {
            throw new common_1.NotFoundException('Contact was not found');
        }
    }
};
exports.MeetingsService = MeetingsService;
exports.MeetingsService = MeetingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService,
        notification_scheduler_service_1.NotificationSchedulerService])
], MeetingsService);
//# sourceMappingURL=meetings.service.js.map