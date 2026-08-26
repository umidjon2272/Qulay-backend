import { HttpException } from '@nestjs/common';
export type GoogleErrorCode = 'OAUTH_CANCELLED' | 'INVALID_STATE' | 'NOT_CONNECTED' | 'TOKEN_REVOKED' | 'CALENDAR_PERMISSION' | 'DRIVE_PERMISSION' | 'EVENT_NOT_FOUND' | 'FILE_NOT_FOUND' | 'UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_CONFIGURED';
export declare class GoogleAdapterError extends Error {
    readonly code: GoogleErrorCode;
    readonly status?: number | undefined;
    constructor(code: GoogleErrorCode, status?: number | undefined);
}
export declare function mapGoogleError(error: unknown): HttpException;
export declare function classifyGoogleHttpError(status: number, body: unknown, resource: 'calendar' | 'drive' | 'oauth'): GoogleAdapterError;
export declare function isRetryableGoogleStatus(status: number): boolean;
export declare function retryAfterMs(attempt: number): number;
