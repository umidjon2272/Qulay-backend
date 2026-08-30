import { Module } from '@nestjs/common';
import { AiProviderService } from '../ai-agent/ai-provider.service';
import { FinanceModule } from '../finance/finance.module';
import { IntegrationsHealthModule } from '../integrations-health/integrations-health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TodayModule } from '../today/today.module';
import { UsageModule } from '../usage/usage.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';

// AiProviderService is provided directly here (not via AiAgentModule) to avoid a
// module cycle: AIToolsModule -> BriefingModule -> AiAgentModule -> AIToolsModule.
// AiProviderService has no state beyond the global ConfigService, so a second
// instance is harmless.
@Module({
  imports: [PrismaModule, TodayModule, FinanceModule, IntegrationsHealthModule, UsageModule],
  controllers: [BriefingController],
  providers: [BriefingService, AiProviderService],
  exports: [BriefingService],
})
export class BriefingModule {}
