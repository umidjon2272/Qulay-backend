import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentSettingsController } from './agent-settings.controller';
import { AgentSettingsService } from './agent-settings.service';

@Module({
  imports: [PrismaModule, ActivityLogModule],
  controllers: [AgentSettingsController],
  providers: [AgentSettingsService],
  exports: [AgentSettingsService],
})
export class AgentSettingsModule {}
