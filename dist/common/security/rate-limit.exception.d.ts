import { HttpException } from '@nestjs/common';
export declare class RateLimitException extends HttpException {
    constructor(message?: string);
}
