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
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationService = class NotificationService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listForUser(userId, query) {
        const where = {
            userId,
            type: query.type,
            status: query.unreadOnly ? client_1.NotificationStatus.SENT : { in: [client_1.NotificationStatus.SENT, client_1.NotificationStatus.READ] },
            ...(query.unreadOnly ? { readAt: null } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.notification.findMany({
                where,
                orderBy: [{ createdAt: 'desc' }],
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.notification.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    unreadCount(userId) {
        return this.prisma.notification.count({
            where: { userId, status: client_1.NotificationStatus.SENT, readAt: null },
        }).then((count) => ({ count }));
    }
    async markRead(userId, id) {
        const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
        if (!notification)
            throw new common_1.NotFoundException('Notification was not found');
        return this.prisma.notification.update({
            where: { id: notification.id },
            data: { status: notification.status === client_1.NotificationStatus.SENT ? client_1.NotificationStatus.READ : notification.status, readAt: new Date() },
        });
    }
    readAll(userId) {
        return this.prisma.notification.updateMany({
            where: { userId, status: client_1.NotificationStatus.SENT, readAt: null },
            data: { status: client_1.NotificationStatus.READ, readAt: new Date() },
        }).then(({ count }) => ({ count }));
    }
    async deleteForUser(userId, id) {
        const result = await this.prisma.notification.deleteMany({ where: { id, userId } });
        if (!result.count)
            throw new common_1.NotFoundException('Notification was not found');
        return { message: 'Notification deleted successfully' };
    }
    getPreferences(userId) {
        return this.prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId },
            update: {},
        });
    }
    updatePreferences(userId, dto) {
        return this.prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId, ...dto },
            update: { ...dto },
        });
    }
};
exports.NotificationService = NotificationService;
exports.NotificationService = NotificationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationService);
//# sourceMappingURL=notification.service.js.map