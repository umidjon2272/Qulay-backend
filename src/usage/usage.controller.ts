import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiUsageService } from './usage.service';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usageService: AiUsageService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.usageService.getForUser(user.sub);
  }
}
