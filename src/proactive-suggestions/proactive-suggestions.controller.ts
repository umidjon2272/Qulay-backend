import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SuggestionStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SnoozeSuggestionDto } from './dto/snooze-suggestion.dto';
import { ProactiveSuggestionsService } from './proactive-suggestions.service';

@Controller('proactive-suggestions')
@UseGuards(JwtAuthGuard)
export class ProactiveSuggestionsController {
  constructor(private readonly proactiveSuggestions: ProactiveSuggestionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: SuggestionStatus) {
    return this.proactiveSuggestions.listForUser(user.sub, status ?? SuggestionStatus.ACTIVE);
  }

  @Post(':id/dismiss')
  dismiss(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.proactiveSuggestions.dismiss(user.sub, id);
  }

  @Post(':id/snooze')
  snooze(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: SnoozeSuggestionDto) {
    return this.proactiveSuggestions.snooze(user.sub, id, dto.until);
  }
}
