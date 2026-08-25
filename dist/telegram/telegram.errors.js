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
            case 'EXPIRED_CODE': return new common_1.BadRequestException('Telegram code has expired');
            case 'WRONG_PASSWORD': return new common_1.BadRequestException('Wrong Telegram 2FA password');
            case 'FLOOD_WAIT': return new common_1.HttpException({ message: 'Telegram rate limit reached', retryAfterSeconds: error.retryAfterSeconds ?? 60 }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            case 'CONNECTION_EXPIRED': return new common_1.BadRequestException('Telegram connection has expired');
            case 'PEER_NOT_FOUND': return new common_1.NotFoundException('Telegram peer was not found');
            case 'SEND_FAILED': return new common_1.BadRequestException('Telegram message could not be sent');
            default: return new common_1.ServiceUnavailableException('Telegram is temporarily unavailable');
        }
    }
    return new common_1.ServiceUnavailableException('Telegram is temporarily unavailable');
}
function classifyTelegramError(error) {
    const candidate = error;
    const message = `${candidate.errorMessage ?? ''} ${candidate.message ?? ''} ${candidate.code ?? ''}`.toUpperCase();
    const flood = message.match(/FLOOD_WAIT[_ ]?(\d+)/);
    if (flood)
        return new TelegramAdapterError('FLOOD_WAIT', Number(flood[1]));
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