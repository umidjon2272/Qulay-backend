import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { PasswordResetService } from '../src/auth/password-reset/password-reset.service';
import { PasswordResetRateLimiterService } from '../src/auth/password-reset/password-reset-rate-limiter.service';
import { EmailDeliveryAdapter } from '../src/auth/password-reset/email-delivery.adapter';

describe('PasswordResetService', () => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'old-hash',
    status: 'ACTIVE',
  } as const;
  let prisma: {
    user: { findUnique: jest.Mock; updateMany: jest.Mock };
    passwordResetToken: { updateMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    activityLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let adapter: EmailDeliveryAdapter & { sendPasswordResetEmail: jest.Mock };
  let service: PasswordResetService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (callback: (transaction: typeof prisma) => unknown) => callback(prisma)),
    };
    adapter = { sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) };
    service = new PasswordResetService(
      prisma as never,
      { get: jest.fn((key: string, fallback: number) => key === 'bcryptSaltRounds' ? 4 : fallback), getOrThrow: jest.fn().mockReturnValue('https://qulay-ai.vercel.app') } as never,
      new PasswordResetRateLimiterService(),
      adapter,
    );
  });

  it('returns the same generic response for existing and unknown emails', async () => {
    const existing = await service.forgotPassword({ email: user.email }, '127.0.0.1');
    prisma.user.findUnique.mockResolvedValue(null);
    const unknown = await service.forgotPassword({ email: 'unknown@example.com' }, '127.0.0.2');

    expect(existing).toEqual(unknown);
    expect(existing.success).toBe(true);
    expect(existing.message).not.toContain(user.email);
  });

  it('creates a hashed single-use token and sends a reset URL without storing the raw token', async () => {
    await service.forgotPassword({ email: user.email }, '127.0.0.1');

    const created = prisma.passwordResetToken.create.mock.calls[0][0].data as { tokenFingerprint: string; tokenHash: string };
    const resetUrl = adapter.sendPasswordResetEmail.mock.calls[0][0].resetUrl as string;
    const rawToken = new URL(resetUrl).searchParams.get('token');
    expect(rawToken).toBeTruthy();
    expect(created.tokenFingerprint).not.toBe(rawToken);
    expect(created.tokenHash).not.toBe(rawToken);
    expect(await bcrypt.compare(created.tokenFingerprint, created.tokenHash)).toBe(true);
    expect(resetUrl).toContain('/reset-password?token=');
  });

  it('rejects invalid, expired, used and blocked tokens', async () => {
    const fingerprint = createHash('sha256').update('raw-token').digest('hex');
    for (const overrides of [
      { tokenHash: await bcrypt.hash('different', 4) },
      { expiresAt: new Date(Date.now() - 1000) },
      { usedAt: new Date() },
      { user: { ...user, status: 'BLOCKED' } },
    ]) {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'reset-1', userId: user.id, tokenFingerprint: fingerprint, tokenHash: await bcrypt.hash(fingerprint, 4),
        expiresAt: new Date(Date.now() + 60_000), usedAt: null, user, ...overrides,
      });
      await expect(service.resetPassword({ token: 'raw-token', newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' })).rejects.toThrow();
    }
  });

  it('updates the password, revokes sessions and makes a token single-use', async () => {
    const fingerprint = createHash('sha256').update('raw-token').digest('hex');
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.findFirst.mockResolvedValue({
      id: 'reset-1', userId: user.id, tokenFingerprint: fingerprint, tokenHash: await bcrypt.hash(fingerprint, 4),
      expiresAt: new Date(Date.now() + 60_000), usedAt: null, user,
    });

    await expect(service.resetPassword({ token: 'raw-token', newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' })).resolves.toEqual({ success: true, message: 'Parol muvaffaqiyatli yangilandi.' });
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { usedAt: expect.any(Date) } }));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });
});
