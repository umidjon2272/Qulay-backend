import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitoAuthMode, BitoConnection, BitoConnectionStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { BitoCryptoService } from './bito-crypto.service';
import { BitoMcpClient } from './bito-mcp.client';
import { BitoUrlPolicyService } from './bito-url-policy.service';

type ProtectedResourceMetadata = {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
};

type AuthorizationServerMetadata = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  grant_types_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  client_id_metadata_document_supported?: boolean;
};

type RegisteredClient = {
  client_id: string;
  client_secret?: string;
  token_endpoint_auth_method?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type Discovery = {
  resource: string;
  authorizationServer: string;
  metadata: AuthorizationServerMetadata;
  scope: string | null;
};

type ClientIdentity = {
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod: string;
};

export type BitoAuthorizationStart =
  | { status: 'connected'; authorizationUrl: null; serverName: string; toolCount: number }
  | { status: 'authorization_required'; authorizationUrl: string; serverName: string | null; toolCount: 0 };

@Injectable()
export class BitoOAuthService {
  private readonly logger = new Logger(BitoOAuthService.name);
  private readonly timeoutMs: number;
  private readonly refreshes = new Map<string, Promise<string>>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: BitoCryptoService,
    private readonly mcp: BitoMcpClient,
    private readonly urls: BitoUrlPolicyService,
    private readonly activityLog: ActivityLogService,
  ) {
    this.timeoutMs = config.get<number>('bito.timeoutMs', 15_000);
  }

  oauthReady(): boolean {
    return this.crypto.configured() && Boolean(this.redirectUriOrUndefined());
  }

  defaultServerUrl(): string {
    return this.urls.assertMcpServerUrl(this.config.get<string>('bito.serverUrl', 'https://mcp.bito.online'));
  }

  clientMetadata() {
    const redirectUri = this.redirectUri();
    const clientId = this.clientMetadataUrl();
    return {
      client_id: clientId,
      client_name: 'Qulay AI',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  async begin(userId: string, serverUrlInput?: string): Promise<BitoAuthorizationStart> {
    if (!this.crypto.configured()) throw new ServiceUnavailableException('Bito integratsiyasi uchun BITO_CREDENTIAL_ENCRYPTION_KEY sozlanmagan');
    const serverUrl = this.urls.assertMcpServerUrl(serverUrlInput?.trim() || this.defaultServerUrl());

    try {
      const probe = await this.mcp.probe({ serverUrl, authMode: BitoAuthMode.NONE });
      const now = new Date();
      const serverName = probe.serverName ?? new URL(serverUrl).hostname;
      await this.prisma.bitoConnection.upsert({
        where: { userId },
        create: {
          userId,
          encryptedServerUrl: this.crypto.encrypt(serverUrl),
          authMode: BitoAuthMode.NONE,
          status: BitoConnectionStatus.CONNECTED,
          serverName,
          protocolVersion: probe.protocolVersion,
          toolCount: probe.tools.length,
          connectedAt: now,
          lastUsedAt: now,
        },
        update: {
          encryptedServerUrl: this.crypto.encrypt(serverUrl),
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          accessTokenExpiresAt: null,
          authMode: BitoAuthMode.NONE,
          status: BitoConnectionStatus.CONNECTED,
          serverName,
          protocolVersion: probe.protocolVersion,
          toolCount: probe.tools.length,
          connectedAt: now,
          lastUsedAt: now,
          lastErrorAt: null,
          lastErrorCode: null,
          ...this.clearPendingOAuth(),
        },
      });
      await this.recordConnected(userId, serverName, probe.tools.length, 'NONE');
      return { status: 'connected', authorizationUrl: null, serverName, toolCount: probe.tools.length };
    } catch (error) {
      if (!this.isAuthFailure(error)) throw error;
    }

    const redirectUri = this.redirectUri();
    const discovery = await this.discover(serverUrl);
    const existing = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    const client = await this.resolveClient(discovery, existing, redirectUri);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const authEndpoint = this.urls.assertDiscoveredOAuthUrl(this.required(discovery.metadata.authorization_endpoint, 'BITO_OAUTH_AUTHORIZATION_ENDPOINT_MISSING'));
    const tokenEndpoint = this.urls.assertDiscoveredOAuthUrl(this.required(discovery.metadata.token_endpoint, 'BITO_OAUTH_TOKEN_ENDPOINT_MISSING'));
    const issuer = discovery.metadata.issuer ? this.urls.assertDiscoveredOAuthUrl(discovery.metadata.issuer) : discovery.authorizationServer;
    const registrationEndpoint = discovery.metadata.registration_endpoint ? this.urls.assertDiscoveredOAuthUrl(discovery.metadata.registration_endpoint) : null;
    const revocationEndpoint = discovery.metadata.revocation_endpoint ? this.urls.assertDiscoveredOAuthUrl(discovery.metadata.revocation_endpoint) : null;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: discovery.resource,
    });
    if (discovery.scope) params.set('scope', discovery.scope);

    await this.prisma.bitoConnection.upsert({
      where: { userId },
      create: {
        userId,
        encryptedServerUrl: this.crypto.encrypt(serverUrl),
        authMode: BitoAuthMode.BEARER,
        status: BitoConnectionStatus.AUTHORIZING,
        oauthStateHash: this.stateHash(state),
        encryptedPkceVerifier: this.crypto.encrypt(verifier),
        oauthExpiresAt: expiresAt,
        oauthIssuer: issuer,
        oauthResource: discovery.resource,
        authorizationEndpoint: authEndpoint,
        tokenEndpoint,
        registrationEndpoint,
        revocationEndpoint,
        oauthClientId: client.clientId,
        encryptedOauthClientSecret: client.clientSecret ? this.crypto.encrypt(client.clientSecret) : null,
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        oauthScopes: discovery.scope ? discovery.scope.split(/\s+/).filter(Boolean) : [],
        lastErrorAt: null,
        lastErrorCode: null,
      },
      update: {
        encryptedServerUrl: this.crypto.encrypt(serverUrl),
        authMode: BitoAuthMode.BEARER,
        status: BitoConnectionStatus.AUTHORIZING,
        oauthStateHash: this.stateHash(state),
        encryptedPkceVerifier: this.crypto.encrypt(verifier),
        oauthExpiresAt: expiresAt,
        oauthIssuer: issuer,
        oauthResource: discovery.resource,
        authorizationEndpoint: authEndpoint,
        tokenEndpoint,
        registrationEndpoint,
        revocationEndpoint,
        oauthClientId: client.clientId,
        encryptedOauthClientSecret: client.clientSecret ? this.crypto.encrypt(client.clientSecret) : null,
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
        oauthScopes: discovery.scope ? discovery.scope.split(/\s+/).filter(Boolean) : [],
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        accessTokenExpiresAt: null,
        connectedAt: null,
        protocolVersion: null,
        toolCount: 0,
        lastUsedAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
      },
    });

    return {
      status: 'authorization_required',
      authorizationUrl: `${authEndpoint}${authEndpoint.includes('?') ? '&' : '?'}${params.toString()}`,
      serverName: existing?.serverName ?? new URL(serverUrl).hostname,
      toolCount: 0,
    };
  }

  async callback(code: string | undefined, stateValue: string | undefined, oauthError?: string, callbackIssuer?: string): Promise<void> {
    if (!stateValue || stateValue.length > 4096) throw new BadRequestException('BITO_OAUTH_STATE_INVALID');
    const connection = await this.prisma.bitoConnection.findUnique({ where: { oauthStateHash: this.stateHash(stateValue) } });
    if (!connection || connection.status !== BitoConnectionStatus.AUTHORIZING) throw new BadRequestException('BITO_OAUTH_STATE_INVALID');
    if (!connection.oauthExpiresAt || connection.oauthExpiresAt.getTime() < Date.now()) {
      await this.markError(connection.userId, 'BITO_OAUTH_STATE_EXPIRED', true);
      throw new BadRequestException('BITO_OAUTH_STATE_EXPIRED');
    }
    if (callbackIssuer && connection.oauthIssuer && !this.sameIssuer(callbackIssuer, connection.oauthIssuer)) {
      await this.markError(connection.userId, 'BITO_OAUTH_ISSUER_MISMATCH', true);
      throw new BadRequestException('BITO_OAUTH_ISSUER_MISMATCH');
    }
    if (oauthError) {
      const codeValue = oauthError === 'access_denied' ? 'BITO_OAUTH_CANCELLED' : 'BITO_OAUTH_PROVIDER_ERROR';
      if (codeValue === 'BITO_OAUTH_CANCELLED') {
        await this.prisma.bitoConnection.update({
          where: { id: connection.id },
          data: {
            status: BitoConnectionStatus.DISCONNECTED,
            lastErrorAt: null,
            lastErrorCode: null,
            ...this.clearPendingOAuth(),
          },
        }).catch(() => undefined);
      } else {
        await this.markError(connection.userId, codeValue, true);
      }
      throw new BadRequestException(codeValue);
    }
    if (!code || code.length > 4096) {
      await this.markError(connection.userId, 'BITO_OAUTH_CODE_MISSING', true);
      throw new BadRequestException('BITO_OAUTH_CODE_MISSING');
    }

    try {
      const token = await this.exchangeAuthorizationCode(connection, code);
      const accessToken = this.required(token.access_token, 'BITO_OAUTH_TOKEN_MISSING');
      const serverUrl = this.crypto.decrypt(connection.encryptedServerUrl);
      const probe = await this.mcp.probe({ serverUrl, authMode: BitoAuthMode.BEARER, accessToken });
      const now = new Date();
      const serverName = probe.serverName ?? new URL(serverUrl).hostname;
      const scopes = this.normalizeScopes(token.scope, connection.oauthScopes);
      await this.prisma.bitoConnection.update({
        where: { id: connection.id },
        data: {
          encryptedAccessToken: this.crypto.encrypt(accessToken),
          encryptedRefreshToken: token.refresh_token ? this.crypto.encrypt(token.refresh_token) : connection.encryptedRefreshToken,
          accessTokenExpiresAt: this.tokenExpiry(token.expires_in),
          oauthScopes: scopes,
          authMode: BitoAuthMode.BEARER,
          status: BitoConnectionStatus.CONNECTED,
          serverName,
          protocolVersion: probe.protocolVersion,
          toolCount: probe.tools.length,
          connectedAt: now,
          lastUsedAt: now,
          lastErrorAt: null,
          lastErrorCode: null,
          ...this.clearPendingOAuth(),
        },
      });
      await this.recordConnected(connection.userId, serverName, probe.tools.length, 'OAUTH');
    } catch (error) {
      const errorCode = this.oauthErrorCode(error);
      await this.markError(connection.userId, errorCode, true);
      throw error;
    }
  }

  async accessToken(userId: string, forceRefresh = false): Promise<string> {
    const connection = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    if (!connection || ![BitoConnectionStatus.CONNECTED, BitoConnectionStatus.ERROR].includes(connection.status as 'CONNECTED' | 'ERROR') || connection.authMode !== BitoAuthMode.BEARER) {
      throw new ServiceUnavailableException('BITO_AUTH_FAILED');
    }
    if (!forceRefresh && connection.encryptedAccessToken && (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt.getTime() > Date.now() + 45_000)) {
      return this.crypto.decrypt(connection.encryptedAccessToken);
    }
    if (!connection.encryptedRefreshToken) {
      if (!forceRefresh && connection.encryptedAccessToken && !connection.accessTokenExpiresAt) return this.crypto.decrypt(connection.encryptedAccessToken);
      await this.markError(userId, 'BITO_AUTH_FAILED', false);
      throw new ServiceUnavailableException('BITO_AUTH_FAILED');
    }
    const existing = this.refreshes.get(userId);
    if (existing) return existing;
    const refresh = this.refreshConnection(connection).finally(() => this.refreshes.delete(userId));
    this.refreshes.set(userId, refresh);
    return refresh;
  }

  async revoke(userId: string): Promise<void> {
    const connection = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    if (!connection?.revocationEndpoint || !connection.encryptedAccessToken || !connection.oauthClientId) return;
    try {
      const endpoint = this.urls.assertDiscoveredOAuthUrl(connection.revocationEndpoint);
      const token = this.crypto.decrypt(connection.encryptedAccessToken);
      const form = new URLSearchParams({ token, client_id: connection.oauthClientId });
      const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
      this.applyClientAuthentication(headers, form, connection);
      await this.fetchWithTimeout(endpoint, { method: 'POST', headers, body: form.toString(), redirect: 'error' });
    } catch {
      this.logger.warn({ event: 'bito_oauth_revoke_failed', userId: this.fingerprint(userId) });
    }
  }

  private async discover(serverUrl: string): Promise<Discovery> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'qulay-ai', version: '1.0.0' } },
        }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (response.status !== 401 && response.status !== 403) throw new BadGatewayException(`BITO_OAUTH_DISCOVERY_HTTP_${response.status}`);
      const challenge = response.headers.get('www-authenticate') ?? '';
      const challengeMetadataUrl = this.challengeParameter(challenge, 'resource_metadata');
      const challengeScope = this.challengeParameter(challenge, 'scope');
      let resourceMetadata: ProtectedResourceMetadata | null = null;
      try {
        resourceMetadata = await this.protectedResourceMetadata(serverUrl, challengeMetadataUrl);
      } catch (error) {
        // Compatibility with older MCP OAuth deployments that predate RFC9728 discovery.
        this.logger.warn({ event: 'bito_oauth_resource_metadata_legacy_fallback', errorType: error instanceof Error ? error.constructor.name : 'Unknown' });
      }
      const authorizationServers = Array.isArray(resourceMetadata?.authorization_servers)
        ? resourceMetadata.authorization_servers.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [];
      const authorizationServer = authorizationServers.length > 0
        ? this.urls.assertDiscoveredOAuthUrl(authorizationServers[0])
        : new URL(serverUrl).origin;
      const metadata = await this.authorizationServerMetadata(authorizationServer);
      if (metadata.code_challenge_methods_supported && !metadata.code_challenge_methods_supported.includes('S256')) {
        throw new BadGatewayException('BITO_OAUTH_PKCE_S256_UNSUPPORTED');
      }
      const resource = resourceMetadata?.resource
        ? this.urls.assertProtectedResourceIdentifier(resourceMetadata.resource, serverUrl)
        : this.canonicalResource(serverUrl);
      const scope = challengeScope || this.minimumScope(resourceMetadata?.scopes_supported, metadata.scopes_supported);
      return { resource, authorizationServer, metadata, scope };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException || error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ServiceUnavailableException('BITO_OAUTH_DISCOVERY_TIMEOUT');
      throw new ServiceUnavailableException('BITO_OAUTH_DISCOVERY_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  private async protectedResourceMetadata(serverUrl: string, challengeUrl?: string): Promise<ProtectedResourceMetadata> {
    const server = new URL(serverUrl);
    const candidates: string[] = [];
    if (challengeUrl) candidates.push(this.urls.assertProtectedResourceMetadataUrl(challengeUrl, serverUrl));
    const path = server.pathname === '/' ? '' : server.pathname.replace(/\/$/, '');
    candidates.push(`${server.origin}/.well-known/oauth-protected-resource${path}`);
    if (path) candidates.push(`${server.origin}/.well-known/oauth-protected-resource`);

    let lastError: unknown;
    for (const candidate of [...new Set(candidates)]) {
      try {
        const validated = this.urls.assertProtectedResourceMetadataUrl(candidate, serverUrl);
        const value = await this.fetchJson<ProtectedResourceMetadata>(validated);
        if (Array.isArray(value.authorization_servers) && value.authorization_servers.length > 0) return value;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) this.logger.warn({ event: 'bito_oauth_resource_metadata_failed', errorType: lastError.constructor.name });
    throw new BadGatewayException('BITO_OAUTH_RESOURCE_METADATA_UNAVAILABLE');
  }

  private async authorizationServerMetadata(authorizationServer: string): Promise<AuthorizationServerMetadata> {
    const issuer = new URL(authorizationServer);
    const path = issuer.pathname === '/' ? '' : issuer.pathname.replace(/\/$/, '');
    const candidates = [
      `${issuer.origin}/.well-known/oauth-authorization-server${path}`,
      `${issuer.origin}/.well-known/openid-configuration${path}`,
      `${authorizationServer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`,
      `${authorizationServer.replace(/\/$/, '')}/.well-known/openid-configuration`,
    ];
    let lastError: unknown;
    for (const candidate of [...new Set(candidates)]) {
      try {
        const validated = this.urls.assertDiscoveredOAuthUrl(candidate);
        const metadata = await this.fetchJson<AuthorizationServerMetadata>(validated);
        if (metadata.issuer && !this.sameIssuer(metadata.issuer, authorizationServer)) {
          lastError = new Error('BITO_OAUTH_ISSUER_METADATA_MISMATCH');
          continue;
        }
        if (metadata.authorization_endpoint && metadata.token_endpoint) return metadata;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) this.logger.warn({ event: 'bito_oauth_server_metadata_failed', errorType: lastError.constructor.name });
    throw new BadGatewayException('BITO_OAUTH_SERVER_METADATA_UNAVAILABLE');
  }

  private async resolveClient(discovery: Discovery, existing: BitoConnection | null, redirectUri: string): Promise<ClientIdentity> {
    const metadata = discovery.metadata;
    const configuredClientId = this.config.get<string>('bito.oauthClientId');
    const configuredSecret = this.config.get<string>('bito.oauthClientSecret');
    if (configuredClientId) {
      return {
        clientId: configuredClientId,
        ...(configuredSecret ? { clientSecret: configuredSecret } : {}),
        tokenEndpointAuthMethod: this.preferredTokenAuthMethod(metadata, Boolean(configuredSecret)),
      };
    }

    if (existing?.oauthClientId && existing.oauthIssuer && this.sameIssuer(existing.oauthIssuer, metadata.issuer ?? discovery.authorizationServer)) {
      return {
        clientId: existing.oauthClientId,
        ...(existing.encryptedOauthClientSecret ? { clientSecret: this.crypto.decrypt(existing.encryptedOauthClientSecret) } : {}),
        tokenEndpointAuthMethod: existing.tokenEndpointAuthMethod ?? this.preferredTokenAuthMethod(metadata, Boolean(existing.encryptedOauthClientSecret)),
      };
    }

    if (metadata.client_id_metadata_document_supported === true) {
      return { clientId: this.clientMetadataUrl(), tokenEndpointAuthMethod: 'none' };
    }

    if (!metadata.registration_endpoint) throw new BadGatewayException('BITO_OAUTH_CLIENT_REGISTRATION_REQUIRED');
    const endpoint = this.urls.assertDiscoveredOAuthUrl(metadata.registration_endpoint);
    const grantTypes = ['authorization_code'];
    if (metadata.grant_types_supported?.includes('refresh_token')) grantTypes.push('refresh_token');
    const supportedAuthMethods = metadata.token_endpoint_auth_methods_supported ?? [];
    const requestedAuthMethod = supportedAuthMethods.length === 0 || supportedAuthMethods.includes('none')
      ? 'none'
      : supportedAuthMethods.includes('client_secret_basic')
        ? 'client_secret_basic'
        : supportedAuthMethods.includes('client_secret_post')
          ? 'client_secret_post'
          : 'none';
    const body = {
      client_name: 'Qulay AI',
      redirect_uris: [redirectUri],
      grant_types: grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: requestedAuthMethod,
    };
    const registered = await this.fetchJson<RegisteredClient>(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!registered.client_id) throw new BadGatewayException('BITO_OAUTH_CLIENT_REGISTRATION_FAILED');
    return {
      clientId: registered.client_id,
      ...(registered.client_secret ? { clientSecret: registered.client_secret } : {}),
      tokenEndpointAuthMethod: registered.token_endpoint_auth_method ?? (registered.client_secret ? 'client_secret_basic' : 'none'),
    };
  }

  private async exchangeAuthorizationCode(connection: BitoConnection, code: string): Promise<TokenResponse> {
    if (!connection.tokenEndpoint || !connection.oauthClientId || !connection.encryptedPkceVerifier || !connection.oauthResource) {
      throw new BadRequestException('BITO_OAUTH_PENDING_STATE_INCOMPLETE');
    }
    const endpoint = this.urls.assertDiscoveredOAuthUrl(connection.tokenEndpoint);
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(),
      client_id: connection.oauthClientId,
      code_verifier: this.crypto.decrypt(connection.encryptedPkceVerifier),
      resource: connection.oauthResource,
    });
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    this.applyClientAuthentication(headers, form, connection);
    return this.tokenRequest(endpoint, headers, form);
  }

  private async refreshConnection(connection: BitoConnection): Promise<string> {
    if (!connection.tokenEndpoint || !connection.oauthClientId || !connection.encryptedRefreshToken || !connection.oauthResource) {
      await this.markError(connection.userId, 'BITO_AUTH_FAILED', false);
      throw new ServiceUnavailableException('BITO_AUTH_FAILED');
    }
    try {
      const endpoint = this.urls.assertDiscoveredOAuthUrl(connection.tokenEndpoint);
      const form = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.crypto.decrypt(connection.encryptedRefreshToken),
        client_id: connection.oauthClientId,
        resource: connection.oauthResource,
      });
      if (connection.oauthScopes.length > 0) form.set('scope', connection.oauthScopes.join(' '));
      const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
      this.applyClientAuthentication(headers, form, connection);
      const token = await this.tokenRequest(endpoint, headers, form);
      const accessToken = this.required(token.access_token, 'BITO_OAUTH_TOKEN_MISSING');
      const saved = await this.prisma.bitoConnection.updateMany({
        where: { id: connection.id, encryptedRefreshToken: connection.encryptedRefreshToken, encryptedServerUrl: connection.encryptedServerUrl, status: { in: [BitoConnectionStatus.CONNECTED, BitoConnectionStatus.ERROR] } },
        data: {
          encryptedAccessToken: this.crypto.encrypt(accessToken),
          encryptedRefreshToken: token.refresh_token ? this.crypto.encrypt(token.refresh_token) : connection.encryptedRefreshToken,
          accessTokenExpiresAt: this.tokenExpiry(token.expires_in),
          oauthScopes: this.normalizeScopes(token.scope, connection.oauthScopes),
          status: BitoConnectionStatus.CONNECTED,
          lastErrorAt: null,
          lastErrorCode: null,
        },
      });
      if (saved.count !== 1) throw new ServiceUnavailableException('BITO_AUTH_FAILED');
      return accessToken;
    } catch (error) {
      await this.prisma.bitoConnection.updateMany({
        where: { id: connection.id, encryptedRefreshToken: connection.encryptedRefreshToken, encryptedServerUrl: connection.encryptedServerUrl },
        data: { status: BitoConnectionStatus.ERROR, lastErrorAt: new Date(), lastErrorCode: 'BITO_TOKEN_REFRESH_FAILED' },
      });
      throw new ServiceUnavailableException('BITO_TOKEN_REFRESH_FAILED');
    }
  }

  private async tokenRequest(endpoint: string, headers: Record<string, string>, form: URLSearchParams): Promise<TokenResponse> {
    const response = await this.fetchWithTimeout(endpoint, { method: 'POST', headers, body: form.toString(), redirect: 'error' });
    const text = await response.text();
    let payload: TokenResponse = {};
    try { payload = text ? JSON.parse(text) as TokenResponse : {}; } catch { throw new BadGatewayException('BITO_OAUTH_TOKEN_INVALID_JSON'); }
    if (!response.ok) {
      if (payload.error === 'invalid_grant' || response.status === 401 || response.status === 403) throw new ServiceUnavailableException('BITO_AUTH_FAILED');
      throw new BadGatewayException(`BITO_OAUTH_TOKEN_HTTP_${response.status}`);
    }
    return payload;
  }

  private applyClientAuthentication(headers: Record<string, string>, form: URLSearchParams, connection: Pick<BitoConnection, 'tokenEndpointAuthMethod' | 'encryptedOauthClientSecret'>): void {
    const method = connection.tokenEndpointAuthMethod ?? 'none';
    const secret = connection.encryptedOauthClientSecret ? this.crypto.decrypt(connection.encryptedOauthClientSecret) : undefined;
    if (!secret || method === 'none') return;
    if (method === 'client_secret_basic') {
      const clientId = form.get('client_id') ?? '';
      headers.authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
      return;
    }
    if (method === 'client_secret_post') {
      form.set('client_secret', secret);
      return;
    }
    throw new BadGatewayException('BITO_OAUTH_TOKEN_AUTH_METHOD_UNSUPPORTED');
  }

  private preferredTokenAuthMethod(metadata: AuthorizationServerMetadata, hasSecret: boolean): string {
    if (!hasSecret) return 'none';
    const supported = metadata.token_endpoint_auth_methods_supported ?? [];
    if (supported.length === 0 || supported.includes('client_secret_basic')) return 'client_secret_basic';
    if (supported.includes('client_secret_post')) return 'client_secret_post';
    return 'none';
  }

  private minimumScope(resourceScopes?: string[], serverScopes?: string[]): string | null {
    const resource = Array.isArray(resourceScopes) ? resourceScopes.filter((value) => typeof value === 'string' && value.trim()) : [];
    if (resource.length === 0) return null;
    const server = new Set(Array.isArray(serverScopes) ? serverScopes : []);
    const compatible = server.size > 0 ? resource.filter((scope) => server.has(scope)) : resource;
    // Never request every advertised permission by default. A 401 scope challenge wins;
    // otherwise only auto-request when the protected resource advertises one unambiguous scope.
    return compatible.length === 1 ? compatible[0] : null;
  }

  private async fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchWithTimeout(url, { ...init, redirect: 'error', headers: { accept: 'application/json', ...(init.headers as Record<string, string> | undefined) } });
    const text = await response.text();
    if (!response.ok) throw new BadGatewayException(`BITO_OAUTH_HTTP_${response.status}`);
    if (text.length > 512 * 1024) throw new BadGatewayException('BITO_OAUTH_RESPONSE_TOO_LARGE');
    try { return JSON.parse(text) as T; } catch { throw new BadGatewayException('BITO_OAUTH_INVALID_JSON'); }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new ServiceUnavailableException('BITO_OAUTH_TIMEOUT');
      throw new ServiceUnavailableException('BITO_OAUTH_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }

  private challengeParameter(header: string, name: string): string | undefined {
    const quoted = header.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i'));
    if (quoted?.[1]) return quoted[1];
    const plain = header.match(new RegExp(`${name}\\s*=\\s*([^,\\s]+)`, 'i'));
    return plain?.[1];
  }

  private canonicalResource(serverUrl: string): string {
    const url = new URL(serverUrl);
    url.hash = '';
    url.search = '';
    const text = url.toString();
    return url.pathname === '/' ? text.replace(/\/$/, '') : text;
  }

  private redirectUriOrUndefined(): string | undefined {
    return this.config.get<string>('bito.oauthRedirectUri');
  }

  private redirectUri(): string {
    const value = this.redirectUriOrUndefined();
    if (!value) throw new ServiceUnavailableException('BITO_OAUTH_REDIRECT_URI_NOT_CONFIGURED');
    let url: URL;
    try { url = new URL(value); } catch { throw new ServiceUnavailableException('BITO_OAUTH_REDIRECT_URI_INVALID'); }
    if (url.hash) throw new ServiceUnavailableException('BITO_OAUTH_REDIRECT_URI_INVALID');
    if (this.config.get<string>('nodeEnv', 'development') === 'production' && url.protocol !== 'https:') {
      throw new ServiceUnavailableException('BITO_OAUTH_REDIRECT_URI_HTTPS_REQUIRED');
    }
    return url.toString();
  }

  private clientMetadataUrl(): string {
    const redirect = new URL(this.redirectUri());
    redirect.pathname = redirect.pathname.replace(/\/callback\/?$/, '/client-metadata');
    redirect.search = '';
    redirect.hash = '';
    return redirect.toString();
  }

  private stateHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private tokenExpiry(expiresIn?: number): Date | null {
    return typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + Math.max(1, Math.floor(expiresIn)) * 1000)
      : null;
  }

  private normalizeScopes(scope: string | undefined, fallback: string[]): string[] {
    if (!scope) return fallback;
    return [...new Set(scope.split(/\s+/).map((value) => value.trim()).filter(Boolean))];
  }

  private sameIssuer(a: string, b: string): boolean {
    try { return new URL(a).toString().replace(/\/$/, '') === new URL(b).toString().replace(/\/$/, ''); } catch { return false; }
  }

  private clearPendingOAuth() {
    return {
      oauthStateHash: null,
      encryptedPkceVerifier: null,
      oauthExpiresAt: null,
    } as const;
  }

  private async markError(userId: string, code: string, clearPending: boolean): Promise<void> {
    await this.prisma.bitoConnection.updateMany({
      where: { userId },
      data: {
        status: BitoConnectionStatus.ERROR,
        lastErrorAt: new Date(),
        lastErrorCode: code,
        ...(clearPending ? this.clearPendingOAuth() : {}),
      },
    }).catch(() => undefined);
  }

  private async recordConnected(userId: string, serverName: string, toolCount: number, mode: string): Promise<void> {
    void this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.BITO_CONNECTED,
      entityType: 'BITO_CONNECTION',
      metadata: { serverName, toolCount, mode },
    }).catch(() => undefined);
  }

  private isAuthFailure(error: unknown): boolean {
    return error instanceof Error && error.message.includes('BITO_AUTH_FAILED');
  }

  private oauthErrorCode(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error ?? '');
    if (text.includes('BITO_AUTH_FAILED')) return 'BITO_AUTH_FAILED';
    if (text.includes('TOKEN')) return 'BITO_OAUTH_TOKEN_FAILED';
    if (text.includes('MCP')) return 'BITO_MCP_UNAVAILABLE';
    return 'BITO_OAUTH_FAILED';
  }

  private required<T>(value: T | null | undefined, code: string): T {
    if (value === null || value === undefined || value === '') throw new BadGatewayException(code);
    return value;
  }

  private fingerprint(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 12);
  }
}
