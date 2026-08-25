import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { EmailDeliveryAdapter } from './email-delivery.adapter';
import { PasswordResetRateLimiterService } from './password-reset-rate-limiter.service';
export declare const FORGOT_PASSWORD_RESPONSE: {
    readonly success: true;
    readonly message: "Agar bu email ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash ko‘rsatmasi yuboriladi.";
};
export declare class PasswordResetService {
    private readonly prisma;
    private readonly configService;
    private readonly rateLimiter;
    private readonly emailAdapter;
    private readonly logger;
    constructor(prisma: PrismaService, configService: ConfigService, rateLimiter: PasswordResetRateLimiterService, emailAdapter: EmailDeliveryAdapter);
    forgotPassword(dto: ForgotPasswordDto, ip: string): Promise<typeof FORGOT_PASSWORD_RESPONSE>;
    resetPassword(dto: ResetPasswordDto, ip?: string): Promise<{
        success: true;
        message: string;
    }>;
    cleanupExpiredOrUsed(): import(".prisma/client").Prisma.PrismaPromise<import(".prisma/client").Prisma.BatchPayload>;
    private normalizeEmail;
    private fingerprint;
    private saltRounds;
    private expiresInMinutes;
    private frontendUrl;
}
