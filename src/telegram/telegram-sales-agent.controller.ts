import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TelegramSalesAgentService } from './telegram-sales-agent.service';

export class UpdateTelegramSalesAgentDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() privateChats?: boolean;
  @IsOptional() @IsBoolean() groups?: boolean;
  @IsOptional() @IsBoolean() voiceEnabled?: boolean;
}

@Controller('integrations/telegram/sales-agent')
@UseGuards(JwtAuthGuard)
export class TelegramSalesAgentController {
  constructor(private readonly salesAgent: TelegramSalesAgentService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.salesAgent.getSettings(user.sub);
  }

  @Patch()
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateTelegramSalesAgentDto) {
    return this.salesAgent.updateSettings(user.sub, dto);
  }
}
