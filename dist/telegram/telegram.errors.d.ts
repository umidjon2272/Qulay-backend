import { HttpException } from '@nestjs/common';
export type TelegramErrorCode = 'INVALID_PHONE' | 'INVALID_CODE' | 'EXPIRED_CODE' | 'WRONG_PASSWORD' | 'FLOOD_WAIT' | 'CONNECTION_EXPIRED' | 'PEER_NOT_FOUND' | 'UNAVAILABLE' | 'SEND_FAILED';
export declare class TelegramAdapterError extends Error {
    readonly code: TelegramErrorCode;
    readonly retryAfterSeconds?: number | undefined;
    constructor(code: TelegramErrorCode, retryAfterSeconds?: number | undefined);
}
export declare function mapTelegramError(error: unknown): HttpException;
export declare function classifyTelegramError(error: unknown): TelegramAdapterError;
