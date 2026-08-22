import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingQueryDto } from './dto/meeting-query.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingsService } from './meetings.service';
export declare class MeetingsController {
    private readonly meetingsService;
    constructor(meetingsService: MeetingsService);
    list(user: AuthenticatedUser, query: MeetingQueryDto): Promise<{
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
    get(user: AuthenticatedUser, id: string): Promise<{
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
    create(user: AuthenticatedUser, dto: CreateMeetingDto): Promise<{
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
    update(user: AuthenticatedUser, id: string, dto: UpdateMeetingDto): Promise<{
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
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
    cancel(user: AuthenticatedUser, id: string): Promise<{
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
}
