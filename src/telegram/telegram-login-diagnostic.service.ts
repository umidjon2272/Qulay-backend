import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { classifyTelegramError } from './telegram.errors';
import { TelegramClientService } from './telegram-client.service';

@Injectable()
export class TelegramLoginDiagnosticService {
  private readonly logger = new Logger(TelegramLoginDiagnosticService.name);
  private running = false;
  private lastStartedAt = 0;
  private readonly cooldownMs = 10 * 60_000;

  constructor(private readonly config: ConfigService, private readonly telegramClient: TelegramClientService) {}

  status() {
    return { enabled: this.config.get<boolean>('telegram.loginDiagnosticEnabled', false), deploymentVersion: this.config.get<string>('deploymentVersion', 'unknown') };
  }

  async run(actorId: string): Promise<{ accepted: true; diagnosticId: string; deploymentVersion: string }> {
    const { enabled, deploymentVersion } = this.status();
    if (!enabled) throw new NotFoundException('Telegram login diagnostic is disabled');
    const phone = this.config.get<string>('telegram.testPhone')?.trim();
    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) throw new ServiceUnavailableException('TEST_TELEGRAM_PHONE is missing or invalid');
    const now = Date.now();
    if (this.running) throw new ConflictException('Telegram login diagnostic is already running');
    if (now - this.lastStartedAt < this.cooldownMs) throw new ConflictException('Telegram login diagnostic was already started recently');

    this.running = true;
    this.lastStartedAt = now;
    const diagnosticId = randomUUID();
    const safeContext = { event: 'telegram_login_diagnostic', diagnosticId, actorId, deploymentVersion, phoneSource: 'TEST_TELEGRAM_PHONE', normalizedE164: true };
    try {
      const result = await this.telegramClient.beginLogin(phone, `diagnostic:${actorId}`);
      this.logger.log({ ...safeContext, outcome: 'completed', delivery: result.delivery, rawType: result.rawType, nextType: result.rawNextType, timeout: result.timeoutSeconds, dc: result.selectedDcId, errorType: null });
      return { accepted: true, diagnosticId, deploymentVersion };
    } catch (error) {
      const classified = classifyTelegramError(error);
      this.logger.warn({ ...safeContext, outcome: 'failed', delivery: null, rawType: null, nextType: null, timeout: null, dc: null, errorType: classified.code });
      throw new ServiceUnavailableException('Telegram login diagnostic failed; inspect the safe server log metadata');
    } finally {
      this.running = false;
    }
  }
}
