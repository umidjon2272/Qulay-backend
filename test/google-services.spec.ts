import { GoogleCalendarService, normalizeEvent } from '../src/google/google-calendar.service';
import { GoogleDriveService } from '../src/google/google-drive.service';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from '../src/google/google-auth.service';
import { GoogleConnectionStatus } from '@prisma/client';

describe('Google integration adapters', () => {
  it('normalizes Calendar events without changing timezone-bearing values', () => {
    expect(normalizeEvent({ id: 'e1', summary: 'Demo', start: { dateTime: '2026-08-26T09:00:00+05:00' }, end: { dateTime: '2026-08-26T10:00:00+05:00' }, attendees: [{ email: 'user@example.com', responseStatus: 'accepted' }] })).toEqual(expect.objectContaining({ id: 'e1', title: 'Demo', start: '2026-08-26T09:00:00+05:00', end: '2026-08-26T10:00:00+05:00' }));
  });

  it('normalizes Drive metadata and prepares Docs export metadata without content', async () => {
    const auth = { getAccessToken: jest.fn().mockResolvedValue('access') };
    const api = { request: jest.fn().mockResolvedValue({ files: [{ id: 'f1', name: 'Spec', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-08-26T00:00:00Z', owners: [{ displayName: 'Owner' }] }], nextPageToken: 'next' }) };
    const drive = new GoogleDriveService(auth as any, api as any);
    await expect(drive.list('user-1', { q: 'Spec', limit: 10 })).resolves.toMatchObject({ items: [{ id: 'f1', name: 'Spec', size: null }], nextPageToken: 'next' });
    expect(drive.exportMetadata({ id: 'f1', mimeType: 'application/vnd.google-apps.document' })).toMatchObject({ contentFetched: false, fileId: 'f1' });
  });

  it('uses the mock Google adapter for Calendar writes', async () => {
    const auth = { getAccessToken: jest.fn().mockResolvedValue('access') };
    const api = { request: jest.fn().mockResolvedValue({ id: 'e1', summary: 'Created', start: { dateTime: '2026-08-26T09:00:00Z' }, end: { dateTime: '2026-08-26T10:00:00Z' } }) };
    const activity = { record: jest.fn().mockResolvedValue(undefined) };
    const calendar = new GoogleCalendarService(auth as any, api as any, activity as any);
    await expect(calendar.create('user-1', { title: 'Created', start: '2026-08-26T09:00:00Z', end: '2026-08-26T10:00:00Z' })).resolves.toMatchObject({ id: 'e1', title: 'Created' });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('/calendars/primary/events'), 'access', expect.objectContaining({ method: 'POST' }));
  });

  it('reports not_configured and rejects the connect URL when Google credentials are absent', async () => {
    const auth = new GoogleAuthService(
      new ConfigService({ google: { configured: false } }),
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(auth.status('user-1')).resolves.toEqual(expect.objectContaining({ connected: false, status: 'not_configured' }));
    expect(() => auth.connectUrl('user-1')).toThrow('NOT_CONFIGURED');
  });

  it.each([undefined, 'malformed-state'] as const)('rejects a missing or invalid signed OAuth state: %s', async (state) => {
    const auth = new GoogleAuthService(
      new ConfigService({
        google: { configured: true, clientSecret: 'server-google-secret' },
        jwt: { accessSecret: 'server-jwt-secret' },
      }),
      {} as never, {} as never, {} as never, {} as never,
    );
    await expect(auth.callback('oauth-code', state)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('persists the callback for the signed-state owner and preserves an existing refresh token', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      googleConnection: {
        findUnique: jest.fn().mockResolvedValue({ encryptedRefreshToken: 'encrypted:old-refresh' }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const crypto = { encrypt: jest.fn((value: string) => `encrypted:${value}`) } as any;
    const api = { request: jest.fn().mockResolvedValue({ sub: 'google-1', email: 'user@example.com', name: 'User' }) } as any;
    const activity = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const auth = new GoogleAuthService(new ConfigService({
      google: { configured: true, clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://qulay-backend-y98j.onrender.com/api/integrations/google/callback' },
      jwt: { accessSecret: 'jwt-secret' },
    }), prisma, crypto, api, activity);
    const url = new URL(auth.connectUrl('user-1'));
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://qulay-backend-y98j.onrender.com/api/integrations/google/callback');
    const state = url.searchParams.get('state')!;
    const logSpy = jest.spyOn((auth as unknown as { logger: { log: (...args: unknown[]) => void } }).logger, 'log');
    const warnSpy = jest.spyOn((auth as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger, 'warn');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'access-token', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly' }) } as Response);

    await auth.callback('one-use-code', state);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([...logSpy.mock.calls, ...warnSpy.mock.calls])).not.toContain('one-use-code');
    expect(JSON.stringify([...logSpy.mock.calls, ...warnSpy.mock.calls])).not.toContain('access-token');
    expect(JSON.stringify([...logSpy.mock.calls, ...warnSpy.mock.calls])).not.toContain('old-refresh');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { id: true } });
    expect(prisma.googleConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
      update: expect.objectContaining({ encryptedAccessToken: 'encrypted:access-token', encryptedRefreshToken: 'encrypted:old-refresh', status: GoogleConnectionStatus.CONNECTED }),
    }));
    await expect(auth.callback('second-code', state)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });


  it('keeps OAuth connected when optional userinfo lookup fails after a successful token exchange', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      googleConnection: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const crypto = { encrypt: jest.fn((value: string) => `encrypted:${value}`) } as any;
    const api = { request: jest.fn().mockRejectedValue(new Error('userinfo unavailable')) } as any;
    const activity = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const auth = new GoogleAuthService(new ConfigService({
      google: { configured: true, clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://qulay-backend-y98j.onrender.com/api/integrations/google/callback' },
      jwt: { accessSecret: 'jwt-secret' },
    }), prisma, crypto, api, activity);
    const state = new URL(auth.connectUrl('user-1')).searchParams.get('state')!;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'access-token', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly' }) } as Response);

    await expect(auth.callback('oauth-code', state)).resolves.toBeUndefined();
    expect(prisma.googleConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: GoogleConnectionStatus.CONNECTED, googleUserId: null }),
    }));
    fetchSpy.mockRestore();
  });

  it('treats broader Calendar and Drive scopes as service-enabled without requiring redundant narrower scopes', async () => {
    const prisma = { googleConnection: { findUnique: jest.fn().mockResolvedValue({ status: GoogleConnectionStatus.CONNECTED, email: null, displayName: null, connectedAt: null, scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/drive.readonly'] }) } } as any;
    const auth = new GoogleAuthService(new ConfigService({ google: { configured: true } }), prisma, {} as any, {} as any, {} as any);
    await expect(auth.status('user-1')).resolves.toMatchObject({ connected: true, calendarEnabled: true, driveEnabled: true });
  });

  it('returns a secret-free connected status for the JWT user', async () => {
    const prisma = { googleConnection: { findUnique: jest.fn().mockResolvedValue({ status: GoogleConnectionStatus.CONNECTED, email: 'user@example.com', displayName: 'User', connectedAt: new Date('2026-08-28T00:00:00Z'), scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/drive.readonly'], encryptedAccessToken: 'secret' }) } } as any;
    const auth = new GoogleAuthService(new ConfigService({ google: { configured: true } }), prisma, {} as any, {} as any, {} as any);
    const status = await auth.status('user-1');
    expect(status).toMatchObject({ configured: true, connected: true, status: GoogleConnectionStatus.CONNECTED, email: 'user@example.com', calendarEnabled: true, driveEnabled: true });
    expect(JSON.stringify(status)).not.toContain('secret');
  });
});
