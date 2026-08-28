import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationWorkerService } from '../notifications/notification-worker.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActivityQueryDto, AdminUsersQueryDto } from './dto/admin-query.dto';
export declare class AdminService {
    private readonly prisma;
    private readonly activityLog;
    private readonly config;
    private readonly worker;
    constructor(prisma: PrismaService, activityLog: ActivityLogService, config: ConfigService, worker: NotificationWorkerService);
    getOverview(range?: number): Promise<{
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
    listUsers(query: AdminUsersQueryDto): Promise<{
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
    getUser(id: string): Promise<{
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
    updateUserStatus(actorId: string, userId: string, status: UserStatus): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.UserStatus;
    }>;
    updateUserRole(actorId: string, userId: string, role: UserRole): Promise<{
        id: string;
        role: import(".prisma/client").$Enums.UserRole;
    }>;
    getUsage(range?: number): Promise<{
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
    getIntegrations(): Promise<{
        telegram: {
            [k: string]: number;
        };
        google: {
            [k: string]: number;
        };
    }>;
    getNotifications(range?: number): Promise<{
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
    getFiles(page?: number, limit?: number): Promise<{
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
    getActivity(query: AdminActivityQueryDto): Promise<{
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
    getSystemHealth(): Promise<{
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
    getSettings(): Promise<{
        platform: {
            name: string;
            defaultUserStatus: "ACTIVE";
            registrationEnabled: boolean;
            maintenanceMode: boolean;
        };
        security: {
            accessTokenExpiresIn: string;
            refreshTokenExpiresIn: string;
            loginBruteForce: {
                maxFailures: 5;
                lockMinutes: number;
            };
            rateLimits: {
                loginPerIp: {
                    max: 30;
                    windowMinutes: number;
                };
                loginPerEmail: {
                    max: 15;
                    windowMinutes: number;
                };
                registerPerIp: {
                    max: 10;
                    windowMinutes: number;
                };
                registerPerEmail: {
                    max: 3;
                    windowMinutes: number;
                };
                passwordReset: {
                    max: 5;
                    windowMinutes: number;
                };
                globalPerIp: {
                    max: 240;
                    windowSeconds: number;
                };
            };
        };
        notifications: {
            workerStatus: "running" | "stopped";
            intervalSeconds: number;
            batchSize: number;
            retryLimit: number;
        };
        integrations: {
            telegram: {
                configured: boolean;
            };
            google: {
                configured: boolean;
            };
            openai: {
                configured: boolean;
            };
        };
        storage: {
            provider: string;
            maxFileSizeBytes: number;
            localWarning: string | null;
        };
        system: {
            environment: string;
            version: string | null;
            api: {
                status: string;
            };
            database: {
                status: string;
                latencyMs: number;
            };
        };
    }>;
    private daysAgo;
    private getTrend;
    private getActivityTrend;
    private getUsageTrend;
    private getToolUsage;
    private getActivityOverview;
    private typeSummary;
    private integrationSummary;
}
