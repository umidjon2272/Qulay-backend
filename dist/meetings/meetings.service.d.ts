import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingQueryDto } from './dto/meeting-query.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
export declare class MeetingsService {
    private readonly prisma;
    private readonly activityLog;
    constructor(prisma: PrismaService, activityLog: ActivityLogService);
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
            startsAt: Date;
            endsAt: Date;
            reminderMinutesBefore: number;
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
        startsAt: Date;
        endsAt: Date;
        reminderMinutesBefore: number;
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
        startsAt: Date;
        endsAt: Date;
        reminderMinutesBefore: number;
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
        startsAt: Date;
        endsAt: Date;
        reminderMinutesBefore: number;
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
        startsAt: Date;
        endsAt: Date;
        reminderMinutesBefore: number;
    }>;
    private assertTimeOrder;
}
