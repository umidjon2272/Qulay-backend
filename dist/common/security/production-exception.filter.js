"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let ProductionExceptionFilter = class ProductionExceptionFilter {
    catch(exception, host) {
        const context = host.switchToHttp();
        const response = context.getResponse();
        const request = context.getRequest();
        const parserOrUploadError = exception;
        if (parserOrUploadError.code === 'LIMIT_FILE_SIZE') {
            response.status(common_1.HttpStatus.BAD_REQUEST).json({ statusCode: common_1.HttpStatus.BAD_REQUEST, message: 'File is too large' });
            return;
        }
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : parserOrUploadError.status === common_1.HttpStatus.PAYLOAD_TOO_LARGE || parserOrUploadError.statusCode === common_1.HttpStatus.PAYLOAD_TOO_LARGE
                ? common_1.HttpStatus.PAYLOAD_TOO_LARGE
                : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        if (status === common_1.HttpStatus.PAYLOAD_TOO_LARGE && (request.headers['content-type']?.startsWith('multipart/form-data') || request.url.includes('/files/upload'))) {
            response.status(common_1.HttpStatus.BAD_REQUEST).json({ statusCode: common_1.HttpStatus.BAD_REQUEST, message: 'File is too large' });
            return;
        }
        if (status === common_1.HttpStatus.PAYLOAD_TOO_LARGE) {
            response.status(status).json({ statusCode: status, message: 'Payload too large', path: request.url });
            return;
        }
        if (status >= 500) {
            response.status(status).json({
                statusCode: status,
                message: 'Internal server error',
                path: request.url,
            });
            return;
        }
        const payload = exception instanceof common_1.HttpException ? exception.getResponse() : { statusCode: status, message: 'Request failed' };
        response.status(status).json(typeof payload === 'string' ? { statusCode: status, message: payload } : payload);
    }
};
exports.ProductionExceptionFilter = ProductionExceptionFilter;
exports.ProductionExceptionFilter = ProductionExceptionFilter = __decorate([
    (0, common_1.Catch)()
], ProductionExceptionFilter);
//# sourceMappingURL=production-exception.filter.js.map