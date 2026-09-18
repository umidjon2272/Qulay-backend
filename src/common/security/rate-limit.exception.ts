import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(message = 'Too many requests. Try again later.', retryAfterSeconds = 60) {
    super({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message, code: 'RATE_LIMITED', retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
