import { TaskPriority, TaskStatus } from '@prisma/client';
export declare class UpdateTaskDto {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string;
}
