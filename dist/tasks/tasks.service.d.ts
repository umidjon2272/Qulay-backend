import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
export declare class TasksService {
    private readonly prisma;
    private readonly activityLog;
    constructor(prisma: PrismaService, activityLog: ActivityLogService);
    listForUser(userId: string, query: TaskQueryDto): Promise<{
        items: {
            id: string;
            status: import(".prisma/client").$Enums.TaskStatus;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string;
            description: string | null;
            priority: import(".prisma/client").$Enums.TaskPriority;
            completedAt: Date | null;
            dueDate: Date | null;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getForUser(userId: string, id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
        dueDate: Date | null;
    }>;
    createForUser(userId: string, dto: CreateTaskDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
        dueDate: Date | null;
    }>;
    updateForUser(userId: string, id: string, dto: UpdateTaskDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
        dueDate: Date | null;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    completeForUser(userId: string, id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
        dueDate: Date | null;
    }>;
    reopenForUser(userId: string, id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.TaskStatus;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
        description: string | null;
        priority: import(".prisma/client").$Enums.TaskPriority;
        completedAt: Date | null;
        dueDate: Date | null;
    }>;
}
