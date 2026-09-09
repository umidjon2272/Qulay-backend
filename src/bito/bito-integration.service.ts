import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BitoAuthMode, BitoConnectionStatus } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectBitoDto } from './dto/bito.dto';
import { BitoCryptoService } from './bito-crypto.service';
import { BitoMcpClient, BitoMcpCredentials, BitoMcpTool } from './bito-mcp.client';
import { BitoOAuthService, BitoAuthorizationStart } from './bito-oauth.service';
import { BitoUrlPolicyService } from './bito-url-policy.service';
import { bitoToolSideEffect } from './bito-tool-policy';

@Injectable()
export class BitoIntegrationService {
  private readonly logger = new Logger(BitoIntegrationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BitoCryptoService,
    private readonly mcp: BitoMcpClient,
    private readonly oauth: BitoOAuthService,
    private readonly urls: BitoUrlPolicyService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async status(userId: string) {
    let connection = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    const configured = this.crypto.configured();
    if (!connection) {
      return {
        configured,
        oauthReady: this.oauth.oauthReady(),
        connected: false,
        authorizing: false,
        status: configured ? 'DISCONNECTED' : 'not_configured',
        serverName: null,
        serverHost: null,
        protocolVersion: null,
        toolCount: 0,
        connectedAt: null,
        lastUsedAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        authMode: BitoAuthMode.NONE,
      };
    }
    let connected = false;
    let usableStatus: string = connection.status;
    if (configured && (connection.status === BitoConnectionStatus.CONNECTED || connection.status === BitoConnectionStatus.ERROR)) {
      try {
        const tools = await this.listToolsForUser(userId);
        connected = tools.length > 0;
        usableStatus = connected ? 'CONNECTED' : 'DEGRADED';
      } catch (error) {
        usableStatus = /BITO_(?:AUTH|TOKEN_REFRESH)_FAILED/.test(this.errorCode(error)) ? 'EXPIRED' : 'DEGRADED';
      }
      const fresh = await this.prisma.bitoConnection.findUnique({ where: { userId } });
      if (!fresh || fresh.status === BitoConnectionStatus.DISCONNECTED || fresh.status === BitoConnectionStatus.AUTHORIZING) {
        connected = false;
        usableStatus = fresh?.status ?? 'DISCONNECTED';
      }
      connection = fresh ?? connection;
    }
    return {
      configured,
      oauthReady: this.oauth.oauthReady(),
      connected,
      authorizing: configured && connection.status === BitoConnectionStatus.AUTHORIZING,
      status: configured ? usableStatus : 'not_configured',
      serverName: connection.serverName,
      serverHost: this.safeHost(connection.encryptedServerUrl),
      protocolVersion: connection.protocolVersion,
      toolCount: connected ? connection.toolCount : 0,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
      lastErrorAt: connection.lastErrorAt?.toISOString() ?? null,
      lastErrorCode: connection.lastErrorCode,
      authMode: connection.authMode,
    };
  }

  startOAuth(userId: string): Promise<BitoAuthorizationStart> {
    return this.oauth.begin(userId);
  }

  /**
   * Backwards-compatible manual MCP connection. OAuth-capable Bito should use startOAuth().
   * Kept for deployments that already use a static Bearer token or X-API-Key.
   */
  async connect(userId: string, dto: ConnectBitoDto) {
    if (!this.crypto.configured()) throw new ServiceUnavailableException('Bito integratsiyasi uchun BITO_CREDENTIAL_ENCRYPTION_KEY sozlanmagan');
    const credentials = this.credentialsFromDto(dto);
    const probe = await this.mcp.probe(credentials);
    const now = new Date();
    const serverName = probe.serverName ?? new URL(credentials.serverUrl).hostname;
    await this.prisma.bitoConnection.upsert({
      where: { userId },
      create: {
        userId,
        encryptedServerUrl: this.crypto.encrypt(credentials.serverUrl),
        encryptedAccessToken: credentials.accessToken ? this.crypto.encrypt(credentials.accessToken) : null,
        authMode: credentials.authMode,
        status: BitoConnectionStatus.CONNECTED,
        serverName,
        protocolVersion: probe.protocolVersion,
        toolCount: probe.tools.length,
        connectedAt: now,
        lastUsedAt: now,
      },
      update: {
        encryptedServerUrl: this.crypto.encrypt(credentials.serverUrl),
        encryptedAccessToken: credentials.accessToken ? this.crypto.encrypt(credentials.accessToken) : null,
        encryptedRefreshToken: null,
        accessTokenExpiresAt: null,
        authMode: credentials.authMode,
        status: BitoConnectionStatus.CONNECTED,
        serverName,
        protocolVersion: probe.protocolVersion,
        toolCount: probe.tools.length,
        oauthScopes: [],
        oauthStateHash: null,
        encryptedPkceVerifier: null,
        oauthExpiresAt: null,
        oauthIssuer: null,
        oauthResource: null,
        authorizationEndpoint: null,
        tokenEndpoint: null,
        registrationEndpoint: null,
        revocationEndpoint: null,
        oauthClientId: null,
        encryptedOauthClientSecret: null,
        tokenEndpointAuthMethod: null,
        connectedAt: now,
        lastUsedAt: now,
        lastErrorAt: null,
        lastErrorCode: null,
      },
    });
    void this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.BITO_CONNECTED,
      entityType: 'BITO_CONNECTION',
      metadata: { serverName, toolCount: probe.tools.length, authMode: credentials.authMode },
    }).catch(() => undefined);
    return {
      status: 'connected' as const,
      serverName,
      protocolVersion: probe.protocolVersion,
      toolCount: probe.tools.length,
      tools: this.publicTools(probe.tools),
    };
  }

  async disconnect(userId: string) {
    const existing = await this.prisma.bitoConnection.findUnique({ where: { userId }, select: { id: true } });
    if (existing) {
      await this.oauth.revoke(userId);
      await this.prisma.bitoConnection.delete({ where: { userId } });
    }
    void this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.BITO_DISCONNECTED,
      entityType: 'BITO_CONNECTION',
      entityId: existing?.id,
    }).catch(() => undefined);
    return { status: 'disconnected' as const };
  }

  async test(userId: string) {
    try {
      const probe = await this.withFreshCredentials(userId, (credentials) => this.mcp.probe(credentials), true);
      const now = new Date();
      await this.prisma.bitoConnection.update({
        where: { userId },
        data: {
          status: BitoConnectionStatus.CONNECTED,
          serverName: probe.serverName ?? undefined,
          protocolVersion: probe.protocolVersion,
          toolCount: probe.tools.length,
          lastUsedAt: now,
          lastErrorAt: null,
          lastErrorCode: null,
        },
      });
      return { ok: true, protocolVersion: probe.protocolVersion, toolCount: probe.tools.length, tools: this.publicTools(probe.tools) };
    } catch (error) {
      await this.recordRuntimeError(userId, error);
      throw error;
    }
  }

  async listToolsForUser(userId: string): Promise<BitoMcpTool[]> {
    try {
      const result = await this.withFreshCredentials(userId, (credentials) => this.mcp.listTools(credentials), true);
      if (!result.tools.length) throw new ServiceUnavailableException('BITO_MCP_TOOLS_UNAVAILABLE');
      await this.prisma.bitoConnection.update({
        where: { userId },
        data: {
          status: BitoConnectionStatus.CONNECTED,
          protocolVersion: result.protocolVersion,
          toolCount: result.tools.length,
          lastUsedAt: new Date(),
          lastErrorAt: null,
          lastErrorCode: null,
        },
      }).catch(() => undefined);
      return result.tools;
    } catch (error) {
      await this.recordRuntimeError(userId, error);
      throw error;
    }
  }

  async callToolForUser(userId: string, name: string, input: Record<string, unknown>, retryRead = false): Promise<unknown> {
    try {
      // Only the server-side bridge supplies retryRead after resolving the
      // account's current tool schema and applying the shared safety policy.
      const result = await this.withFreshCredentials(userId, (credentials) => this.mcp.callTool(credentials, name, input), retryRead);
      await this.prisma.bitoConnection.update({
        where: { userId },
        data: { lastUsedAt: new Date(), lastErrorAt: null, lastErrorCode: null },
      }).catch(() => undefined);
      return result;
    } catch (error) {
      await this.recordRuntimeError(userId, error);
      throw error;
    }
  }

  private async withFreshCredentials<T>(userId: string, operation: (credentials: BitoMcpCredentials) => Promise<T>, retryRead = false): Promise<T> {
    const credentials = await this.credentialsForUser(userId, false);
    try {
      return await operation(credentials);
    } catch (error) {
      if (this.isAuthFailure(error) && credentials.authMode === BitoAuthMode.BEARER) {
        const refreshed = await this.credentialsForUser(userId, true);
        return operation(refreshed);
      }
      if (retryRead && /BITO_MCP_(?:TIMEOUT|UNAVAILABLE|HTTP_(?:404|408|429|502|503|504))/.test(error instanceof Error ? error.message : '')) {
        return operation(await this.credentialsForUser(userId, false));
      }
      throw error;
    }
  }

  private async credentialsForUser(userId: string, forceRefresh: boolean): Promise<BitoMcpCredentials> {
    if (!this.crypto.configured()) throw new ServiceUnavailableException('Bito integratsiyasi hozir sozlanmagan');
    const connection = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    if (!connection || ![BitoConnectionStatus.CONNECTED, BitoConnectionStatus.ERROR].includes(connection.status as 'CONNECTED' | 'ERROR')) throw new BadRequestException('BITO_NOT_CONNECTED');
    const serverUrl = this.urls.assertMcpServerUrl(this.crypto.decrypt(connection.encryptedServerUrl));

    if (connection.authMode === BitoAuthMode.NONE) return { serverUrl, authMode: BitoAuthMode.NONE };
    if (connection.authMode === BitoAuthMode.X_API_KEY) {
      if (!connection.encryptedAccessToken) throw new ServiceUnavailableException('BITO_AUTH_FAILED');
      return { serverUrl, authMode: BitoAuthMode.X_API_KEY, accessToken: this.crypto.decrypt(connection.encryptedAccessToken) };
    }

    const accessToken = await this.oauth.accessToken(userId, forceRefresh);
    const current = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    if (!current || current.id !== connection.id || current.encryptedServerUrl !== connection.encryptedServerUrl || current.oauthClientId !== connection.oauthClientId) throw new ServiceUnavailableException('BITO_AUTH_FAILED');
    return { serverUrl, authMode: BitoAuthMode.BEARER, accessToken };
  }

  private credentialsFromDto(dto: ConnectBitoDto): BitoMcpCredentials {
    const authMode = dto.authMode ?? BitoAuthMode.NONE;
    const accessToken = dto.accessToken?.trim();
    if (authMode !== BitoAuthMode.NONE && !accessToken) throw new BadRequestException('Bito access token is required for the selected auth mode');
    const serverUrl = this.urls.assertMcpServerUrl(dto.serverUrl.trim());
    return { serverUrl, authMode, ...(accessToken ? { accessToken } : {}) };
  }

  private safeHost(encryptedUrl: string): string | null {
    try { return this.urls.safeHost(this.crypto.decrypt(encryptedUrl)); } catch { return null; }
  }

  private publicTools(tools: BitoMcpTool[]) {
    return tools.slice(0, 100).map((tool) => ({
      name: tool.name,
      title: tool.title ?? null,
      description: tool.description ?? null,
      readOnly: bitoToolSideEffect(tool) === 'READ',
    }));
  }

  private errorCode(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error ?? '');
    if (/BITO_(?:TOKEN_REFRESH|TOOL|MAPPING|PAGINATION)_FAILED/.test(text)) return text.match(/BITO_[A-Z0-9_]+/)![0];
    if (text.includes('BITO_NOT_CONNECTED')) return 'BITO_NOT_CONNECTED';
    if (text.includes('BITO_AUTH_FAILED')) return 'BITO_AUTH_FAILED';
    if (text.includes('OAUTH')) return text.match(/BITO_[A-Z0-9_]+/)?.[0] ?? 'BITO_OAUTH_FAILED';
    if (text.includes('TIMEOUT')) return 'BITO_MCP_TIMEOUT';
    if (text.includes('METHOD_UNSUPPORTED')) return 'BITO_MCP_PROTOCOL_UNSUPPORTED';
    if (text.includes('HOST_NOT_ALLOWED')) return 'BITO_MCP_HOST_NOT_ALLOWED';
    return 'BITO_MCP_UNAVAILABLE';
  }

  private isAuthFailure(error: unknown): boolean {
    return error instanceof Error && error.message.includes('BITO_AUTH_FAILED');
  }

  private async recordRuntimeError(userId: string, error: unknown): Promise<void> {
    const code = this.errorCode(error);
    if (code === 'BITO_NOT_CONNECTED') return;
    this.logger.warn({ code });
    await this.prisma.bitoConnection.updateMany({
      where: { userId },
      data: {
        ...(code === 'BITO_AUTH_FAILED' ? { status: BitoConnectionStatus.ERROR } : {}),
        lastErrorAt: new Date(),
        lastErrorCode: code,
      },
    }).catch(() => undefined);
  }
}
