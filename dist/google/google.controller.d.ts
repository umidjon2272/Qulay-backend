import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CalendarEventsQueryDto, CreateCalendarEventDto, DriveFilesQueryDto, GoogleCallbackQueryDto, UpdateCalendarEventDto } from './dto/google.dto';
import { GoogleAuthService } from './google-auth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleDriveService } from './google-drive.service';
import { ConfigService } from '@nestjs/config';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
export declare class GoogleController {
    private readonly auth;
    private readonly calendar;
    private readonly drive;
    private readonly config;
    private readonly rateLimiter;
    constructor(auth: GoogleAuthService, calendar: GoogleCalendarService, drive: GoogleDriveService, config: ConfigService, rateLimiter: SecurityRateLimitService);
    connectUrl(user: AuthenticatedUser): {
        url: string;
    };
    callback(query: GoogleCallbackQueryDto, request: Request, response: Response): Promise<void>;
    status(user: AuthenticatedUser): Promise<{
        connected: boolean;
        email: string | null;
        displayName: string | null;
        connectedAt: string | null;
        calendarEnabled: boolean;
        driveEnabled: boolean;
    }>;
    disconnect(user: AuthenticatedUser): Promise<{
        status: "disconnected";
    }>;
    listCalendar(user: AuthenticatedUser, query: CalendarEventsQueryDto): Promise<{
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
    createCalendar(user: AuthenticatedUser, dto: CreateCalendarEventDto): Promise<{
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
    updateCalendar(user: AuthenticatedUser, eventId: string, dto: UpdateCalendarEventDto): Promise<{
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
    deleteCalendar(user: AuthenticatedUser, eventId: string, calendarId?: string): Promise<{
        deleted: boolean;
        id: string;
    }>;
    listDrive(user: AuthenticatedUser, query: DriveFilesQueryDto): Promise<{
        items: {
            id: string;
            name: string;
            mimeType: string;
            modifiedTime: string | null;
            size: number | null;
            webViewLink: string | null;
            owners: {
                displayName: string | null;
                emailAddress: string | null;
                permissionId: string | null;
            }[];
            iconLink: string | null;
        }[];
        nextPageToken: string | null;
    }>;
    metadata(user: AuthenticatedUser, fileId: string): Promise<{
        id: string;
        name: string;
        mimeType: string;
        modifiedTime: string | null;
        size: number | null;
        webViewLink: string | null;
        owners: {
            displayName: string | null;
            emailAddress: string | null;
            permissionId: string | null;
        }[];
        iconLink: string | null;
    }>;
}
