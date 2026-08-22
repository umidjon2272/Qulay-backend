import { MeetingStatus } from '@prisma/client';
export declare class UpdateMeetingDto {
    title?: string;
    description?: string;
    participant?: string;
    startsAt?: string;
    endsAt?: string;
    reminderMinutesBefore?: number;
    status?: MeetingStatus;
}
