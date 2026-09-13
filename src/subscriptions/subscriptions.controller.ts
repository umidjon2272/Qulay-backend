import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SubscriptionTier } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

class RequestSubscriptionDto {
  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  listPlans() { return this.subscriptions.listPlans(); }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: AuthenticatedUser) { return this.subscriptions.getForUser(user.sub); }

  @Post('request')
  @UseGuards(JwtAuthGuard)
  requestPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestSubscriptionDto) {
    return this.subscriptions.requestPlan(user.sub, dto.tier);
  }
}
