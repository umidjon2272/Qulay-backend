import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  listPlans() { return this.subscriptions.listPlans(); }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: AuthenticatedUser) { return this.subscriptions.getForUser(user.sub); }
}
