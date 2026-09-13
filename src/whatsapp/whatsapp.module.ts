import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppCryptoService } from './whatsapp-crypto.service';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppSalesAgentService } from './whatsapp-sales-agent.service';

@Module({
  imports: [PrismaModule, AiAgentModule, SubscriptionsModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppCryptoService, WhatsAppCloudService, WhatsAppSalesAgentService],
  exports: [WhatsAppCloudService, WhatsAppSalesAgentService],
})
export class WhatsAppModule {}
