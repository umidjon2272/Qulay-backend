"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramAdapterError = void 0;
exports.mapTelegramError = mapTelegramError;
exports.classifyTelegramError = classifyTelegramError;
const common_1 = require("@nestjs/common");
class TelegramAdapterError extends Error {
    constructor(code, retryAfterSeconds) {
        super(code);
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.TelegramAdapterError = TelegramAdapterError;
function mapTelegramError(error) {
    if (error instanceof TelegramAdapterError) {
        switch (error.code) {
            case 'INVALID_PHONE': return new common_1.BadRequestException('Invalid Telegram phone number');
            case 'INVALID_CODE': return new common_1.BadRequestException('Invalid Telegram code');
            case 'EXPIRED_CODE': return new common_1.BadRequestException("Tasdiqlash kodi muddati tugagan. Qaytadan kod so'rang.");
            case 'WRONG_PASSWORD': return new common_1.BadRequestException('Wrong Telegram 2FA password');
            case 'FLOOD_WAIT': return new common_1.HttpException({ message: "Telegram so'rovlar chegarasiga yetdi. Birozdan keyin qayta urinib ko'ring.", retryAfterSeconds: error.retryAfterSeconds ?? 60 }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            case 'PHONE_NUMBER_FLOOD': return new common_1.HttpException({ message: "Bu telefon raqami vaqtincha bloklangan (juda ko'p urinish). Birozdan so'ng qayta urinib ko'ring.", retryAfterSeconds: error.retryAfterSeconds ?? 60 }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            case 'SMS_CODE_CREATE_FAILED': return new common_1.BadRequestException("SMS orqali kod yuborib bo'lmadi. Boshqa usulni sinab ko'ring yoki keyinroq urinib ko'ring.");
            case 'UPDATE_APP_TO_LOGIN': return new common_1.BadRequestException("Tizimga kirish uchun Telegram ilovasini yangilash talab qilinadi.");
            case 'CONNECTION_EXPIRED': return new common_1.BadRequestException('Telegram connection has expired');
            case 'PEER_NOT_FOUND': return new common_1.NotFoundException('Telegram peer was not found');
            case 'SEND_FAILED': return new common_1.BadRequestException('Telegram message could not be sent');
            case 'NOT_CONFIGURED': return new common_1.ServiceUnavailableException('Telegram integratsiyasi hozir sozlanmagan');
            default: return new common_1.ServiceUnavailableException('Telegram is temporarily unavailable');
        }
    }
    return new common_1.ServiceUnavailableException('Telegram is temporarily unavailable');
}
function classifyTelegramError(error) {
    const candidate = error;
    const message = `${candidate.errorMessage ?? ''} ${candidate.message ?? ''} ${candidate.code ?? ''}`.toUpperCase();
    if (message.includes('PHONE_NUMBER_FLOOD'))
        return new TelegramAdapterError('PHONE_NUMBER_FLOOD');
    const flood = message.match(/FLOOD_WAIT[_ ]?(\d+)/);
    if (flood)
        return new TelegramAdapterError('FLOOD_WAIT', Number(flood[1]));
    if (message.includes('SMS_CODE_CREATE_FAILED'))
        return new TelegramAdapterError('SMS_CODE_CREATE_FAILED');
    if (message.includes('UPDATE_APP_TO_LOGIN'))
        return new TelegramAdapterError('UPDATE_APP_TO_LOGIN');
    if (message.includes('PHONE_NUMBER_INVALID'))
        return new TelegramAdapterError('INVALID_PHONE');
    if (message.includes('PHONE_CODE_EXPIRED') || message.includes('PHONE_CODE_HASH_EMPTY'))
        return new TelegramAdapterError('EXPIRED_CODE');
    if (message.includes('PHONE_CODE_INVALID') || message.includes('PHONE_CODE_EMPTY'))
        return new TelegramAdapterError('INVALID_CODE');
    if (message.includes('PASSWORD_HASH_INVALID'))
        return new TelegramAdapterError('WRONG_PASSWORD');
    if (message.includes('AUTH_KEY_UNREGISTERED') || message.includes('SESSION_REVOKED'))
        return new TelegramAdapterError('CONNECTION_EXPIRED');
    if (message.includes('PEER_ID_INVALID') || message.includes('USERNAME_NOT_OCCUPIED'))
        return new TelegramAdapterError('PEER_NOT_FOUND');
    return new TelegramAdapterError('UNAVAILABLE');
}
//# sourceMappingURL=telegram.errors.js.map