import { ActivityLogService } from '../activity-log/activity-log.service';
import { GoogleApiClientService } from './google-api-client.service';
import { GoogleAuthService } from './google-auth.service';
import { CreateCalendarEventDto, CalendarEventsQueryDto, UpdateCalendarEventDto } from './dto/google.dto';
type GoogleEvent = {
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    htmlLink?: string;
    status?: string;
    start?: {
        dateTime?: string;
        date?: string;
    };
    end?: {
        dateTime?: string;
        date?: string;
    };
    attendees?: Array<{
        email?: string;
        displayName?: string;
        responseStatus?: string;
    }>;
};
export declare class GoogleCalendarService {
    private readonly auth;
    private readonly api;
    private readonly activityLog;
    constructor(auth: GoogleAuthService, api: GoogleApiClientService, activityLog: ActivityLogService);
    list(userId: string, query: CalendarEventsQueryDto): Promise<{
        id: string;
        title: string;
        description: string | null;
        start: string | null;
        end: string | null;
        attendees: {
            email: string;
            displayName: string | null;
            responseStatus: string | null;
        }[];
        location: string | null;
        htmlLink: string | null;
        status: string | null;
    }[]>;
    create(userId: string, dto: CreateCalendarEventDto): Promise<{
        id: string;
        title: string;
        description: string | null;
        start: string | null;
        end: string | null;
        attendees: {
            email: string;
            displayName: string | null;
            responseStatus: string | null;
        }[];
        location: string | null;
        htmlLink: string | null;
        status: string | null;
    }>;
    update(userId: string, eventId: string, dto: UpdateCalendarEventDto): Promise<{
        id: string;
        title: string;
        description: string | null;
        start: string | null;
        end: string | null;
        attendees: {
            email: string;
            displayName: string | null;
            responseStatus: string | null;
        }[];
        location: string | null;
        htmlLink: string | null;
        status: string | null;
    }>;
    delete(userId: string, eventId: string, calendarId?: string): Promise<{
        deleted: boolean;
        id: string;
    }>;
    private toGoogleEvent;
    private assertPeriod;
}
export declare function normalizeEvent(event: GoogleEvent): {
    id: string;
    title: string;
    description: string | null;
    start: string | null;
    end: string | null;
    attendees: {
        email: string;
        displayName: string | null;
        responseStatus: string | null;
    }[];
    location: string | null;
    htmlLink: string | null;
    status: string | null;
};
export {};
