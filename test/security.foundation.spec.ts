import { HttpStatus } from '@nestjs/common';
import { LoginBruteForceService } from '../src/auth/login-brute-force.service';
import { ProductionExceptionFilter } from '../src/common/security/production-exception.filter';
import { SecurityRateLimitService } from '../src/common/security/security-rate-limit.service';
import { createGlobalRateLimitKey, resolveClientIp } from '../src/common/security/client-ip';
import { RateLimitException } from '../src/common/security/rate-limit.exception';

describe('Production security foundation', () => {
  it('limits a scope/key within its configured window', () => {
    const limiter = new SecurityRateLimitService();
    expect(limiter.isAllowed('test', 'key', 2, 60_000)).toBe(true);
    expect(limiter.isAllowed('test', 'key', 2, 60_000)).toBe(true);
    expect(limiter.isAllowed('test', 'key', 2, 60_000)).toBe(false);
  });

  it('reports a retry delay without consuming more attempts after denial', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const limiter = new SecurityRateLimitService();
    expect(limiter.consume('test', 'key', 1, 5_000)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume('test', 'key', 1, 5_000)).toMatchObject({ allowed: false, retryAfterSeconds: 5, remaining: 0 });
    expect(limiter.consume('test', 'key', 1, 5_000)).toMatchObject({ allowed: false, retryAfterSeconds: 5, remaining: 0 });
    jest.restoreAllMocks();
  });

  it('isolates authenticated clients and does not trust forwarded addresses outside Render', () => {
    const renderRequest = {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.5' },
      ip: '10.0.0.5',
      socket: { remoteAddress: '10.0.0.5' },
    };
    expect(resolveClientIp(renderRequest, true)).toBe('203.0.113.10');
    expect(resolveClientIp(renderRequest, false)).toBe('10.0.0.5');
    expect(createGlobalRateLimitKey('203.0.113.10', 'user-a')).toBe('user:user-a:ip:203.0.113.10');
    expect(createGlobalRateLimitKey('203.0.113.10', 'user-b')).not.toBe(createGlobalRateLimitKey('203.0.113.10', 'user-a'));
    expect(createGlobalRateLimitKey('203.0.113.10')).toBe('ip:203.0.113.10');
  });

  it('allows a normal authenticated admin browsing budget and still limits abuse', () => {
    const limiter = new SecurityRateLimitService();
    const key = createGlobalRateLimitKey('203.0.113.10', 'admin-1');
    for (let requestNumber = 0; requestNumber < 600; requestNumber += 1) {
      expect(limiter.isAllowed('global', key, 600, 60_000)).toBe(true);
    }
    expect(limiter.consume('global', key, 600, 60_000)).toMatchObject({ allowed: false, retryAfterSeconds: expect.any(Number) });
    expect(limiter.isAllowed('global', createGlobalRateLimitKey('203.0.113.11', 'admin-2'), 600, 60_000)).toBe(true);
  });

  it('locks repeated login failures and resets after success', () => {
    const bruteForce = new LoginBruteForceService();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(bruteForce.recordFailure('127.0.0.1', 'user@example.com')).toBe(false);
    }
    expect(bruteForce.recordFailure('127.0.0.1', 'user@example.com')).toBe(true);
    expect(bruteForce.isBlocked('127.0.0.1', 'user@example.com')).toBe(true);
    bruteForce.recordSuccess('127.0.0.1', 'user@example.com');
    expect(bruteForce.isBlocked('127.0.0.1', 'user@example.com')).toBe(false);
  });

  it('sanitizes unexpected production errors without exposing exception details', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = { url: '/api/test' };
    const filter = new ProductionExceptionFilter();
    filter.catch(new Error('database password=do-not-expose'), {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as never);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error', path: '/api/test' });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('do-not-expose');
  });

  it('adds Retry-After to rate-limit responses', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
    const filter = new ProductionExceptionFilter();
    filter.catch(new RateLimitException('wait', 12), {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ url: '/api/auth/login', headers: {} }) }),
    } as never);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '12');
    expect(response.status).toHaveBeenCalledWith(429);
  });
});
