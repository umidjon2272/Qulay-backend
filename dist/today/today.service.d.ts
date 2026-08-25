import { PrismaService } from '../prisma/prisma.service';
export declare class TodayService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getForUser(userId: string, date?: string): Promise<{
        date: string;
        timezone: string;
        tasks: {
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
        reminders: {
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
        meetings: {
            id: string;
            status: import(".prisma/client").$Enums.MeetingStatus;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string;
            description: string | null;
            participant: string | null;
            location: string | null;
            startsAt: Date;
            endsAt: Date;
            reminderMinutesBefore: number;
            contactId: string | null;
        }[];
        overdueTasks: {
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
        nextMeeting: {
            id: string;
            status: import(".prisma/client").$Enums.MeetingStatus;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string;
            description: string | null;
            participant: string | null;
            location: string | null;
            startsAt: Date;
            endsAt: Date;
            reminderMinutesBefore: number;
            contactId: string | null;
        } | null;
    }>;
}
