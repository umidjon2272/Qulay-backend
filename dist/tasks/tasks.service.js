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
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const date_utils_1 = require("../common/date.utils");
const prisma_service_1 = require("../prisma/prisma.service");
const notification_scheduler_service_1 = require("../notifications/notification-scheduler.service");
let TasksService = class TasksService {
    constructor(prisma, activityLog, notificationScheduler) {
        this.prisma = prisma;
        this.activityLog = activityLog;
        this.notificationScheduler = notificationScheduler;
    }
    async listForUser(userId, query) {
        const where = {
            userId,
            status: query.status,
            priority: query.priority,
            ...(query.date
                ? (() => {
                    const { start, end } = (0, date_utils_1.utcDayRange)(query.date);
                    return { dueDate: { gte: start, lt: end } };
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
            this.prisma.task.findMany({
                where,
                orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.task.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getForUser(userId, id) {
        const task = await this.prisma.task.findFirst({ where: { id, userId } });
        if (!task) {
            throw new common_1.NotFoundException('Task was not found');
        }
        return task;
    }
    async createForUser(userId, dto) {
        const status = dto.status ?? client_1.TaskStatus.TODO;
        const task = await this.prisma.task.create({
            data: {
                userId,
                title: dto.title,
                description: dto.description,
                status,
                priority: dto.priority ?? client_1.TaskPriority.MEDIUM,
                dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
                completedAt: status === client_1.TaskStatus.COMPLETED ? new Date() : undefined,
            },
        });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.TASK_CREATED,
            entityType: 'TASK',
            entityId: task.id,
        });
        await this.notificationScheduler?.scheduleTaskNotification(userId, task);
        return task;
    }
    async updateForUser(userId, id, dto) {
        const current = await this.getForUser(userId, id);
        const status = dto.status ?? current.status;
        const task = await this.prisma.task.update({
            where: { id: current.id },
            data: {
                title: dto.title,
                description: dto.description,
                priority: dto.priority,
                dueDate: dto.dueDate === undefined ? undefined : new Date(dto.dueDate),
                status,
                completedAt: status === client_1.TaskStatus.COMPLETED
                    ? current.completedAt ?? new Date()
                    : null,
            },
        });
        await this.notificationScheduler?.scheduleTaskNotification(userId, task);
        return task;
    }
    async deleteForUser(userId, id) {
        await this.getForUser(userId, id);
        await this.prisma.task.delete({ where: { id } });
        await this.notificationScheduler?.cancelEntityNotifications(userId, 'TASK', id);
        return { message: 'Task deleted successfully' };
    }
    async completeForUser(userId, id) {
        await this.getForUser(userId, id);
        const task = await this.prisma.task.update({
            where: { id },
            data: { status: client_1.TaskStatus.COMPLETED, completedAt: new Date() },
        });
        await this.notificationScheduler?.cancelEntityNotifications(userId, 'TASK', id);
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.TASK_COMPLETED,
            entityType: 'TASK',
            entityId: task.id,
        });
        return task;
    }
    async reopenForUser(userId, id) {
        await this.getForUser(userId, id);
        return this.prisma.task.update({
            where: { id },
            data: { status: client_1.TaskStatus.TODO, completedAt: null },
        }).then(async (task) => {
            await this.notificationScheduler?.scheduleTaskNotification(userId, task);
            return task;
        });
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService,
        notification_scheduler_service_1.NotificationSchedulerService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map