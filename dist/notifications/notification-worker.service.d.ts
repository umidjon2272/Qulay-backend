import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
export declare class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly delivery;
    private readonly activityLog;
    private readonly logger;
    private timer?;
    private running;
    private readonly batchSize;
    private readonly intervalMs;
    private readonly leaseMs;
    private readonly maxRetries;
    constructor(prisma: PrismaService, delivery: NotificationDeliveryService, activityLog: ActivityLogService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    health(): {
        status: 'running' | 'stopped';
    };
    config(): {
        intervalMs: number;
        batchSize: number;
        retryLimit: number;
        leaseMs: number;
    };
    processDueNotifications(now?: Date): Promise<number>;
}
