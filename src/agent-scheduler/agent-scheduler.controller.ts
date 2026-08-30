import { Controller, Headers, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentSchedulerService } from './agent-scheduler.service';

@Controller('internal/agent-scheduler')
export class AgentSchedulerController {
  constructor(
    private readonly config: ConfigService,
    private readonly scheduler: AgentSchedulerService,
  ) {}

  @Post('tick')
  async tick(@Headers('x-cron-secret') supplied?: string) {
    const expected = this.config.get<string>('agentCronSecret');
    if (!expected) throw new ServiceUnavailableException('Agent scheduler cron is not configured');
    if (!supplied || supplied !== expected) throw new UnauthorizedException('Invalid cron secret');
    const result = await this.scheduler.tick();
    return { ...result, processedAt: new Date().toISOString() };
  }
}
