import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingQueryDto } from './dto/meeting-query.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
export declare class MeetingsService {
    private readonly prisma;
    private readonly activityLog;
    private readonly notificationScheduler?;
    constructor(prisma: PrismaService, activityLog: ActivityLogService, notificationScheduler?: NotificationSchedulerService | undefined);
    listForUser(userId: string, query: MeetingQueryDto): Promise<{
        items: {
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
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getForUser(userId: string, id: string): Promise<{
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
    }>;
    createForUser(userId: string, dto: CreateMeetingDto): Promise<{
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
    }>;
    updateForUser(userId: string, id: string, dto: UpdateMeetingDto): Promise<{
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
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    cancelForUser(userId: string, id: string): Promise<{
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
    }>;
    private assertTimeOrder;
    private assertContactOwnership;
}
