import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [TodayController],
  providers: [TodayService],
  exports: [TodayService],
})
export class TodayModule {}
