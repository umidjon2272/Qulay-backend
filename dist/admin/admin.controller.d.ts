import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AdminActivityQueryDto, AdminRangeQueryDto, AdminRoleDto, AdminStatusDto, AdminUsersQueryDto } from './dto/admin-query.dto';
import { AdminService } from './admin.service';
export declare class AdminController {
    private readonly admin;
    constructor(admin: AdminService);
    overview(query: AdminRangeQueryDto): Promise<{
        range: number;
        generatedAt: string;
        kpis: {
            users: number;
            activeUsers: number;
            registeredToday: number;
            registeredThisMonth: number;
            blockedUsers: number;
            aiUsageRequests: number;
            files: number;
            notifications: number;
            telegramConnectedUsers: number;
            googleConnectedUsers: number;
            activeReminders: number;
            upcomingMeetings: number;
        };
        activityOverview: {
            tasks: number;
            reminders: number;
            meetings: number;
            notes: number;
            contacts: number;
            financeTransactions: number;
            filesUploaded: number;
        };
        userGrowth: {
            date: string;
            count: number;
        }[];
        activityTrend: {
            date: string;
            count: number;
        }[];
    }>;
    users(query: AdminUsersQueryDto): Promise<{
        items: {
            lastActivity: Date;
            activeSession: boolean;
            integrations: {
                telegram: boolean;
                google: boolean;
            };
            activityLogs: undefined;
            refreshTokens: undefined;
            googleConnection: {
                status: import(".prisma/client").$Enums.GoogleConnectionStatus;
            } | null;
            telegramConnection: {
                status: import(".prisma/client").$Enums.TelegramConnectionStatus;
            } | null;
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            avatarUrl: string | null;
            role: import(".prisma/client").$Enums.UserRole;
            status: import(".prisma/client").$Enums.UserStatus;
            createdAt: Date;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    user(id: string): Promise<{
        lastActivity: Date;
        activity: {
            id: string;
            createdAt: Date;
            action: string;
            entityType: string;
            entityId: string | null;
        }[];
        usage: {
            tasks: number;
            reminders: number;
            meetings: number;
            notes: number;
            contacts: number;
            financeTransactions: number;
            files: number;
            aiRequests: number;
        };
        security: {
            activeRefreshSessions: number;
            passwordResetRequests: number;
        };
        integrations: {
            telegram: {
                connected: boolean;
                status: import(".prisma/client").$Enums.TelegramConnectionStatus;
            };
            google: {
                connected: boolean;
                status: import(".prisma/client").$Enums.GoogleConnectionStatus;
            };
        };
        telegramConnection: undefined;
        googleConnection: undefined;
        activityLogs: undefined;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.UserStatus;
        createdAt: Date;
        updatedAt: Date;
    }>;
    status(actor: AuthenticatedUser, id: string, dto: AdminStatusDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.UserStatus;
    }>;
    role(actor: AuthenticatedUser, id: string, dto: AdminRoleDto): Promise<{
        id: string;
        role: import(".prisma/client").$Enums.UserRole;
    }>;
    usage(query: AdminRangeQueryDto): Promise<{
        range: number;
        provider: {
            status: string;
        };
        totals: {
            requests: number;
            text: {
                requests: number;
                inputTokens: number;
                outputTokens: number;
                audioSeconds: number;
                estimatedCost: number;
            };
            voice: {
                requests: number;
                inputTokens: number;
                outputTokens: number;
                audioSeconds: number;
                estimatedCost: number;
            };
            tool: {
                requests: number;
                inputTokens: number;
                outputTokens: number;
                audioSeconds: number;
                estimatedCost: number;
            };
            file: {
                requests: number;
                inputTokens: number;
                outputTokens: number;
                audioSeconds: number;
                estimatedCost: number;
            };
            inputTokens: number;
            outputTokens: number;
            audioSeconds: number;
            estimatedCost: number;
        };
        byUser: {
            user: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
            };
            requests: number;
            inputTokens: number;
            outputTokens: number;
            estimatedCost: number;
        }[];
        trend: {
            date: string;
            count: number;
        }[];
        tools: {
            tool: string | null;
            count: number;
        }[];
    }>;
    integrations(): Promise<{
        telegram: {
            [k: string]: number;
        };
        google: {
            [k: string]: number;
        };
    }>;
    notifications(query: AdminRangeQueryDto): Promise<{
        range: number;
        totals: {
            total: number;
            pending: number;
            sent: number;
            failed: number;
            read: number;
        };
        failed: {
            user: {
                id: string;
                email: string;
            };
            id: string;
            status: import(".prisma/client").$Enums.NotificationStatus;
            createdAt: Date;
            type: import(".prisma/client").$Enums.NotificationType;
            channel: import(".prisma/client").$Enums.NotificationChannel;
            failedAt: Date | null;
            retryCount: number;
        }[];
    }>;
    files(query: AdminUsersQueryDto): Promise<{
        stats: {
            total: number;
            totalSizeBytes: number;
            images: number;
            pdfs: number;
            docs: number;
            storage: {
                [k: string]: number;
            };
            sources: {
                [k: string]: number;
            };
        };
        items: {
            sizeBytes: number;
            owner: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
            };
            user: undefined;
            id: string;
            createdAt: Date;
            source: import(".prisma/client").$Enums.FileSource;
            mimeType: string;
            originalName: string;
            extension: string | null;
            storageProvider: import(".prisma/client").$Enums.FileStorageProvider;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    activity(query: AdminActivityQueryDto): Promise<{
        items: {
            id: string;
            time: Date;
            action: string;
            entity: {
                type: string;
                id: string | null;
            };
            source: string;
            user: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
            };
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    system(): Promise<{
        api: {
            status: string;
        };
        database: {
            status: string;
            latencyMs: number;
        };
        notificationWorker: {
            status: "running" | "stopped";
        };
        uptimeSeconds: number;
        environment: string;
        version: string | null;
        migrations: {
            status: string;
        };
        integrations: {
            telegram: {
                [k: string]: number;
            };
            google: {
                [k: string]: number;
            };
        };
    }>;
    settings(): {
        defaultUserStatus: "ACTIVE";
        notificationWorker: {
            status: "running" | "stopped";
        };
        environment: string;
        aiDefaults: {
            status: string;
            message: string;
        };
    };
}
