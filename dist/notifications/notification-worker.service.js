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
var NotificationWorkerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationWorkerService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const prisma_service_1 = require("../prisma/prisma.service");
const notification_delivery_service_1 = require("./notification-delivery.service");
let NotificationWorkerService = NotificationWorkerService_1 = class NotificationWorkerService {
    constructor(prisma, delivery, activityLog) {
        this.prisma = prisma;
        this.delivery = delivery;
        this.activityLog = activityLog;
        this.logger = new common_1.Logger(NotificationWorkerService_1.name);
        this.running = false;
        this.batchSize = 50;
        this.intervalMs = 45_000;
        this.leaseMs = 120_000;
    }
    onModuleInit() {
        this.timer = setInterval(() => void this.processDueNotifications(), this.intervalMs);
        void this.processDueNotifications();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    health() {
        return { status: this.timer ? 'running' : 'stopped' };
    }
    async processDueNotifications(now = new Date()) {
        if (this.running)
            return 0;
        this.running = true;
        let processed = 0;
        try {
            const candidates = await this.prisma.notification.findMany({
                where: {
                    status: client_1.NotificationStatus.PENDING,
                    scheduledAt: { lte: now },
                    AND: [{ OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] }, { OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - this.leaseMs) } }] }],
                },
                orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
                take: this.batchSize,
            });
            for (const candidate of candidates) {
                const claimToken = (0, node_crypto_1.randomUUID)();
                const claimed = await this.prisma.notification.updateMany({
                    where: { id: candidate.id, status: client_1.NotificationStatus.PENDING, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - this.leaseMs) } }] },
                    data: { claimedAt: now, claimToken },
                });
                if (!claimed.count)
                    continue;
                try {
                    await this.delivery.deliver({ ...candidate, claimedAt: now, claimToken });
                    await this.prisma.notification.updateMany({ where: { id: candidate.id, status: client_1.NotificationStatus.PENDING, claimToken }, data: { status: client_1.NotificationStatus.SENT, sentAt: new Date(), claimedAt: null, claimToken: null } });
                    await this.activityLog.record({ userId: candidate.userId, action: activity_log_service_1.ACTIVITY_ACTIONS.NOTIFICATION_SENT, entityType: 'NOTIFICATION', entityId: candidate.id, metadata: { channel: candidate.channel } });
                }
                catch (error) {
                    const retryCount = candidate.retryCount + 1;
                    const exhausted = retryCount >= 3;
                    await this.prisma.notification.updateMany({ where: { id: candidate.id, status: client_1.NotificationStatus.PENDING, claimToken }, data: { retryCount, status: exhausted ? client_1.NotificationStatus.FAILED : client_1.NotificationStatus.PENDING, nextRetryAt: exhausted ? null : new Date(now.getTime() + retryCount * 60_000), failedAt: exhausted ? new Date() : null, claimedAt: null, claimToken: null } });
                    if (exhausted)
                        await this.activityLog.record({ userId: candidate.userId, action: activity_log_service_1.ACTIVITY_ACTIONS.NOTIFICATION_FAILED, entityType: 'NOTIFICATION', entityId: candidate.id, metadata: { channel: candidate.channel } });
                    this.logger.warn(`Notification ${candidate.id} delivery failed${error instanceof Error ? `: ${error.message}` : ''}`);
                }
                processed += 1;
            }
        }
        finally {
            this.running = false;
        }
        return processed;
    }
};
exports.NotificationWorkerService = NotificationWorkerService;
exports.NotificationWorkerService = NotificationWorkerService = NotificationWorkerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notification_delivery_service_1.NotificationDeliveryService,
        activity_log_service_1.ActivityLogService])
], NotificationWorkerService);
//# sourceMappingURL=notification-worker.service.js.map