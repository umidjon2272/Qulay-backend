export declare class GoogleCallbackQueryDto {
    code?: string;
    state?: string;
    error?: string;
}
export declare class CalendarEventsQueryDto {
    from: string;
    to: string;
    calendarId?: string;
    limit?: number;
}
export declare class AttendeeDto {
    email: string;
}
export declare class CreateCalendarEventDto {
    title: string;
    description?: string;
    start: string;
    end: string;
    attendees?: string[];
    location?: string;
    calendarId?: string;
}
export declare class UpdateCalendarEventDto {
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    attendees?: string[];
    location?: string;
    calendarId?: string;
}
export declare class DriveFilesQueryDto {
    q?: string;
    mimeType?: string;
    limit?: number;
    pageToken?: string;
}
