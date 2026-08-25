import { MeetingStatus } from '@prisma/client';
export declare class UpdateMeetingDto {
    title?: string;
    description?: string;
    participant?: string;
    contactId?: string;
    location?: string;
    startsAt?: string;
    endsAt?: string;
    reminderMinutesBefore?: number;
    status?: MeetingStatus;
}
