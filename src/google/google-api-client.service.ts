import { Injectable } from '@nestjs/common';
import { classifyGoogleHttpError, isRetryableGoogleStatus, retryAfterMs, GoogleAdapterError } from './google.errors';

type GoogleRequestOptions = {
  method?: string;
  body?: unknown;
  resource: 'calendar' | 'drive' | 'oauth';
};

@Injectable()
export class GoogleApiClientService {
  async request<T>(url: string, accessToken: string, options: GoogleRequestOptions): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: options.method ?? 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const text = await response.text();
        let payload: unknown = null;
        try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
        if (response.ok) return payload as T;
        if (isRetryableGoogleStatus(response.status) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs(attempt)));
          continue;
        }
        throw classifyGoogleHttpError(response.status, payload, options.resource);
      } catch (error) {
        if (error instanceof GoogleAdapterError) throw error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs(attempt)));
          continue;
        }
        throw new GoogleAdapterError('UNAVAILABLE');
      }
    }
    throw new GoogleAdapterError('UNAVAILABLE');
  }
}

