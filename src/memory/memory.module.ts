import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';

@Module({
  imports: [PrismaModule, CommonModule, ActivityLogModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
