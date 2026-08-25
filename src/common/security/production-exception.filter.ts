import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const parserOrUploadError = exception as { status?: number; statusCode?: number; code?: string };
    if (parserOrUploadError.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.BAD_REQUEST).json({ statusCode: HttpStatus.BAD_REQUEST, message: 'File is too large' });
      return;
    }
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : parserOrUploadError.status === HttpStatus.PAYLOAD_TOO_LARGE || parserOrUploadError.statusCode === HttpStatus.PAYLOAD_TOO_LARGE
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status === HttpStatus.PAYLOAD_TOO_LARGE && (request.headers['content-type']?.startsWith('multipart/form-data') || request.url.includes('/files/upload'))) {
      response.status(HttpStatus.BAD_REQUEST).json({ statusCode: HttpStatus.BAD_REQUEST, message: 'File is too large' });
      return;
    }

    if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
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

    const payload = exception instanceof HttpException ? exception.getResponse() : { statusCode: status, message: 'Request failed' };
    response.status(status).json(typeof payload === 'string' ? { statusCode: status, message: payload } : payload);
  }
}
