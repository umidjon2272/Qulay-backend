import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitoAuthMode } from '@prisma/client';

export type BitoMcpCredentials = {
  serverUrl: string;
  authMode: BitoAuthMode;
  accessToken?: string;
};

export type BitoMcpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    [key: string]: unknown;
  };
};

export type BitoMcpProbeResult = {
  serverName: string | null;
  protocolVersion: string | null;
  instructions: string | null;
  tools: BitoMcpTool[];
};

type RpcEnvelope = { jsonrpc?: string; id?: string | number | null; result?: unknown; error?: { code?: number; message?: string; data?: unknown } };
type Session = {
  sessionId?: string;
  protocolVersion?: string;
  serverName?: string;
  instructions?: string;
};

@Injectable()
export class BitoMcpClient {
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.timeoutMs = config.get<number>('bito.timeoutMs', 15_000);
  }

  async probe(credentials: BitoMcpCredentials): Promise<BitoMcpProbeResult> {
    const session = await this.initialize(credentials);
    try {
      const result = await this.rpc(credentials, session, 'tools/list', {});
      const tools = this.extractTools(result);
      return {
        serverName: session.serverName ?? null,
        protocolVersion: session.protocolVersion ?? null,
        instructions: session.instructions ?? null,
        tools,
      };
    } finally {
      void this.terminate(credentials, session).catch(() => undefined);
    }
  }

  async listTools(credentials: BitoMcpCredentials): Promise<{ tools: BitoMcpTool[]; protocolVersion: string | null; serverName: string | null }> {
    const session = await this.initialize(credentials);
    try {
      const result = await this.rpc(credentials, session, 'tools/list', {});
      return { tools: this.extractTools(result), protocolVersion: session.protocolVersion ?? null, serverName: session.serverName ?? null };
    } finally {
      void this.terminate(credentials, session).catch(() => undefined);
    }
  }

  async callTool(credentials: BitoMcpCredentials, name: string, args: Record<string, unknown>): Promise<unknown> {
    const session = await this.initialize(credentials);
    try {
      return await this.rpc(credentials, session, 'tools/call', { name, arguments: args });
    } finally {
      void this.terminate(credentials, session).catch(() => undefined);
    }
  }

  private async initialize(credentials: BitoMcpCredentials): Promise<Session> {
    const id = 1;
    const response = await this.post(credentials, {}, {
      jsonrpc: '2.0', id, method: 'initialize', params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'qulay-ai', version: '1.0.0' },
      },
    });
    const envelope = this.parseEnvelope(response.body, id);
    if (envelope.error) throw this.rpcError(envelope.error, response.status);
    const result = objectOf(envelope.result);
    const protocolVersion = typeof result.protocolVersion === 'string' ? result.protocolVersion : '2025-06-18';
    const serverInfo = objectOf(result.serverInfo);
    const serverName = typeof serverInfo.name === 'string' ? serverInfo.name : undefined;
    const instructions = typeof result.instructions === 'string' ? result.instructions : undefined;
    const session: Session = {
      sessionId: response.sessionId,
      protocolVersion,
      ...(serverName ? { serverName } : {}),
      ...(instructions ? { instructions } : {}),
    };
    await this.post(credentials, session, { jsonrpc: '2.0', method: 'notifications/initialized' }, true);
    return session;
  }

  private async rpc(credentials: BitoMcpCredentials, session: Session, method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = Math.floor(Math.random() * 2_000_000_000) + 2;
    const response = await this.post(credentials, session, { jsonrpc: '2.0', id, method, params });
    const envelope = this.parseEnvelope(response.body, id);
    if (envelope.error) throw this.rpcError(envelope.error, response.status);
    return envelope.result;
  }

  private async post(credentials: BitoMcpCredentials, session: Session, payload: unknown, allowEmpty = false): Promise<{ body: string; status: number; sessionId?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      };
      if (session.protocolVersion) headers['mcp-protocol-version'] = session.protocolVersion;
      if (session.sessionId) headers['mcp-session-id'] = session.sessionId;
      this.applyAuth(headers, credentials);

      const response = await fetch(credentials.serverUrl, {
        method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal, redirect: 'error',
      });
      const body = await response.text();
      if (!response.ok && !(allowEmpty && response.status === 202)) {
        if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException('BITO_AUTH_FAILED');
        throw new BadGatewayException(`BITO_MCP_HTTP_${response.status}`);
      }
      if (!body.trim() && !allowEmpty) throw new BadGatewayException('BITO_MCP_EMPTY_RESPONSE');
      return { body, status: response.status, sessionId: response.headers.get('mcp-session-id') ?? undefined };
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ServiceUnavailableException('BITO_MCP_TIMEOUT');
      throw new ServiceUnavailableException('BITO_MCP_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }

  private async terminate(credentials: BitoMcpCredentials, session: Session): Promise<void> {
    if (!session.sessionId) return;
    const headers: Record<string, string> = { 'mcp-session-id': session.sessionId };
    if (session.protocolVersion) headers['mcp-protocol-version'] = session.protocolVersion;
    this.applyAuth(headers, credentials);
    await fetch(credentials.serverUrl, { method: 'DELETE', headers, redirect: 'error' }).catch(() => undefined);
  }

  private applyAuth(headers: Record<string, string>, credentials: BitoMcpCredentials): void {
    if (!credentials.accessToken || credentials.authMode === BitoAuthMode.NONE) return;
    if (credentials.authMode === BitoAuthMode.BEARER) headers.authorization = `Bearer ${credentials.accessToken}`;
    if (credentials.authMode === BitoAuthMode.X_API_KEY) headers['x-api-key'] = credentials.accessToken;
  }

  private parseEnvelope(body: string, expectedId: string | number): RpcEnvelope {
    const trimmed = body.trim();
    const candidates: RpcEnvelope[] = [];
    if (trimmed.startsWith('{')) {
      try { candidates.push(JSON.parse(trimmed) as RpcEnvelope); } catch { throw new BadGatewayException('BITO_MCP_INVALID_JSON'); }
    } else {
      for (const line of trimmed.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try { candidates.push(JSON.parse(data) as RpcEnvelope); } catch { /* ignore non-JSON SSE messages */ }
      }
    }
    const matched = candidates.find((item) => String(item.id ?? '') === String(expectedId));
    const envelope = matched ?? candidates.find((item) => item.result !== undefined || item.error !== undefined);
    if (!envelope) throw new BadGatewayException('BITO_MCP_INVALID_RESPONSE');
    return envelope;
  }

  private extractTools(value: unknown): BitoMcpTool[] {
    const result = objectOf(value);
    if (!Array.isArray(result.tools)) throw new BadGatewayException('BITO_MCP_TOOLS_UNAVAILABLE');
    return result.tools.flatMap((tool) => {
      if (!tool || typeof tool !== 'object') return [];
      const item = tool as Record<string, unknown>;
      if (typeof item.name !== 'string' || !item.name.trim()) return [];
      return [{
        name: item.name,
        ...(typeof item.title === 'string' ? { title: item.title } : {}),
        ...(typeof item.description === 'string' ? { description: item.description } : {}),
        ...(item.inputSchema && typeof item.inputSchema === 'object' && !Array.isArray(item.inputSchema) ? { inputSchema: item.inputSchema as Record<string, unknown> } : {}),
        ...(item.annotations && typeof item.annotations === 'object' && !Array.isArray(item.annotations) ? { annotations: item.annotations as BitoMcpTool['annotations'] } : {}),
      }];
    });
  }

  private rpcError(error: { code?: number; message?: string }, status: number): Error {
    if (status === 401 || status === 403) return new ServiceUnavailableException('BITO_AUTH_FAILED');
    const code = typeof error.code === 'number' ? error.code : -32000;
    if (code === -32601) return new ServiceUnavailableException('BITO_MCP_METHOD_UNSUPPORTED');
    return new BadGatewayException(`BITO_MCP_RPC_${code}`);
  }
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

