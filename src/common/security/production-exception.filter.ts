import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { Request, Response } from 'express';
import { MonitoringService } from '../../monitoring/monitoring.service';

@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  constructor(@Optional() private readonly monitoring?: MonitoringService) {}

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
      this.monitoring?.captureException(exception, { path: request.url, method: request.method, status });
      response.status(status).json({
        statusCode: status,
        message: 'Internal server error',
        path: request.url,
      });
      return;
    }

    const payload = exception instanceof HttpException ? exception.getResponse() : { statusCode: status, message: 'Request failed' };
    const body = typeof payload === 'string' ? { statusCode: status, message: payload } : payload;
    // `code` lets the frontend show a localized message without parsing English/Uzbek
    // exception text. Throw sites that haven't been migrated yet fall back to this
    // generic code, which the frontend maps to its existing status-based message —
    // so this is purely additive and never changes behavior for unmigrated call sites.
    const withCode = 'code' in body ? body : { ...body, code: 'GENERIC_ERROR' };
    response.status(status).json(withCode);
  }
}
