import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    list(user: AuthenticatedUser, query: TaskQueryDto): Promise<{
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
    get(user: AuthenticatedUser, id: string): Promise<{
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
    create(user: AuthenticatedUser, dto: CreateTaskDto): Promise<{
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
    update(user: AuthenticatedUser, id: string, dto: UpdateTaskDto): Promise<{
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
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
    complete(user: AuthenticatedUser, id: string): Promise<{
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
    reopen(user: AuthenticatedUser, id: string): Promise<{
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
