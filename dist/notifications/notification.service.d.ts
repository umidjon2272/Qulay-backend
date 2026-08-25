import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
export declare class NotificationService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listForUser(userId: string, query: NotificationQueryDto): Promise<{
        items: {
            message: string;
            id: string;
            status: import(".prisma/client").$Enums.NotificationStatus;
            createdAt: Date;
            updatedAt: Date;
            entityType: string | null;
            entityId: string | null;
            metadata: Prisma.JsonValue | null;
            userId: string;
            type: import(".prisma/client").$Enums.NotificationType;
            title: string;
            channel: import(".prisma/client").$Enums.NotificationChannel;
            scheduledAt: Date | null;
            sentAt: Date | null;
            readAt: Date | null;
            failedAt: Date | null;
            retryCount: number;
            nextRetryAt: Date | null;
            claimedAt: Date | null;
            claimToken: string | null;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    unreadCount(userId: string): Promise<{
        count: number;
    }>;
    markRead(userId: string, id: string): Promise<{
        message: string;
        id: string;
        status: import(".prisma/client").$Enums.NotificationStatus;
        createdAt: Date;
        updatedAt: Date;
        entityType: string | null;
        entityId: string | null;
        metadata: Prisma.JsonValue | null;
        userId: string;
        type: import(".prisma/client").$Enums.NotificationType;
        title: string;
        channel: import(".prisma/client").$Enums.NotificationChannel;
        scheduledAt: Date | null;
        sentAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        retryCount: number;
        nextRetryAt: Date | null;
        claimedAt: Date | null;
        claimToken: string | null;
    }>;
    readAll(userId: string): Promise<{
        count: number;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    getPreferences(userId: string): Prisma.Prisma__NotificationPreferenceClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        taskEnabled: boolean;
        reminderEnabled: boolean;
        meetingEnabled: boolean;
        aiEnabled: boolean;
        telegramEnabled: boolean;
        webPushEnabled: boolean;
        defaultMeetingMinutesBefore: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
    updatePreferences(userId: string, dto: UpdateNotificationPreferenceDto): Prisma.Prisma__NotificationPreferenceClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        taskEnabled: boolean;
        reminderEnabled: boolean;
        meetingEnabled: boolean;
        aiEnabled: boolean;
        telegramEnabled: boolean;
        webPushEnabled: boolean;
        defaultMeetingMinutesBefore: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs, Prisma.PrismaClientOptions>;
}
