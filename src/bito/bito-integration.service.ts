import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitoAuthMode, BitoConnectionStatus } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectBitoDto } from './dto/bito.dto';
import { BitoCryptoService } from './bito-crypto.service';
import { BitoMcpClient, BitoMcpCredentials, BitoMcpTool } from './bito-mcp.client';

@Injectable()
export class BitoIntegrationService {
  private readonly allowedHosts: string[];
  private readonly nodeEnv: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BitoCryptoService,
    private readonly mcp: BitoMcpClient,
    private readonly config: ConfigService,
    private readonly activityLog: ActivityLogService,
  ) {
    this.allowedHosts = config.get<string[]>('bito.allowedHosts', ['bito.uz', '.bito.uz']);
    this.nodeEnv = config.get<string>('nodeEnv', 'development');
  }

  async status(userId: string) {
    const connection = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    if (!connection) {
      return {
        configured: this.crypto.configured(), connected: false, status: this.crypto.configured() ? 'DISCONNECTED' : 'not_configured',
        serverName: null, serverHost: null, protocolVersion: null, toolCount: 0, connectedAt: null,
        lastUsedAt: null, lastErrorAt: null, lastErrorCode: null, authMode: BitoAuthMode.NONE,
      };
    }
    const configured = this.crypto.configured();
    return {
      configured,
      connected: configured && connection.status === BitoConnectionStatus.CONNECTED,
      status: configured ? connection.status : 'not_configured',
      serverName: connection.serverName,
      serverHost: this.safeHost(connection.encryptedServerUrl),
      protocolVersion: connection.protocolVersion,
      toolCount: connection.toolCount,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
      lastErrorAt: connection.lastErrorAt?.toISOString() ?? null,
      lastErrorCode: connection.lastErrorCode,
      authMode: connection.authMode,
    };
  }

  async connect(userId: string, dto: ConnectBitoDto) {
    if (!this.crypto.configured()) throw new ServiceUnavailableException('Bito integratsiyasi uchun BITO_CREDENTIAL_ENCRYPTION_KEY sozlanmagan');
    const credentials = this.credentialsFromDto(dto);
    this.assertSafeServerUrl(credentials.serverUrl);
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
        lastErrorAt: null,
        lastErrorCode: null,
      },
      update: {
        encryptedServerUrl: this.crypto.encrypt(credentials.serverUrl),
        encryptedAccessToken: credentials.accessToken ? this.crypto.encrypt(credentials.accessToken) : null,
        authMode: credentials.authMode,
        status: BitoConnectionStatus.CONNECTED,
        serverName,
        protocolVersion: probe.protocolVersion,
        toolCount: probe.tools.length,
        connectedAt: now,
        lastUsedAt: now,
        lastErrorAt: null,
        lastErrorCode: null,
      },
    });
    void this.activityLog.record({
      userId, action: ACTIVITY_ACTIONS.BITO_CONNECTED, entityType: 'BITO_CONNECTION',
      metadata: { serverName, toolCount: probe.tools.length, authMode: credentials.authMode },
    }).catch(() => undefined);
    return { status: 'connected' as const, serverName, protocolVersion: probe.protocolVersion, toolCount: probe.tools.length, tools: this.publicTools(probe.tools) };
  }

  async disconnect(userId: string) {
    const existing = await this.prisma.bitoConnection.findUnique({ where: { userId }, select: { id: true } });
    if (existing) await this.prisma.bitoConnection.delete({ where: { userId } });
    void this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.BITO_DISCONNECTED, entityType: 'BITO_CONNECTION', entityId: existing?.id }).catch(() => undefined);
    return { status: 'disconnected' as const };
  }

  async test(userId: string) {
    const credentials = await this.credentialsForUser(userId);
    try {
      const probe = await this.mcp.probe(credentials);
      const now = new Date();
      await this.prisma.bitoConnection.update({ where: { userId }, data: {
        status: BitoConnectionStatus.CONNECTED,
        serverName: probe.serverName ?? new URL(credentials.serverUrl).hostname,
        protocolVersion: probe.protocolVersion,
        toolCount: probe.tools.length,
        lastUsedAt: now,
        lastErrorAt: null,
        lastErrorCode: null,
      } });
      return { ok: true, protocolVersion: probe.protocolVersion, toolCount: probe.tools.length, tools: this.publicTools(probe.tools) };
    } catch (error) {
      const code = this.errorCode(error);
      await this.prisma.bitoConnection.update({ where: { userId }, data: {
        ...(code === 'BITO_AUTH_FAILED' ? { status: BitoConnectionStatus.ERROR } : {}),
        lastErrorAt: new Date(), lastErrorCode: code,
      } }).catch(() => undefined);
      throw error;
    }
  }

  async listToolsForUser(userId: string): Promise<BitoMcpTool[]> {
    const credentials = await this.credentialsForUser(userId);
    try {
      const result = await this.mcp.listTools(credentials);
      await this.prisma.bitoConnection.update({ where: { userId }, data: {
        status: BitoConnectionStatus.CONNECTED,
        protocolVersion: result.protocolVersion,
        toolCount: result.tools.length,
        lastUsedAt: new Date(),
        lastErrorAt: null,
        lastErrorCode: null,
      } }).catch(() => undefined);
      return result.tools;
    } catch (error) {
      await this.recordRuntimeError(userId, error);
      throw error;
    }
  }

  async callToolForUser(userId: string, name: string, input: Record<string, unknown>): Promise<unknown> {
    const credentials = await this.credentialsForUser(userId);
    try {
      const result = await this.mcp.callTool(credentials, name, input);
      await this.prisma.bitoConnection.update({ where: { userId }, data: { lastUsedAt: new Date(), lastErrorAt: null, lastErrorCode: null } }).catch(() => undefined);
      return result;
    } catch (error) {
      await this.recordRuntimeError(userId, error);
      throw error;
    }
  }

  private async credentialsForUser(userId: string): Promise<BitoMcpCredentials> {
    if (!this.crypto.configured()) throw new ServiceUnavailableException('Bito integratsiyasi hozir sozlanmagan');
    const connection = await this.prisma.bitoConnection.findUnique({ where: { userId } });
    if (!connection || connection.status === BitoConnectionStatus.DISCONNECTED) throw new BadRequestException('BITO_NOT_CONNECTED');
    const credentials: BitoMcpCredentials = {
      serverUrl: this.crypto.decrypt(connection.encryptedServerUrl),
      authMode: connection.authMode,
      ...(connection.encryptedAccessToken ? { accessToken: this.crypto.decrypt(connection.encryptedAccessToken) } : {}),
    };
    this.assertSafeServerUrl(credentials.serverUrl);
    return credentials;
  }

  private credentialsFromDto(dto: ConnectBitoDto): BitoMcpCredentials {
    const authMode = dto.authMode ?? BitoAuthMode.NONE;
    const accessToken = dto.accessToken?.trim();
    if (authMode !== BitoAuthMode.NONE && !accessToken) throw new BadRequestException('Bito access token is required for the selected auth mode');
    return { serverUrl: dto.serverUrl.trim(), authMode, ...(accessToken ? { accessToken } : {}) };
  }

  private assertSafeServerUrl(raw: string): void {
    let url: URL;
    try { url = new URL(raw); } catch { throw new BadRequestException('Bito MCP URL noto‘g‘ri'); }
    if (url.username || url.password) throw new BadRequestException('Bito MCP URL ichida username/password bo‘lmasin');
    if (this.nodeEnv === 'production' && url.protocol !== 'https:') throw new BadRequestException('Bito MCP production ulanishi HTTPS bo‘lishi kerak');
    if (!['https:', 'http:'].includes(url.protocol)) throw new BadRequestException('Bito MCP faqat HTTP/HTTPS orqali ulanadi');
    const host = url.hostname.toLowerCase();
    const allowed = this.allowedHosts.some((entry) => {
      const normalized = entry.trim().toLowerCase();
      if (!normalized) return false;
      return normalized.startsWith('.') ? host.endsWith(normalized) || host === normalized.slice(1) : host === normalized;
    });
    if (!allowed) throw new BadRequestException('BITO_MCP_HOST_NOT_ALLOWED');
  }

  private safeHost(encryptedUrl: string): string | null {
    try { return new URL(this.crypto.decrypt(encryptedUrl)).hostname; } catch { return null; }
  }

  private publicTools(tools: BitoMcpTool[]) {
    return tools.slice(0, 100).map((tool) => ({ name: tool.name, title: tool.title ?? null, description: tool.description ?? null, readOnly: tool.annotations?.readOnlyHint === true }));
  }

  private errorCode(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error ?? '');
    if (text.includes('BITO_AUTH_FAILED')) return 'BITO_AUTH_FAILED';
    if (text.includes('TIMEOUT')) return 'BITO_MCP_TIMEOUT';
    if (text.includes('METHOD_UNSUPPORTED')) return 'BITO_MCP_PROTOCOL_UNSUPPORTED';
    if (text.includes('HOST_NOT_ALLOWED')) return 'BITO_MCP_HOST_NOT_ALLOWED';
    return 'BITO_MCP_UNAVAILABLE';
  }

  private async recordRuntimeError(userId: string, error: unknown): Promise<void> {
    const code = this.errorCode(error);
    await this.prisma.bitoConnection.updateMany({ where: { userId }, data: {
      ...(code === 'BITO_AUTH_FAILED' ? { status: BitoConnectionStatus.ERROR } : {}),
      lastErrorAt: new Date(), lastErrorCode: code,
    } }).catch(() => undefined);
  }
}
