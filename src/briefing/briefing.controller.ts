import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BriefingService } from './briefing.service';

@Controller('briefing')
@UseGuards(JwtAuthGuard)
export class BriefingController {
  constructor(private readonly briefing: BriefingService) {}

  @Get('morning')
  morning(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.briefing.buildMorningBriefing(user.sub, date);
  }

  @Get('evening')
  evening(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.briefing.buildEveningSummary(user.sub, date);
  }
}
