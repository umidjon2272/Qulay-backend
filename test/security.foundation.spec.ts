import { HttpStatus } from '@nestjs/common';
import { LoginBruteForceService } from '../src/auth/login-brute-force.service';
import { ProductionExceptionFilter } from '../src/common/security/production-exception.filter';
import { SecurityRateLimitService } from '../src/common/security/security-rate-limit.service';

describe('Production security foundation', () => {
  it('limits a scope/key within its configured window', () => {
    const limiter = new SecurityRateLimitService();
    expect(limiter.isAllowed('test', 'key', 2, 60_000)).toBe(true);
    expect(limiter.isAllowed('test', 'key', 2, 60_000)).toBe(true);
    expect(limiter.isAllowed('test', 'key', 2, 60_000)).toBe(false);
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
});
