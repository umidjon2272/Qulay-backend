import { ReminderStatus, TaskPriority } from '@prisma/client';
export declare class CreateReminderDto {
    title: string;
    description?: string;
    remindAt: string;
    status?: ReminderStatus;
    priority?: TaskPriority;
}
