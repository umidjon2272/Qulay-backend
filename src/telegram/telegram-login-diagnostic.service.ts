import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { version as gramJsRuntimeVersion } from 'telegram';
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

  runtimeInfo() {
    const requireFromHere = createRequire(__filename);
    const installed = requireFromHere('telegram/package.json') as { version?: string };
    const lock = this.readLockMetadata();
    const deploymentVersion = this.config.get<string>('deploymentVersion', 'unknown');
    return {
      deploymentVersion,
      nodeVersion: process.version,
      nodeEngine: lock.nodeEngine,
      telegram: {
        declaredRange: lock.declaredRange,
        lockedVersion: lock.lockedVersion,
        installedPackageVersion: installed.version ?? 'unknown',
        gramJsRuntimeVersion,
        lockMatchesInstalled: Boolean(lock.lockedVersion && lock.lockedVersion === installed.version),
      },
    };
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

  private readLockMetadata(): { declaredRange: string | null; lockedVersion: string | null; nodeEngine: string | null } {
    for (const path of [join(process.cwd(), 'package-lock.json'), join(process.cwd(), 'backend', 'package-lock.json')]) {
      try {
        const lock = JSON.parse(readFileSync(path, 'utf8')) as { packages?: Record<string, { version?: string; dependencies?: Record<string, string>; engines?: { node?: string } }> };
        return {
          declaredRange: lock.packages?.['']?.dependencies?.telegram ?? null,
          lockedVersion: lock.packages?.['node_modules/telegram']?.version ?? null,
          nodeEngine: lock.packages?.['']?.engines?.node ?? null,
        };
      } catch {
        // Try the next known project-root layout. No filesystem path is returned.
      }
    }
    return { declaredRange: null, lockedVersion: null, nodeEngine: null };
  }
}
