import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { TelegramModule } from './telegram.module';
import { TelegramSalesAgentController } from './telegram-sales-agent.controller';
import { TelegramSalesAgentService } from './telegram-sales-agent.service';

@Module({
  imports: [PrismaModule, TelegramModule, AiAgentModule, SubscriptionsModule],
  controllers: [TelegramSalesAgentController],
  providers: [TelegramSalesAgentService],
  exports: [TelegramSalesAgentService],
})
export class TelegramSalesAgentModule {}
