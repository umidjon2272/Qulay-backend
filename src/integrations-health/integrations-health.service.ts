import { Injectable } from '@nestjs/common';
import { GoogleAuthService } from '../google/google-auth.service';
import { TelegramIntegrationService } from '../telegram/telegram-integration.service';

export type IntegrationHealthState = 'CONNECTED' | 'TEMPORARY_ISSUE' | 'RECONNECT_REQUIRED' | 'DISCONNECTED';

const AUTH_FAILURE_CODES = new Set(['TOKEN_REVOKED', 'AUTH_KEY_UNREGISTERED', 'SESSION_REVOKED', 'invalid_grant']);
const RECENT_ERROR_WINDOW_MS = 15 * 60 * 1000;

const ERROR_CODE_LABELS: Record<string, string> = {
  TOKEN_REVOKED: 'Ruxsat bekor qilingan',
  UNAVAILABLE: 'Vaqtincha ulanib bo‘lmadi',
  AUTH_KEY_UNREGISTERED: 'Sessiya yaroqsiz',
  SESSION_REVOKED: 'Sessiya bekor qilingan',
};

export type IntegrationHealth = {
  state: IntegrationHealthState;
  connected: boolean;
  lastSuccessfulSyncAt: string | null;
  lastCheckedAt: string;
  lastErrorCode: string | null;
};

/**
 * Combines Google's and Telegram's own status() checks into the 4-state vocabulary the
 * Integrations UI shows. Both services already distinguish transient network errors from
 * permanent auth failures; this layer only maps that into a single presentation contract
 * and never mutates connection state itself.
 */
@Injectable()
export class IntegrationsHealthService {
  constructor(
    private readonly googleAuth: GoogleAuthService,
    private readonly telegramIntegration: TelegramIntegrationService,
  ) {}

  async getHealthForUser(userId: string): Promise<{ google: IntegrationHealth; telegram: IntegrationHealth }> {
    const [google, telegram] = await Promise.all([
      this.googleAuth.status(userId),
      this.telegramIntegration.status(userId),
    ]);

    const checkedAt = new Date().toISOString();

    const googleRecentError = this.isRecent(google.lastErrorAt);
    const googleState = this.classify({
      connected: google.connected,
      hasAuthFailureCode: this.isAuthFailureCode(google.lastErrorCode),
      recentError: googleRecentError,
    });

    const telegramState = this.classify({
      connected: telegram.connected,
      hasAuthFailureCode: this.isAuthFailureCode(telegram.lastErrorCode),
      recentError: Boolean(telegram.temporaryError),
    });

    return {
      google: {
        state: googleState,
        connected: google.connected,
        lastSuccessfulSyncAt: google.connectedAt,
        lastCheckedAt: checkedAt,
        lastErrorCode: googleState === 'DISCONNECTED' ? null : this.friendlyErrorCode(google.lastErrorCode),
      },
      telegram: {
        state: telegramState,
        connected: telegram.connected,
        lastSuccessfulSyncAt: telegram.lastValidatedAt ? new Date(telegram.lastValidatedAt).toISOString() : null,
        lastCheckedAt: checkedAt,
        lastErrorCode: telegramState === 'DISCONNECTED' ? null : this.friendlyErrorCode(telegram.lastErrorCode),
      },
    };
  }

  private classify(input: { connected: boolean; hasAuthFailureCode: boolean; recentError: boolean }): IntegrationHealthState {
    if (input.connected && !input.recentError) return 'CONNECTED';
    if (input.connected && input.recentError) return 'TEMPORARY_ISSUE';
    if (!input.connected && input.hasAuthFailureCode) return 'RECONNECT_REQUIRED';
    return 'DISCONNECTED';
  }

  private isAuthFailureCode(code: string | null | undefined): boolean {
    return Boolean(code) && AUTH_FAILURE_CODES.has(code as string);
  }

  private isRecent(value: string | null | undefined): boolean {
    if (!value) return false;
    return Date.now() - new Date(value).getTime() < RECENT_ERROR_WINDOW_MS;
  }

  private friendlyErrorCode(code: string | null | undefined): string | null {
    if (!code) return null;
    return ERROR_CODE_LABELS[code] ?? 'Nomaʼlum xatolik';
  }
}
