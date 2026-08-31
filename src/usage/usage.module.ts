import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsageController } from './usage.controller';
import { AiUsageService } from './usage.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [PrismaModule, CommonModule, SubscriptionsModule],
  controllers: [UsageController],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class UsageModule {}
