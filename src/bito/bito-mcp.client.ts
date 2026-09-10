import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitoAuthMode } from '@prisma/client';
import { bitoResponseShape, bitoSchemaShape, bitoSafeToolName, bitoInventorySchemaCandidate, bitoSchemaDescription } from './bito-shape-debug';

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
  outputSchema?: Record<string, unknown>;
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
  era: 'legacy' | 'modern';
  sessionId?: string;
  protocolVersion?: string;
  serverName?: string;
  instructions?: string;
};

const MODERN_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-06-18';

@Injectable()
export class BitoMcpClient {
  private readonly timeoutMs: number;
  private readonly debugShapes: boolean;
  private readonly logger = new Logger(BitoMcpClient.name);

  constructor(config: ConfigService) {
    this.timeoutMs = config.get<number>('bito.timeoutMs', 15_000);
    this.debugShapes = config.get<boolean>('bito.debugShapes', false);
  }

  async probe(credentials: BitoMcpCredentials): Promise<BitoMcpProbeResult> {
    const session = await this.initialize(credentials);
    try {
      const tools = await this.listAllTools(credentials, session);
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
      const tools = await this.listAllTools(credentials, session);
      return { tools, protocolVersion: session.protocolVersion ?? null, serverName: session.serverName ?? null };
    } finally {
      void this.terminate(credentials, session).catch(() => undefined);
    }
  }

  async callTool(credentials: BitoMcpCredentials, name: string, args: Record<string, unknown>): Promise<unknown> {
    const session = await this.initialize(credentials);
    try {
      const result = await this.rpc(credentials, session, 'tools/call', { name, arguments: args });
      if (this.debugShapes) this.logger.log(JSON.stringify({ event: 'BITO_RESPONSE_SHAPE', tool: bitoSafeToolName(name), requestShape: bitoResponseShape(args), shape: bitoResponseShape(result) }));
      if (objectOf(result).isError === true) throw new BadGatewayException('BITO_TOOL_FAILED');
      return result;
    } finally {
      void this.terminate(credentials, session).catch(() => undefined);
    }
  }

  private async listAllTools(credentials: BitoMcpCredentials, session: Session): Promise<BitoMcpTool[]> {
    const tools = new Map<string, BitoMcpTool>();
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await this.rpc(credentials, session, 'tools/list', cursor ? { cursor } : {});
      for (const tool of this.extractTools(result)) tools.set(tool.name, tool);
      const next = objectOf(result).nextCursor;
      if (next === undefined || next === null || next === '') {
        if (this.debugShapes) for (const tool of tools.values()) this.logger.log(JSON.stringify({
          event: 'BITO_TOOL_SCHEMA', tool: bitoSafeToolName(tool.name),
          inventoryCandidate: bitoInventorySchemaCandidate(tool.name),
          ...(bitoInventorySchemaCandidate(tool.name) ? { description: bitoSchemaDescription(tool.description), title: bitoSchemaDescription(tool.title) } : {}),
          input: bitoSchemaShape(tool.inputSchema), output: bitoSchemaShape(tool.outputSchema),
          readOnlyHint: tool.annotations?.readOnlyHint, destructiveHint: tool.annotations?.destructiveHint,
        }));
        return [...tools.values()];
      }
      if (typeof next !== 'string' || seen.has(next)) throw new BadGatewayException('BITO_PAGINATION_FAILED');
      seen.add(next);
      cursor = next;
    }
    throw new BadGatewayException('BITO_PAGINATION_FAILED');
  }

  private async initialize(credentials: BitoMcpCredentials): Promise<Session> {
    // MCP 2026-07-28 removed initialize/sessions. Probe the modern era first, then
    // fall back to the 2025 initialize handshake for existing Bito deployments.
    const modern = await this.tryModernDiscover(credentials);
    if (modern) return modern;

    const id = 1;
    const response = await this.post(credentials, { era: 'legacy' }, {
      jsonrpc: '2.0', id, method: 'initialize', params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'qulay-ai', version: '1.0.0' },
      },
    });
    const envelope = this.parseEnvelope(response.body, id);
    if (envelope.error) throw this.rpcError(envelope.error, response.status);
    const result = objectOf(envelope.result);
    const protocolVersion = typeof result.protocolVersion === 'string' ? result.protocolVersion : LEGACY_PROTOCOL_VERSION;
    const serverInfo = objectOf(result.serverInfo);
    const serverName = typeof serverInfo.name === 'string' ? serverInfo.name : undefined;
    const instructions = typeof result.instructions === 'string' ? result.instructions : undefined;
    const session: Session = {
      era: 'legacy',
      sessionId: response.sessionId,
      protocolVersion,
      ...(serverName ? { serverName } : {}),
      ...(instructions ? { instructions } : {}),
    };
    await this.post(credentials, session, { jsonrpc: '2.0', method: 'notifications/initialized' }, true);
    return session;
  }

  private async tryModernDiscover(credentials: BitoMcpCredentials): Promise<Session | null> {
    const id = 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const params = { _meta: this.modernMeta() };
    try {
      const headers: Record<string, string> = {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': MODERN_PROTOCOL_VERSION,
        'mcp-method': 'server/discover',
      };
      this.applyAuth(headers, credentials);
      const response = await fetch(credentials.serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'server/discover', params }),
        signal: controller.signal,
        redirect: 'error',
      });
      const body = await this.readRpcBody(response, id);
      if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException('BITO_AUTH_FAILED');
      // Legacy MCP servers commonly reject server/discover with 400/404/405 or -32601.
      if (!response.ok) return null;
      const envelope = this.parseEnvelope(body, id);
      if (envelope.error) {
        if (envelope.error.code === -32601) return null;
        return null;
      }
      const result = objectOf(envelope.result);
      const supported = Array.isArray(result.supportedVersions)
        ? result.supportedVersions.filter((value): value is string => typeof value === 'string')
        : [];
      if (!supported.includes(MODERN_PROTOCOL_VERSION)) return null;
      const meta = objectOf(result._meta);
      const serverInfo = objectOf(meta['io.modelcontextprotocol/serverInfo']);
      const serverName = typeof serverInfo.name === 'string' ? serverInfo.name : undefined;
      const instructions = typeof result.instructions === 'string' ? result.instructions : undefined;
      return {
        era: 'modern',
        protocolVersion: MODERN_PROTOCOL_VERSION,
        ...(serverName ? { serverName } : {}),
        ...(instructions ? { instructions } : {}),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ServiceUnavailableException('BITO_MCP_TIMEOUT');
      // Network errors are real availability failures; protocol-shape errors fall back.
      if (error instanceof TypeError) throw new ServiceUnavailableException('BITO_MCP_UNAVAILABLE');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async rpc(credentials: BitoMcpCredentials, session: Session, method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = Math.floor(Math.random() * 2_000_000_000) + 2;
    const wireParams = session.era === 'modern' ? { ...params, _meta: this.modernMeta() } : params;
    const response = await this.post(credentials, session, { jsonrpc: '2.0', id, method, params: wireParams });
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
      if (session.era === 'legacy' && session.sessionId) headers['mcp-session-id'] = session.sessionId;
      if (session.era === 'modern') {
        const request = objectOf(payload);
        const method = typeof request.method === 'string' ? request.method : undefined;
        if (method) headers['mcp-method'] = method;
        const params = objectOf(request.params);
        if (method === 'tools/call' && typeof params.name === 'string') {
          headers['mcp-name'] = this.encodeModernHeaderValue(params.name);
        }
      }
      this.applyAuth(headers, credentials);

      const response = await fetch(credentials.serverUrl, {
        method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal, redirect: 'error',
      });
      const body = await this.readRpcBody(response, objectOf(payload).id);
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
    if (session.era !== 'legacy' || !session.sessionId) return;
    const headers: Record<string, string> = { 'mcp-session-id': session.sessionId };
    if (session.protocolVersion) headers['mcp-protocol-version'] = session.protocolVersion;
    this.applyAuth(headers, credentials);
    await fetch(credentials.serverUrl, { method: 'DELETE', headers, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) }).catch(() => undefined);
  }

  private async readRpcBody(response: Response, expectedId: unknown): Promise<string> {
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body || expectedId === undefined) return response.text();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        size += value?.length ?? 0;
        if (size > 4_000_000) throw new BadGatewayException('BITO_MCP_RESPONSE_TOO_LARGE');
        const events = pending.split(/\r?\n\r?\n/);
        pending = events.pop() ?? '';
        if (done && pending) events.push(pending);
        for (const event of events) {
          const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          try {
            const envelope = JSON.parse(data) as RpcEnvelope;
            if (String(envelope.id) === String(expectedId)) return JSON.stringify(envelope);
          } catch { /* Ignore SSE comments/notifications, never log their contents. */ }
        }
        if (done) throw new BadGatewayException('BITO_MCP_INVALID_RESPONSE');
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  private encodeModernHeaderValue(value: string): string {
    const plainAscii = /^[\x20-\x7e]+$/.test(value) && value.trim() === value;
    const sentinelLike = value.startsWith('=?base64?') && value.endsWith('?=');
    if (plainAscii && !sentinelLike) return value;
    return `=?base64?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }

  private modernMeta(): Record<string, unknown> {
    return {
      'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION,
      'io.modelcontextprotocol/clientInfo': { name: 'qulay-ai', version: '1.0.0' },
      'io.modelcontextprotocol/clientCapabilities': {},
    };
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
    const envelope = matched;
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
        ...(item.outputSchema && typeof item.outputSchema === 'object' && !Array.isArray(item.outputSchema) ? { outputSchema: item.outputSchema as Record<string, unknown> } : {}),
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
