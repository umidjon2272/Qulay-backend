import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NotificationService } from './notification.service';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationService);
    list(user: AuthenticatedUser, query: NotificationQueryDto): Promise<{
        items: {
            message: string;
            id: string;
            status: import(".prisma/client").$Enums.NotificationStatus;
            createdAt: Date;
            updatedAt: Date;
            entityType: string | null;
            entityId: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
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
    unreadCount(user: AuthenticatedUser): Promise<{
        count: number;
    }>;
    preferences(user: AuthenticatedUser): import(".prisma/client").Prisma.Prisma__NotificationPreferenceClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import(".prisma/client").Prisma.PrismaClientOptions>;
    updatePreferences(user: AuthenticatedUser, dto: UpdateNotificationPreferenceDto): import(".prisma/client").Prisma.Prisma__NotificationPreferenceClient<{
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
    }, never, import("@prisma/client/runtime/library").DefaultArgs, import(".prisma/client").Prisma.PrismaClientOptions>;
    readAll(user: AuthenticatedUser): Promise<{
        count: number;
    }>;
    read(user: AuthenticatedUser, id: string): Promise<{
        message: string;
        id: string;
        status: import(".prisma/client").$Enums.NotificationStatus;
        createdAt: Date;
        updatedAt: Date;
        entityType: string | null;
        entityId: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
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
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
}
