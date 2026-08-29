import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EMAIL_DELIVERY_ADAPTER } from './password-reset/email-delivery.adapter';
import { NoopEmailDeliveryAdapter } from './password-reset/noop-email-delivery.adapter';
import { PasswordResetRateLimiterService } from './password-reset/password-reset-rate-limiter.service';
import { PasswordResetService } from './password-reset/password-reset.service';
import { LoginBruteForceService } from './login-brute-force.service';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { ConfigService } from '@nestjs/config';
import { ResendEmailDeliveryAdapter } from './password-reset/resend-email-delivery.adapter';

@Module({
  imports: [CommonModule, UsersModule, ActivityLogModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    PasswordResetRateLimiterService,
    LoginBruteForceService,
    AuthSecurityAuditService,
    NoopEmailDeliveryAdapter,
    ResendEmailDeliveryAdapter,
    {
      provide: EMAIL_DELIVERY_ADAPTER,
      inject: [ConfigService, NoopEmailDeliveryAdapter, ResendEmailDeliveryAdapter],
      useFactory: (config: ConfigService, noop: NoopEmailDeliveryAdapter, resend: ResendEmailDeliveryAdapter) => config.get('email.provider') === 'resend' ? resend : noop,
    },
  ],
  exports: [AuthService, PasswordResetService],
})
export class AuthModule {}
