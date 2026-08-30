import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { FinanceModule } from '../finance/finance.module';
import { IntegrationsHealthModule } from '../integrations-health/integrations-health.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProactiveSuggestionsController } from './proactive-suggestions.controller';
import { ProactiveSuggestionsService } from './proactive-suggestions.service';
import { ProactiveTriggerService } from './proactive-trigger.service';

@Module({
  imports: [PrismaModule, ActivityLogModule, FinanceModule, IntegrationsHealthModule, NotificationsModule],
  controllers: [ProactiveSuggestionsController],
  providers: [ProactiveSuggestionsService, ProactiveTriggerService],
  exports: [ProactiveSuggestionsService, ProactiveTriggerService],
})
export class ProactiveSuggestionsModule {}
