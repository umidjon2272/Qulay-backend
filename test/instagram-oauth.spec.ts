import { ConfigService } from '@nestjs/config';
import { InstagramAuthMode } from '@prisma/client';
import { InstagramOAuthService } from '../src/instagram/instagram-oauth.service';
import { InstagramGraphService } from '../src/instagram/instagram-graph.service';

describe('Instagram OAuth', () => {
  const configValues: Record<string, unknown> = {
    'instagram.oauthReady': true,
    'instagram.appId': '1234567890',
    'instagram.appSecret': 'instagram-secret',
    'instagram.oauthRedirectUri': 'https://api.example.com/api/integrations/instagram/callback',
    'instagram.oauthAuthorizationUrl': 'https://www.instagram.com/oauth/authorize',
    'instagram.oauthTokenUrl': 'https://api.instagram.com/oauth/access_token',
    'instagram.oauthLongLivedTokenUrl': 'https://graph.instagram.com/access_token',
    'jwt.accessSecret': 'jwt-secret',
  };

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => configValues[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => {
      const value = configValues[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('builds one-click Instagram Login URL with professional messaging/comment scopes and persists its nonce', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new InstagramOAuthService(
      config,
      { instagramOAuthState: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), create }, user: { findUnique: jest.fn() } } as never,
      { connect: jest.fn() } as never,
    );

    const url = new URL(await service.connectUrl('11111111-1111-1111-1111-111111111111'));

    expect(`${url.origin}${url.pathname}`).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('1234567890');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.com/api/integrations/instagram/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')?.split(',')).toEqual(expect.arrayContaining([
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
    ]));
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: '11111111-1111-1111-1111-111111111111', nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: expect.any(Date) }) });
  });

  it('exchanges callback code and connects the resolved Instagram professional account', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' }) },
      instagramOAuthState: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const integration = { connect: jest.fn().mockResolvedValue({ connected: true }) };
    const service = new InstagramOAuthService(config, prisma as never, integration as never);
    const authUrl = new URL(await service.connectUrl('11111111-1111-1111-1111-111111111111'));
    const state = authUrl.searchParams.get('state') ?? '';

    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"access_token":"short-token-value","user_id":17841400000000001}', { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'long-token-value', token_type: 'bearer', expires_in: 5184000 }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await service.callback('oauth-code', state);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(integration.connect).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', {
      instagramUserId: '17841400000000001',
      accessToken: 'long-token-value',
      authMode: InstagramAuthMode.INSTAGRAM_LOGIN,
      tokenExpiresAt: expect.any(Date),
      tokenRefreshedAt: expect.any(Date),
    });
    const call = integration.connect.mock.calls[0][1];
    expect(call.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 5_000_000_000);
  });

  it('does not persist a short-lived token when long-lived exchange fails', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' }) },
      instagramOAuthState: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const integration = { connect: jest.fn() };
    const service = new InstagramOAuthService(config, prisma as never, integration as never);
    const authUrl = new URL(await service.connectUrl('11111111-1111-1111-1111-111111111111'));
    const state = authUrl.searchParams.get('state') ?? '';

    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"access_token":"short-token-value","user_id":17841400000000001}', { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{"error":{"message":"exchange failed","code":190}}', { status: 400, headers: { 'content-type': 'application/json' } }));

    await expect(service.callback('oauth-code', state)).rejects.toBeDefined();
    expect(integration.connect).not.toHaveBeenCalled();
  });

  it('rejects a replayed OAuth state even after an application restart', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' }) },
      instagramOAuthState: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const integration = { connect: jest.fn().mockResolvedValue({ connected: true }) };
    const first = new InstagramOAuthService(config, prisma as never, integration as never);
    const state = new URL(await first.connectUrl('11111111-1111-1111-1111-111111111111')).searchParams.get('state') ?? '';
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'long-token-value', user_id: 17841400000000001, expires_in: 5184000 }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await first.callback('oauth-code', state);
    const afterRestart = new InstagramOAuthService(config, prisma as never, integration as never);
    await expect(afterRestart.callback('oauth-code-2', state)).rejects.toBeDefined();
    expect(integration.connect).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expiring Instagram Login token before Graph calls without exposing the token', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'u', instagramUserId: '17841400000000001', encryptedAccessToken: 'enc-old',
          authMode: InstagramAuthMode.INSTAGRAM_LOGIN, status: 'CONNECTED',
          tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60_000), tokenRefreshedAt: new Date(Date.now() - 50 * 24 * 60 * 60_000),
        }),
        update,
      },
    };
    const graphConfig = {
      get: jest.fn((key: string, fallback?: unknown) => ({
        'instagram.graphApiVersion': 'v24.0',
        'instagram.loginGraphBaseUrl': 'https://graph.instagram.com',
        'instagram.graphBaseUrl': 'https://graph.facebook.com',
      } as Record<string, unknown>)[key] ?? fallback),
    };
    const crypto = { decrypt: jest.fn(() => 'old-long-token'), encrypt: jest.fn(() => 'ciphertext') };
    const service = new InstagramGraphService(graphConfig as never, prisma as never, crypto as never);
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'refreshed-long-token', token_type: 'bearer', expires_in: 5184000 }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await service.listMedia('u', 1);

    expect(fetchMock.mock.calls[0][0].toString()).toContain('/refresh_access_token?');
    expect(fetchMock.mock.calls[0][0].toString()).toContain('grant_type=ig_refresh_token');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u' },
      data: expect.objectContaining({ encryptedAccessToken: 'ciphertext', tokenExpiresAt: expect.any(Date), tokenRefreshedAt: expect.any(Date) }),
    }));
    expect(JSON.stringify(update.mock.calls)).not.toContain('old-long-token');
    expect(JSON.stringify(update.mock.calls)).not.toContain('refreshed-long-token');
  });

});
