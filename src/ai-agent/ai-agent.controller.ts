import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiAgentService } from './ai-agent.service';
import { AgentChatDto, AgentConfirmationDto } from './dto/agent-chat.dto';

@Controller('ai/agent')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
  constructor(private readonly agent: AiAgentService) {}

  @Get('status')
  status() { return this.agent.status(); }

  @Post('chat')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: AgentChatDto) { return this.agent.chat(user.sub, dto); }

  @Post('actions/:id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: AgentConfirmationDto) {
    return this.agent.confirm(user.sub, id, dto.confirmed);
  }
}
