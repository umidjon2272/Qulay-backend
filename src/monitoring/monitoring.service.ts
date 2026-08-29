import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  constructor(private readonly config: ConfigService) {}

  configured(): boolean { return Boolean(this.config.get<string>('monitoring.sentryDsn')); }

  captureException(error: unknown, context: { path?: string; method?: string; status?: number } = {}): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(JSON.stringify({ event: 'unhandled_exception', message, ...context }));
    const dsn = this.config.get<string>('monitoring.sentryDsn');
    if (!dsn) return;
    void this.sendSentry(dsn, error, context).catch(() => undefined);
  }

  private async sendSentry(dsn: string, error: unknown, context: { path?: string; method?: string; status?: number }) {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.split('/').filter(Boolean).pop();
    if (!projectId || !parsed.username) return;
    const eventId = randomBytes(16).toString('hex');
    const endpoint = `${parsed.protocol}//${parsed.host}${parsed.pathname.slice(0, parsed.pathname.lastIndexOf('/'))}/api/${projectId}/envelope/`;
    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }),
      JSON.stringify({ type: 'event', content_type: 'application/json' }),
      JSON.stringify({
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: 'node',
        level: 'error',
        environment: this.config.get<string>('nodeEnv', 'production'),
        exception: { values: [{ type: error instanceof Error ? error.name : 'Error', value: error instanceof Error ? error.message : String(error), stacktrace: error instanceof Error ? { frames: stackFrames(error.stack) } : undefined }] },
        request: { url: context.path, method: context.method },
        tags: { http_status: String(context.status ?? 500), service: 'qulay-backend' },
      }),
    ].join('\n');
    await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: envelope });
  }
}

function stackFrames(stack?: string) {
  return (stack ?? '').split('\n').slice(1, 30).reverse().map((line) => ({ filename: line.trim(), function: '<unknown>', in_app: true }));
}
