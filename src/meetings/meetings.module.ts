import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [PrismaModule, CommonModule, ActivityLogModule, NotificationsModule, GoogleModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
