import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BitoUrlPolicyService {
  private readonly allowedHosts: string[];
  private readonly nodeEnv: string;

  constructor(config: ConfigService) {
    this.allowedHosts = config.get<string[]>('bito.allowedHosts', ['mcp.bito.online', '.bito.online']);
    this.nodeEnv = config.get<string>('nodeEnv', 'development');
  }

  assertMcpServerUrl(raw: string): string {
    const url = this.parse(raw, 'Bito MCP URL noto‘g‘ri');
    this.assertHttp(url, 'Bito MCP');
    const host = url.hostname.toLowerCase();
    const allowed = this.allowedHosts.some((entry) => {
      const normalized = entry.trim().toLowerCase();
      if (!normalized) return false;
      return normalized.startsWith('.')
        ? host === normalized.slice(1) || host.endsWith(normalized)
        : host === normalized;
    });
    if (!allowed) throw new BadRequestException('BITO_MCP_HOST_NOT_ALLOWED');
    url.hash = '';
    return this.canonical(url);
  }

  assertProtectedResourceMetadataUrl(raw: string, mcpServerUrl: string): string {
    const mcp = this.parse(mcpServerUrl, 'BITO_MCP_URL_INVALID');
    let url: URL;
    try { url = new URL(raw, mcp); } catch { throw new BadRequestException('BITO_OAUTH_METADATA_URL_INVALID'); }
    if (url.username || url.password) throw new BadRequestException('Bito URL ichida username/password bo‘lmasin');
    this.assertHttpsPublic(url, 'Bito OAuth metadata');
    if (url.origin !== mcp.origin) throw new BadRequestException('BITO_OAUTH_METADATA_ORIGIN_MISMATCH');
    url.hash = '';
    return url.toString();
  }

  assertProtectedResourceIdentifier(raw: string, mcpServerUrl: string): string {
    const mcp = this.parse(mcpServerUrl, 'BITO_MCP_URL_INVALID');
    const url = this.parse(raw, 'BITO_OAUTH_RESOURCE_INVALID');
    this.assertHttpsPublic(url, 'Bito OAuth resource');
    if (url.origin !== mcp.origin) throw new BadRequestException('BITO_OAUTH_RESOURCE_ORIGIN_MISMATCH');
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  assertDiscoveredOAuthUrl(raw: string): string {
    const url = this.parse(raw, 'BITO_OAUTH_URL_INVALID');
    this.assertHttpsPublic(url, 'Bito OAuth');
    url.hash = '';
    return url.toString();
  }

  safeHost(raw: string): string | null {
    try { return new URL(raw).hostname; } catch { return null; }
  }

  private parse(raw: string, message: string): URL {
    let url: URL;
    try { url = new URL(raw); } catch { throw new BadRequestException(message); }
    if (url.username || url.password) throw new BadRequestException('Bito URL ichida username/password bo‘lmasin');
    return url;
  }

  private assertHttp(url: URL, label: string): void {
    if (!['https:', 'http:'].includes(url.protocol)) throw new BadRequestException(`${label} faqat HTTP/HTTPS orqali ulanadi`);
    if (this.nodeEnv === 'production' && url.protocol !== 'https:') throw new BadRequestException(`${label} production ulanishi HTTPS bo‘lishi kerak`);
    this.assertNoLocalTarget(url.hostname);
  }

  private assertHttpsPublic(url: URL, label: string): void {
    this.assertHttp(url, label);
    if (this.nodeEnv === 'production' && url.protocol !== 'https:') throw new BadRequestException(`${label} HTTPS bo‘lishi kerak`);
  }

  private assertNoLocalTarget(hostname: string): void {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') {
      throw new BadRequestException('BITO_URL_LOCAL_TARGET_BLOCKED');
    }
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
      throw new BadRequestException('BITO_URL_PRIVATE_TARGET_BLOCKED');
    }
    const match = host.match(/^172\.(\d{1,3})\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) {
      throw new BadRequestException('BITO_URL_PRIVATE_TARGET_BLOCKED');
    }
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
      throw new BadRequestException('BITO_URL_PRIVATE_TARGET_BLOCKED');
    }
  }

  private canonical(url: URL): string {
    url.search = '';
    url.hash = '';
    const text = url.toString();
    if (url.pathname === '/' && !url.search && !url.hash) return text.replace(/\/$/, '');
    return text;
  }
}
