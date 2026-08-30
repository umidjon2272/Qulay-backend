import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { BriefingModule } from '../briefing/briefing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProactiveSuggestionsModule } from '../proactive-suggestions/proactive-suggestions.module';
import { AgentSchedulerController } from './agent-scheduler.controller';
import { AgentSchedulerService } from './agent-scheduler.service';

@Module({
  imports: [PrismaModule, ActivityLogModule, AiAgentModule, BriefingModule, ProactiveSuggestionsModule, NotificationsModule],
  controllers: [AgentSchedulerController],
  providers: [AgentSchedulerService],
  exports: [AgentSchedulerService],
})
export class AgentSchedulerModule {}
