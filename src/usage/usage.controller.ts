import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiUsageService } from './usage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { LogVoiceUsageDto } from './dto/log-voice-usage.dto';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usageService: AiUsageService, private readonly subscriptions: SubscriptionsService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.usageService.getForUser(user.sub);
  }

  @Post('voice')
  async logVoice(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogVoiceUsageDto) {
    await this.subscriptions.assertVoiceAllowed(user.sub);
    await this.usageService.logVoiceUsage({ userId: user.sub, model: 'browser-speech', audioSeconds: dto.audioSeconds });
    return { recorded: true };
  }
}
