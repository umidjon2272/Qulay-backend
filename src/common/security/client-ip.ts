import { isIP } from 'node:net';

type ClientRequest = {
  headers?: { [name: string]: string | string[] | undefined };
  ip?: string;
  socket?: { remoteAddress?: string };
};

const normalizedIp = (value: string | undefined): string | null => {
  const candidate = value?.trim().replace(/^::ffff:/u, '');
  return candidate && isIP(candidate) ? candidate : null;
};

export function resolveClientIp(request: ClientRequest, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers?.['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = normalizedIp(value?.split(',')[0]);
    if (first) return first;
  }
  return normalizedIp(request.ip) ?? normalizedIp(request.socket?.remoteAddress) ?? 'unknown';
}

export function createGlobalRateLimitKey(clientIp: string, userId?: string): string {
  return userId ? `user:${userId}:ip:${clientIp}` : `ip:${clientIp}`;
}
