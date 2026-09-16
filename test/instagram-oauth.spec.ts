import { ConfigService } from '@nestjs/config';
import { InstagramAuthMode } from '@prisma/client';
import { InstagramOAuthService } from '../src/instagram/instagram-oauth.service';

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

  it('builds one-click Instagram Login URL with professional messaging/comment scopes', () => {
    const service = new InstagramOAuthService(
      config,
      { user: { findUnique: jest.fn() } } as never,
      { connect: jest.fn() } as never,
    );

    const url = new URL(service.connectUrl('11111111-1111-1111-1111-111111111111'));

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
  });

  it('exchanges callback code and connects the resolved Instagram professional account', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' }) } };
    const integration = { connect: jest.fn().mockResolvedValue({ connected: true }) };
    const service = new InstagramOAuthService(config, prisma as never, integration as never);
    const authUrl = new URL(service.connectUrl('11111111-1111-1111-1111-111111111111'));
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
    });
  });

  it('does not persist a short-lived token when long-lived exchange fails', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' }) } };
    const integration = { connect: jest.fn() };
    const service = new InstagramOAuthService(config, prisma as never, integration as never);
    const authUrl = new URL(service.connectUrl('11111111-1111-1111-1111-111111111111'));
    const state = authUrl.searchParams.get('state') ?? '';

    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"access_token":"short-token-value","user_id":17841400000000001}', { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{"error":{"message":"exchange failed","code":190}}', { status: 400, headers: { 'content-type': 'application/json' } }));

    await expect(service.callback('oauth-code', state)).rejects.toBeDefined();
    expect(integration.connect).not.toHaveBeenCalled();
  });

});
