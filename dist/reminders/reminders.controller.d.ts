import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';
export declare class RemindersController {
    private readonly remindersService;
    constructor(remindersService: RemindersService);
    list(user: AuthenticatedUser, query: ReminderQueryDto): Promise<{
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
    get(user: AuthenticatedUser, id: string): Promise<{
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
    create(user: AuthenticatedUser, dto: CreateReminderDto): Promise<{
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
    update(user: AuthenticatedUser, id: string, dto: UpdateReminderDto): Promise<{
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
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
    complete(user: AuthenticatedUser, id: string): Promise<{
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
