import { ConfigService } from '@nestjs/config';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleApiClientService } from './google-api-client.service';
import { GoogleCryptoService } from './google-crypto.service';
export declare const GOOGLE_SCOPES: readonly ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/drive.metadata.readonly", "https://www.googleapis.com/auth/drive.readonly"];
export declare class GoogleAuthService {
    private readonly config;
    private readonly prisma;
    private readonly crypto;
    private readonly api;
    private readonly activityLog;
    private readonly logger;
    private readonly refreshes;
    private readonly usedStates;
    constructor(config: ConfigService, prisma: PrismaService, crypto: GoogleCryptoService, api: GoogleApiClientService, activityLog: ActivityLogService);
    connectUrl(userId: string): string;
    callback(code: string | undefined, stateValue: string | undefined, oauthError?: string): Promise<void>;
    getAccessToken(userId: string): Promise<string>;
    status(userId: string): Promise<{
        connected: boolean;
        email: string | null;
        displayName: string | null;
        connectedAt: string | null;
        calendarEnabled: boolean;
        driveEnabled: boolean;
    }>;
    disconnect(userId: string): Promise<{
        status: 'disconnected';
    }>;
    private refreshAccessToken;
    private exchangeCode;
    private tokenRequest;
    private signState;
    private verifyState;
    private stateSecret;
    private purgeStates;
    private expiry;
    private touch;
    private markError;
}
