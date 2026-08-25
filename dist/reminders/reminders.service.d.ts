import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
export declare class RemindersService {
    private readonly prisma;
    private readonly activityLog;
    private readonly notificationScheduler?;
    constructor(prisma: PrismaService, activityLog: ActivityLogService, notificationScheduler?: NotificationSchedulerService | undefined);
    listForUser(userId: string, query: ReminderQueryDto): Promise<{
        items: {
            id: string;
            status: import(".prisma/client").$Enums.ReminderStatus;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string;
            description: string | null;
            remindAt: Date;
            priority: import(".prisma/client").$Enums.TaskPriority;
            completedAt: Date | null;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getForUser(userId: string, id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.ReminderStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        remindAt: Date;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
    }>;
    createForUser(userId: string, dto: CreateReminderDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.ReminderStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        remindAt: Date;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
    }>;
    updateForUser(userId: string, id: string, dto: UpdateReminderDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.ReminderStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        remindAt: Date;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    completeForUser(userId: string, id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.ReminderStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        remindAt: Date;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
    }>;
}
