import { AiVoiceService } from './ai-voice.service';
import { AiVoiceController } from './ai-voice.controller';
import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { AIToolsModule } from '../ai-tools/ai-tools.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsageModule } from '../usage/usage.module';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { AiProviderService } from './ai-provider.service';
import { BitoModule } from '../bito/bito.module';
import { SalesVisionService } from './sales-vision.service';
import { SalesProductKnowledgeService } from './sales-product-knowledge.service';

@Module({
  imports: [PrismaModule, AIToolsModule, UsageModule, SubscriptionsModule, ActivityLogModule, BitoModule],
  controllers: [AiAgentController, AiVoiceController],
  providers: [AiProviderService, AiAgentService, AiVoiceService, SalesVisionService, SalesProductKnowledgeService],
  exports: [AiProviderService, AiAgentService, AiVoiceService, SalesVisionService, SalesProductKnowledgeService],
})
export class AiAgentModule {}
