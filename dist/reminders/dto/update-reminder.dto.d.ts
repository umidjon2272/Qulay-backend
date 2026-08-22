import { ReminderStatus, TaskPriority } from '@prisma/client';
export declare class UpdateReminderDto {
    title?: string;
    description?: string;
    remindAt?: string;
    status?: ReminderStatus;
    priority?: TaskPriority;
}
