import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConnectTelegramDto, SendTelegramMessageDto, TelegramChatsQueryDto, TelegramSearchQueryDto, VerifyTelegramCodeDto, VerifyTelegramPasswordDto } from './dto/telegram.dto';
import { TelegramIntegrationService } from './telegram-integration.service';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
import { RateLimitException } from '../common/security/rate-limit.exception';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('integrations/telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(
    private readonly telegram: TelegramIntegrationService,
    private readonly rateLimiter: SecurityRateLimitService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Post('qr/start')
  async startQrLogin(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    this.assertAllowed('telegram-qr-start', user.sub, 5);
    return this.telegram.startQrLogin(user.sub);
  }

  @Get('qr/status')
  async qrStatus(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    this.assertAllowed('telegram-qr-status', user.sub, 120);
    return this.telegram.qrStatus(user.sub);
  }

  @Post('connect')
  async connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectTelegramDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    this.assertAllowed('telegram-connect', user.sub, 10);
    return this.telegram.connect(user.sub, dto.phoneNumber);
  }

  @Post('resend-code')
  async resendCode(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    this.assertAllowed('telegram-resend-code', user.sub, 5);
    return this.telegram.resendCode(user.sub);
  }

  @Post('restart-code')
  async restartCode(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    this.assertAllowed('telegram-restart-code', user.sub, 3);
    return this.telegram.restartCode(user.sub);
  }

  @Post('verify-code')
  async verifyCode(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyTelegramCodeDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    this.assertAllowed('telegram-verify-code', user.sub, 10);
    return this.telegram.verifyCode(user.sub, dto.code);
  }

  @Post('verify-password')
  async verifyPassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyTelegramPasswordDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    this.assertAllowed('telegram-verify-password', user.sub, 10);
    return this.telegram.verifyPassword(user.sub, dto.password);
  }

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.status(user.sub);
  }

  @Delete('disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.disconnect(user.sub);
  }

  @Get('search')
  async search(@CurrentUser() user: AuthenticatedUser, @Query() query: TelegramSearchQueryDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    return this.telegram.search(user.sub, query);
  }

  @Get('chats')
  async chats(@CurrentUser() user: AuthenticatedUser, @Query() query: TelegramChatsQueryDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    return this.telegram.chats(user.sub, query);
  }

  @Post('send')
  async send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendTelegramMessageDto) {
    await this.subscriptions.assertFeatureAllowed(user.sub, 'TELEGRAM');
    const preview = await this.telegram.prepareTelegramMessage(user.sub, dto.peerId, dto.text);
    if (!dto.confirmed) return { status: 'confirmation_required', preview };
    const result = await this.telegram.sendMessage(user.sub, dto.peerId, dto.text);
    return { status: 'sent', messageId: result.messageId };
  }

  private assertAllowed(scope: string, userId: string, maxAttempts: number): void {
    if (!this.rateLimiter.isAllowed(scope, userId, maxAttempts, 15 * 60 * 1000)) {
      throw new RateLimitException('Too many integration attempts. Try again later.');
    }
  }
}
