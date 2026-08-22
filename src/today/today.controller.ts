import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TodayQueryDto } from './dto/today-query.dto';
import { TodayService } from './today.service';

@Controller('today')
@UseGuards(JwtAuthGuard)
export class TodayController {
  constructor(private readonly todayService: TodayService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Query() query: TodayQueryDto) {
    return this.todayService.getForUser(user.sub, query.date);
  }
}
