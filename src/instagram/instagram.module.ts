import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsageModule } from '../usage/usage.module';
import { InstagramCoreModule } from './instagram-core.module';
import { InstagramController } from './instagram.controller';
import { InstagramCommentMatcherService } from './instagram-comment-matcher.service';
import { InstagramSalesAgentService } from './instagram-sales-agent.service';

@Module({
  imports: [PrismaModule, AiAgentModule, SubscriptionsModule, UsageModule, InstagramCoreModule],
  controllers: [InstagramController],
  providers: [InstagramCommentMatcherService, InstagramSalesAgentService],
  exports: [InstagramCoreModule, InstagramSalesAgentService],
})
export class InstagramModule {}
