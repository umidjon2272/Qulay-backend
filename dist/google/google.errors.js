"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAdapterError = void 0;
exports.mapGoogleError = mapGoogleError;
exports.classifyGoogleHttpError = classifyGoogleHttpError;
exports.isRetryableGoogleStatus = isRetryableGoogleStatus;
exports.retryAfterMs = retryAfterMs;
const common_1 = require("@nestjs/common");
class GoogleAdapterError extends Error {
    constructor(code, status) {
        super(code);
        this.code = code;
        this.status = status;
    }
}
exports.GoogleAdapterError = GoogleAdapterError;
function mapGoogleError(error) {
    if (error instanceof GoogleAdapterError) {
        switch (error.code) {
            case 'OAUTH_CANCELLED': return new common_1.BadRequestException('OAuth bekor qilindi');
            case 'INVALID_STATE': return new common_1.BadRequestException('Google ulanish holati yaroqsiz');
            case 'NOT_CONNECTED': return new common_1.UnauthorizedException('Google account ulanmagan');
            case 'TOKEN_REVOKED': return new common_1.UnauthorizedException('Google token expired/revoked');
            case 'CALENDAR_PERMISSION': return new common_1.ForbiddenException('Calendar permission yetarli emas');
            case 'DRIVE_PERMISSION': return new common_1.ForbiddenException('Drive permission yetarli emas');
            case 'EVENT_NOT_FOUND': return new common_1.NotFoundException('Event topilmadi');
            case 'FILE_NOT_FOUND': return new common_1.NotFoundException('File topilmadi');
            case 'INVALID_REQUEST': return new common_1.BadRequestException('Google so‘rovi yaroqsiz');
            default: return new common_1.ServiceUnavailableException('Google vaqtincha unavailable');
        }
    }
    return new common_1.ServiceUnavailableException('Google vaqtincha unavailable');
}
function classifyGoogleHttpError(status, body, resource) {
    const reason = JSON.stringify(body ?? '').toLowerCase();
    if (status === 401 || reason.includes('invalid_grant'))
        return new GoogleAdapterError('TOKEN_REVOKED', status);
    if (status === 403)
        return new GoogleAdapterError(resource === 'calendar' ? 'CALENDAR_PERMISSION' : resource === 'drive' ? 'DRIVE_PERMISSION' : 'UNAVAILABLE', status);
    if (status === 404)
        return new GoogleAdapterError(resource === 'calendar' ? 'EVENT_NOT_FOUND' : 'FILE_NOT_FOUND', status);
    if (status === 400)
        return new GoogleAdapterError(resource === 'oauth' ? 'INVALID_REQUEST' : 'INVALID_REQUEST', status);
    return new GoogleAdapterError('UNAVAILABLE', status);
}
function isRetryableGoogleStatus(status) {
    return status === 429 || status >= 500;
}
function retryAfterMs(attempt) {
    return Math.min(250 * 2 ** attempt, 2_000);
}
//# sourceMappingURL=google.errors.js.map