import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsageController } from './usage.controller';
import { AiUsageService } from './usage.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [UsageController],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class UsageModule {}
