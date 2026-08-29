import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export type GoogleErrorCode =
  | 'OAUTH_CANCELLED'
  | 'INVALID_STATE'
  | 'NOT_CONNECTED'
  | 'TOKEN_REVOKED'
  | 'CALENDAR_PERMISSION'
  | 'DRIVE_PERMISSION'
  | 'EVENT_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'NOT_CONFIGURED'
  | 'USER_NOT_FOUND'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'TOKEN_ENCRYPTION_FAILED'
  | 'CONNECTION_PERSIST_FAILED';

export class GoogleAdapterError extends Error {
  constructor(public readonly code: GoogleErrorCode, public readonly status?: number) {
    super(code);
  }
}

export function googleErrorCode(error: unknown): GoogleErrorCode {
  return error instanceof GoogleAdapterError ? error.code : 'UNAVAILABLE';
}

export function googlePublicErrorMessage(code: GoogleErrorCode): string {
  switch (code) {
    case 'OAUTH_CANCELLED': return 'Google ulanishi bekor qilindi';
    case 'INVALID_STATE': return 'Google OAuth state yaroqsiz yoki eskirgan';
    case 'USER_NOT_FOUND': return 'OAuth foydalanuvchisi production bazasida topilmadi';
    case 'TOKEN_EXCHANGE_FAILED': return 'Google authorization code tokenlarga almashtirilmadi';
    case 'TOKEN_ENCRYPTION_FAILED': return 'Google tokenlarini shifrlash konfiguratsiyasi yaroqsiz';
    case 'CONNECTION_PERSIST_FAILED': return 'Google ulanishi database’da saqlanmadi';
    case 'INVALID_REQUEST': return 'Google callback so‘rovi to‘liq emas';
    case 'NOT_CONFIGURED': return 'Google integratsiyasi sozlanmagan';
    default: return 'Google ulanishida server xatosi yuz berdi';
  }
}

export function mapGoogleError(error: unknown): HttpException {
  if (error instanceof GoogleAdapterError) {
    switch (error.code) {
      case 'OAUTH_CANCELLED': return new BadRequestException('OAuth bekor qilindi');
      case 'INVALID_STATE': return new BadRequestException('Google ulanish holati yaroqsiz');
      case 'NOT_CONNECTED': return new UnauthorizedException('Google account ulanmagan');
      case 'TOKEN_REVOKED': return new UnauthorizedException('Google token expired/revoked');
      case 'CALENDAR_PERMISSION': return new ForbiddenException('Calendar permission yetarli emas');
      case 'DRIVE_PERMISSION': return new ForbiddenException('Drive permission yetarli emas');
      case 'EVENT_NOT_FOUND': return new NotFoundException('Event topilmadi');
      case 'FILE_NOT_FOUND': return new NotFoundException('File topilmadi');
      case 'INVALID_REQUEST': return new BadRequestException('Google so‘rovi yaroqsiz');
      case 'NOT_CONFIGURED': return new ServiceUnavailableException('Google integratsiyasi hozir sozlanmagan');
      default: return new ServiceUnavailableException('Google vaqtincha unavailable');
    }
  }
  return new ServiceUnavailableException('Google vaqtincha unavailable');
}

export function classifyGoogleHttpError(status: number, body: unknown, resource: 'calendar' | 'drive' | 'oauth'): GoogleAdapterError {
  const reason = JSON.stringify(body ?? '').toLowerCase();
  if (status === 401 || reason.includes('invalid_grant')) return new GoogleAdapterError('TOKEN_REVOKED', status);
  if (status === 403) return new GoogleAdapterError(resource === 'calendar' ? 'CALENDAR_PERMISSION' : resource === 'drive' ? 'DRIVE_PERMISSION' : 'UNAVAILABLE', status);
  if (status === 404) return new GoogleAdapterError(resource === 'calendar' ? 'EVENT_NOT_FOUND' : 'FILE_NOT_FOUND', status);
  if (status === 400) return new GoogleAdapterError(resource === 'oauth' ? 'INVALID_REQUEST' : 'INVALID_REQUEST', status);
  return new GoogleAdapterError('UNAVAILABLE', status);
}

export function isRetryableGoogleStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function retryAfterMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 2_000);
}
