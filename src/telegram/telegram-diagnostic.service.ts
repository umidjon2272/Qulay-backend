import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

export type TelegramSendCodeDiagnosticResult = {
  connected: boolean;
  authorized: boolean;
  returnedType: string;
  nextType: string | null;
  timeout: number | null;
  selectedDc: number | null;
};

/** Temporary diagnostic-only service. It never reads or writes production Telegram auth state. */
@Injectable()
export class TelegramDiagnosticService {
  private readonly apiId: number | undefined;
  private readonly apiHash: string | undefined;

  constructor(config: ConfigService) {
    this.apiId = config.get<number>('telegram.apiId');
    this.apiHash = config.get<string>('telegram.apiHash');
  }

  async sendCode(phoneNumber: string): Promise<TelegramSendCodeDiagnosticResult> {
    const apiId = this.apiId;
    const apiHash = this.apiHash;
    if (!Number.isSafeInteger(apiId) || !apiId || !apiHash) {
      throw new ServiceUnavailableException('Telegram diagnostic is not configured');
    }

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });
    client.setLogLevel(LogLevel.NONE);
    let connected = false;

    try {
      await client.connect();
      connected = true;
      const authorized = await client.checkAuthorization();
      if (authorized) throw new ServiceUnavailableException('Fresh Telegram diagnostic session was unexpectedly authorized');

      const result = await client.invoke(new Api.auth.SendCode({
        phoneNumber,
        apiId,
        apiHash,
        settings: new Api.CodeSettings({}),
      }));

      return {
        connected,
        authorized,
        returnedType: result.className,
        nextType: result instanceof Api.auth.SentCode ? result.nextType?.className ?? null : null,
        timeout: result instanceof Api.auth.SentCode ? result.timeout ?? null : null,
        selectedDc: client.session.dcId || null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Telegram diagnostic request failed');
    } finally {
      if (connected) await client.disconnect().catch(() => undefined);
    }
  }
}
