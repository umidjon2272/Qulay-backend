import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AgentSettingsService } from './agent-settings.service';
import { UpdateAgentSettingsDto } from './dto/update-agent-settings.dto';

@Controller('agent-settings')
@UseGuards(JwtAuthGuard)
export class AgentSettingsController {
  constructor(private readonly agentSettings: AgentSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.agentSettings.getForUser(user.sub);
  }

  @Patch()
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAgentSettingsDto) {
    return this.agentSettings.upsertForUser(user.sub, dto);
  }
}
