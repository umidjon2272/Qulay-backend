import { BadRequestException, HttpException, HttpStatus, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type TelegramErrorCode = 'INVALID_PHONE' | 'INVALID_CODE' | 'EXPIRED_CODE' | 'WRONG_PASSWORD' | 'FLOOD_WAIT' | 'CONNECTION_EXPIRED' | 'PEER_NOT_FOUND' | 'UNAVAILABLE' | 'SEND_FAILED' | 'NOT_CONFIGURED';

export class TelegramAdapterError extends Error {
  constructor(public readonly code: TelegramErrorCode, public readonly retryAfterSeconds?: number) {
    super(code);
  }
}

export function mapTelegramError(error: unknown): HttpException {
  if (error instanceof TelegramAdapterError) {
    switch (error.code) {
      case 'INVALID_PHONE': return new BadRequestException('Invalid Telegram phone number');
      case 'INVALID_CODE': return new BadRequestException('Invalid Telegram code');
      case 'EXPIRED_CODE': return new BadRequestException('Telegram code has expired');
      case 'WRONG_PASSWORD': return new BadRequestException('Wrong Telegram 2FA password');
      case 'FLOOD_WAIT': return new HttpException({ message: 'Telegram rate limit reached', retryAfterSeconds: error.retryAfterSeconds ?? 60 }, HttpStatus.TOO_MANY_REQUESTS);
      case 'CONNECTION_EXPIRED': return new BadRequestException('Telegram connection has expired');
      case 'PEER_NOT_FOUND': return new NotFoundException('Telegram peer was not found');
      case 'SEND_FAILED': return new BadRequestException('Telegram message could not be sent');
      case 'NOT_CONFIGURED': return new ServiceUnavailableException('Telegram integratsiyasi hozir sozlanmagan');
      default: return new ServiceUnavailableException('Telegram is temporarily unavailable');
    }
  }
  return new ServiceUnavailableException('Telegram is temporarily unavailable');
}

export function classifyTelegramError(error: unknown): TelegramAdapterError {
  const candidate = error as { errorMessage?: string; message?: string; seconds?: number; code?: string };
  const message = `${candidate.errorMessage ?? ''} ${candidate.message ?? ''} ${candidate.code ?? ''}`.toUpperCase();
  const flood = message.match(/FLOOD_WAIT[_ ]?(\d+)/);
  if (flood) return new TelegramAdapterError('FLOOD_WAIT', Number(flood[1]));
  if (message.includes('PHONE_NUMBER_INVALID')) return new TelegramAdapterError('INVALID_PHONE');
  if (message.includes('PHONE_CODE_EXPIRED') || message.includes('PHONE_CODE_HASH_EMPTY')) return new TelegramAdapterError('EXPIRED_CODE');
  if (message.includes('PHONE_CODE_INVALID') || message.includes('PHONE_CODE_EMPTY')) return new TelegramAdapterError('INVALID_CODE');
  if (message.includes('PASSWORD_HASH_INVALID')) return new TelegramAdapterError('WRONG_PASSWORD');
  if (message.includes('AUTH_KEY_UNREGISTERED') || message.includes('SESSION_REVOKED')) return new TelegramAdapterError('CONNECTION_EXPIRED');
  if (message.includes('PEER_ID_INVALID') || message.includes('USERNAME_NOT_OCCUPIED')) return new TelegramAdapterError('PEER_NOT_FOUND');
  return new TelegramAdapterError('UNAVAILABLE');
}
