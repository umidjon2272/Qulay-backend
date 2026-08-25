import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AIToolExecutionService } from './ai-tool-execution.service';
import { AIToolRegistryService } from './ai-tool-registry.service';
import { ExecuteToolDto } from './dto/execute-tool.dto';

@Controller('ai/tools')
@UseGuards(JwtAuthGuard)
export class AIToolsController {
  constructor(
    private readonly registry: AIToolRegistryService,
    private readonly execution: AIToolExecutionService,
  ) {}

  @Get()
  list() {
    return this.registry.listMetadata();
  }

  @Post('execute')
  execute(@CurrentUser() user: AuthenticatedUser, @Body() request: ExecuteToolDto) {
    return this.execution.execute(user.sub, request);
  }
}
