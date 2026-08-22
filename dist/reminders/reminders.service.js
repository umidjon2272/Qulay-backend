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
exports.RemindersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const date_utils_1 = require("../common/date.utils");
const prisma_service_1 = require("../prisma/prisma.service");
let RemindersService = class RemindersService {
    constructor(prisma, activityLog) {
        this.prisma = prisma;
        this.activityLog = activityLog;
    }
    async listForUser(userId, query) {
        if (query.active && query.completed) {
            throw new common_1.BadRequestException('active and completed filters cannot both be true');
        }
        const status = query.active
            ? client_1.ReminderStatus.ACTIVE
            : query.completed
                ? client_1.ReminderStatus.COMPLETED
                : undefined;
        const where = {
            userId,
            status,
            priority: query.priority,
            ...(query.date
                ? (() => {
                    const { start, end } = (0, date_utils_1.utcDayRange)(query.date);
                    return { remindAt: { gte: start, lt: end } };
                })()
                : {}),
            ...(query.search
                ? {
                    OR: [
                        { title: { contains: query.search.trim(), mode: 'insensitive' } },
                        { description: { contains: query.search.trim(), mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.reminder.findMany({
                where,
                orderBy: [{ remindAt: 'asc' }, { createdAt: 'desc' }],
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.reminder.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getForUser(userId, id) {
        const reminder = await this.prisma.reminder.findFirst({ where: { id, userId } });
        if (!reminder) {
            throw new common_1.NotFoundException('Reminder was not found');
        }
        return reminder;
    }
    async createForUser(userId, dto) {
        const status = dto.status ?? client_1.ReminderStatus.ACTIVE;
        const reminder = await this.prisma.reminder.create({
            data: {
                userId,
                title: dto.title,
                description: dto.description,
                remindAt: new Date(dto.remindAt),
                status,
                priority: dto.priority ?? client_1.TaskPriority.MEDIUM,
                completedAt: status === client_1.ReminderStatus.COMPLETED ? new Date() : undefined,
            },
        });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.REMINDER_CREATED,
            entityType: 'REMINDER',
            entityId: reminder.id,
        });
        return reminder;
    }
    async updateForUser(userId, id, dto) {
        const current = await this.getForUser(userId, id);
        const status = dto.status ?? current.status;
        return this.prisma.reminder.update({
            where: { id: current.id },
            data: {
                title: dto.title,
                description: dto.description,
                remindAt: dto.remindAt ? new Date(dto.remindAt) : undefined,
                status,
                priority: dto.priority,
                completedAt: status === client_1.ReminderStatus.COMPLETED
                    ? current.completedAt ?? new Date()
                    : null,
            },
        });
    }
    async deleteForUser(userId, id) {
        await this.getForUser(userId, id);
        await this.prisma.reminder.delete({ where: { id } });
        return { message: 'Reminder deleted successfully' };
    }
    async completeForUser(userId, id) {
        await this.getForUser(userId, id);
        return this.prisma.reminder.update({
            where: { id },
            data: { status: client_1.ReminderStatus.COMPLETED, completedAt: new Date() },
        });
    }
};
exports.RemindersService = RemindersService;
exports.RemindersService = RemindersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService])
], RemindersService);
//# sourceMappingURL=reminders.service.js.map