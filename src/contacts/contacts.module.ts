import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ContactHistoryService } from './contact-history.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [PrismaModule, CommonModule, ActivityLogModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactHistoryService],
  exports: [ContactsService, ContactHistoryService],
})
export class ContactsModule {}
