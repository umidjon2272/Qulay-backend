import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConnectTelegramDto, SendTelegramMessageDto, TelegramChatsQueryDto, TelegramSearchQueryDto, VerifyTelegramCodeDto, VerifyTelegramPasswordDto } from './dto/telegram.dto';
import { TelegramIntegrationService } from './telegram-integration.service';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
import { RateLimitException } from '../common/security/rate-limit.exception';

@Controller('integrations/telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(
    private readonly telegram: TelegramIntegrationService,
    private readonly rateLimiter: SecurityRateLimitService,
  ) {}

  @Post('qr/start')
  startQrLogin(@CurrentUser() user: AuthenticatedUser) {
    this.assertAllowed('telegram-qr-start', user.sub, 5);
    return this.telegram.startQrLogin(user.sub);
  }

  @Get('qr/status')
  qrStatus(@CurrentUser() user: AuthenticatedUser) {
    this.assertAllowed('telegram-qr-status', user.sub, 120);
    return this.telegram.qrStatus(user.sub);
  }

  @Post('connect')
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectTelegramDto) {
    this.assertAllowed('telegram-connect', user.sub, 10);
    return this.telegram.connect(user.sub, dto.phoneNumber);
  }

  @Post('resend-code')
  resendCode(@CurrentUser() user: AuthenticatedUser) {
    this.assertAllowed('telegram-resend-code', user.sub, 5);
    return this.telegram.resendCode(user.sub);
  }

  @Post('verify-code')
  verifyCode(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyTelegramCodeDto) {
    this.assertAllowed('telegram-verify-code', user.sub, 10);
    return this.telegram.verifyCode(user.sub, dto.code);
  }

  @Post('verify-password')
  verifyPassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyTelegramPasswordDto) {
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
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: TelegramSearchQueryDto) {
    return this.telegram.search(user.sub, query);
  }

  @Get('chats')
  chats(@CurrentUser() user: AuthenticatedUser, @Query() query: TelegramChatsQueryDto) {
    return this.telegram.chats(user.sub, query);
  }

  @Post('send')
  async send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendTelegramMessageDto) {
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
