import { BadRequestException, ConflictException, HttpException, HttpStatus, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export type TelegramErrorCode = 'INVALID_PHONE' | 'INVALID_CODE' | 'EXPIRED_CODE' | 'QR_TOKEN_EXPIRED' | 'CODE_HASH_INVALID' | 'RESEND_UNAVAILABLE' | 'AUTH_RESTART' | 'ALREADY_AUTHORIZED' | 'WRONG_PASSWORD' | 'FLOOD_WAIT' | 'PHONE_NUMBER_FLOOD' | 'SMS_CODE_CREATE_FAILED' | 'UPDATE_APP_TO_LOGIN' | 'CONNECTION_EXPIRED' | 'PEER_NOT_FOUND' | 'UNAVAILABLE' | 'SEND_FAILED' | 'NOT_CONFIGURED';

export class TelegramAdapterError extends Error {
  constructor(
    public readonly code: TelegramErrorCode,
    public readonly retryAfterSeconds?: number,
    public readonly rpcErrorMessage?: string,
    public readonly rpcCode?: string | number,
    public readonly clientConnected?: boolean,
    public readonly authSessionExists?: boolean,
  ) {
    super(code);
    this.name = 'TelegramAdapterError';
  }
}

export function mapTelegramError(error: unknown): HttpException {
  if (error instanceof TelegramAdapterError) {
    switch (error.code) {
      case 'INVALID_PHONE': return new BadRequestException('Invalid Telegram phone number');
      case 'INVALID_CODE': return new BadRequestException('Invalid Telegram code');
      case 'EXPIRED_CODE': return new BadRequestException("Telegram kodi eskirgan. Yangi kod so'rang.");
      case 'QR_TOKEN_EXPIRED': return new ConflictException('Telegram QR kodi eskirgan. Yangi QR kod so\'rang.');
      case 'CODE_HASH_INVALID': return new BadRequestException("Telegram login holati eskirgan. Yangi kod so'rang.");
      case 'RESEND_UNAVAILABLE': return new ConflictException('Telegram bu kod uchun qayta yuborishni taklif qilmadi. Yangi ulanishni boshlang.');
      case 'AUTH_RESTART': return new ConflictException('Telegram login jarayonini qayta boshlashni talab qildi. Yangi kod so\'rang.');
      case 'ALREADY_AUTHORIZED': return new ConflictException('Telegram sessiyasi allaqachon tasdiqlangan. Qayta kod yuborilmadi.');
      case 'WRONG_PASSWORD': return new BadRequestException('Wrong Telegram 2FA password');
      case 'FLOOD_WAIT': return new HttpException({ message: "Telegram ko'p urinish sabab vaqtincha kutishni talab qildi.", retryAfterSeconds: error.retryAfterSeconds ?? 60 }, HttpStatus.TOO_MANY_REQUESTS);
      case 'PHONE_NUMBER_FLOOD': return new HttpException({ message: "Bu telefon raqami vaqtincha bloklangan (juda ko'p urinish). Birozdan so'ng qayta urinib ko'ring.", retryAfterSeconds: error.retryAfterSeconds ?? 60 }, HttpStatus.TOO_MANY_REQUESTS);
      case 'SMS_CODE_CREATE_FAILED': return new BadRequestException("SMS orqali kod yuborib bo'lmadi. Boshqa usulni sinab ko'ring yoki keyinroq urinib ko'ring.");
      case 'UPDATE_APP_TO_LOGIN': return new BadRequestException("Tizimga kirish uchun Telegram ilovasini yangilash talab qilinadi.");
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
  if (error instanceof TelegramAdapterError) return error;
  const candidate = error as { errorMessage?: string; message?: string; seconds?: number; code?: string | number; name?: string };
  const message = `${candidate.errorMessage ?? ''} ${candidate.message ?? ''} ${candidate.code ?? ''}`.toUpperCase();
  const details = (code: TelegramErrorCode, retryAfterSeconds?: number) => new TelegramAdapterError(code, retryAfterSeconds, safeRpcErrorMessage(candidate.errorMessage), candidate.code);
  if (message.includes('PHONE_NUMBER_FLOOD')) return new TelegramAdapterError('PHONE_NUMBER_FLOOD');
  const flood = message.match(/FLOOD_WAIT[_ ]?(\d+)/);
  if (flood) return details('FLOOD_WAIT', Number(flood[1]));
  if (message.includes('SEND_CODE_UNAVAILABLE')) return details('RESEND_UNAVAILABLE');
  if (message.includes('AUTH_RESTART')) return details('AUTH_RESTART');
  if (message.includes('SMS_CODE_CREATE_FAILED')) return new TelegramAdapterError('SMS_CODE_CREATE_FAILED');
  if (message.includes('UPDATE_APP_TO_LOGIN')) return new TelegramAdapterError('UPDATE_APP_TO_LOGIN');
  if (message.includes('PHONE_NUMBER_INVALID')) return new TelegramAdapterError('INVALID_PHONE');
  if (message.includes('PHONE_CODE_EXPIRED')) return details('EXPIRED_CODE');
  if (message.includes('AUTH_TOKEN_EXPIRED')) return details('QR_TOKEN_EXPIRED');
  if (message.includes('PHONE_CODE_HASH_EMPTY') || message.includes('PHONE_CODE_HASH_INVALID')) return details('CODE_HASH_INVALID');
  if (message.includes('PHONE_CODE_INVALID') || message.includes('PHONE_CODE_EMPTY')) return new TelegramAdapterError('INVALID_CODE');
  if (message.includes('PASSWORD_HASH_INVALID')) return new TelegramAdapterError('WRONG_PASSWORD');
  if (['AUTH_KEY_UNREGISTERED', 'SESSION_REVOKED', 'USER_DEACTIVATED', 'AUTH_KEY_INVALID'].some((code) => message.includes(code))) {
    return new TelegramAdapterError('CONNECTION_EXPIRED');
  }
  if (message.includes('PEER_ID_INVALID') || message.includes('USERNAME_NOT_OCCUPIED')) return new TelegramAdapterError('PEER_NOT_FOUND');
  return details('UNAVAILABLE');
}

function safeRpcErrorMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.replace(/\+?\d{7,15}/g, '[REDACTED]').replace(/[A-Za-z0-9+/_=-]{24,}/g, '[REDACTED]').slice(0, 160);
}

export function isTelegramAuthInvalid(error: unknown): boolean {
  return error instanceof TelegramAdapterError
    ? error.code === 'CONNECTION_EXPIRED'
    : classifyTelegramError(error).code === 'CONNECTION_EXPIRED';
}

export function telegramErrorCode(error: unknown): TelegramErrorCode {
  return error instanceof TelegramAdapterError ? error.code : classifyTelegramError(error).code;
}
