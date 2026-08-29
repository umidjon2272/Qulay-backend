import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { AIToolsModule } from '../ai-tools/ai-tools.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsageModule } from '../usage/usage.module';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { AiProviderService } from './ai-provider.service';

@Module({
  imports: [PrismaModule, AIToolsModule, UsageModule, SubscriptionsModule, ActivityLogModule],
  controllers: [AiAgentController],
  providers: [AiProviderService, AiAgentService],
})
export class AiAgentModule {}
