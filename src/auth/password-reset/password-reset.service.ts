import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { ACTIVITY_ACTIONS } from '../../activity-log/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { EMAIL_DELIVERY_ADAPTER, EmailDeliveryAdapter } from './email-delivery.adapter';
import { PasswordResetRateLimiterService } from './password-reset-rate-limiter.service';
import { RateLimitException } from '../../common/security/rate-limit.exception';
import { APP_ERROR_CODES } from '../../common/errors/app-error-codes';

export const FORGOT_PASSWORD_RESPONSE = {
  success: true,
  message: 'Agar bu email ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash ko‘rsatmasi yuboriladi.',
} as const;

const INVALID_RESET_TOKEN_HASH = bcrypt.hashSync('invalid-password-reset-token', 10);

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rateLimiter: PasswordResetRateLimiterService,
    @Inject(EMAIL_DELIVERY_ADAPTER) private readonly emailAdapter: EmailDeliveryAdapter,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto, ip: string): Promise<typeof FORGOT_PASSWORD_RESPONSE> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const rawToken = randomBytes(48).toString('base64url');
    const tokenFingerprint = this.fingerprint(rawToken);
    const tokenHash = await bcrypt.hash(tokenFingerprint, this.saltRounds());
    const allowed = this.rateLimiter.isAllowed(ip, normalizedEmail);
    const user = allowed
      ? await this.prisma.user.findUnique({ where: { email: normalizedEmail } })
      : null;

    if (!user || user.status !== UserStatus.ACTIVE) return FORGOT_PASSWORD_RESPONSE;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.expiresInMinutes() * 60 * 1000);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
          data: { expiresAt: now },
        });
        await transaction.passwordResetToken.create({
          data: { userId: user.id, tokenFingerprint, tokenHash, expiresAt },
        });
        await transaction.activityLog.create({
          data: {
            userId: user.id,
            action: ACTIVITY_ACTIONS.PASSWORD_RESET_REQUESTED,
            entityType: 'PASSWORD_RESET',
          },
        });
      });

      const resetUrl = `${this.frontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await this.emailAdapter.sendPasswordResetEmail({
        to: normalizedEmail,
        resetUrl,
        expiresInMinutes: this.expiresInMinutes(),
      });
    } catch {
      // Do not expose delivery/database details or any token material to the client.
      this.logger.error('Password reset request could not be completed');
    }

    return FORGOT_PASSWORD_RESPONSE;
  }

  async resetPassword(dto: ResetPasswordDto, ip = 'unknown'): Promise<{ success: true; message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Parollar mos kelmaydi.');
    }

    const rawToken = dto.token;
    const tokenFingerprint = this.fingerprint(rawToken);
    if (!this.rateLimiter.isResetAllowed(ip, tokenFingerprint)) {
      throw new RateLimitException('Too many password reset attempts');
    }
    let resetToken;
    try {
      resetToken = await this.prisma.passwordResetToken.findFirst({
        where: { tokenFingerprint },
        include: { user: true },
      });
    } catch {
      throw new InternalServerErrorException('Unable to reset password');
    }
    const hashMatches = await bcrypt.compare(tokenFingerprint, resetToken?.tokenHash ?? INVALID_RESET_TOKEN_HASH);
    const now = new Date();

    if (!resetToken || !hashMatches || resetToken.expiresAt <= now || resetToken.usedAt || resetToken.user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({ code: APP_ERROR_CODES.RESET_TOKEN_INVALID, message: 'Reset token yaroqsiz yoki muddati tugagan.' });
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, this.saltRounds());
    try {
      await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.passwordResetToken.updateMany({
          where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new BadRequestException({ code: APP_ERROR_CODES.RESET_TOKEN_INVALID, message: 'Reset token yaroqsiz yoki muddati tugagan.' });

        const updatedUser = await transaction.user.updateMany({
          where: { id: resetToken.userId, status: UserStatus.ACTIVE },
          data: { passwordHash: newPasswordHash },
        });
        if (updatedUser.count !== 1) throw new BadRequestException({ code: APP_ERROR_CODES.RESET_TOKEN_INVALID, message: 'Reset token yaroqsiz yoki muddati tugagan.' });

        await transaction.refreshToken.updateMany({
          where: { userId: resetToken.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await transaction.activityLog.create({
          data: {
            userId: resetToken.userId,
            action: ACTIVITY_ACTIONS.PASSWORD_RESET_COMPLETED,
            entityType: 'PASSWORD_RESET',
          },
        });
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Unable to reset password');
    }

    return { success: true, message: 'Parol muvaffaqiyatli yangilandi.' };
  }

  cleanupExpiredOrUsed() {
    const now = new Date();
    return this.prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] },
    });
  }

  private normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
  private fingerprint(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private saltRounds(): number { return this.configService.get<number>('bcryptSaltRounds', 12); }
  private expiresInMinutes(): number { return this.configService.get<number>('passwordResetExpiresMinutes', 30); }
  private frontendUrl(): string { return this.configService.getOrThrow<string>('frontendUrl').replace(/\/$/, ''); }
}
