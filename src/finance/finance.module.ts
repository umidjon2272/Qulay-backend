import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { CommonModule } from '../common/common.module';
import { ContactsModule } from '../contacts/contacts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceToolsService } from './finance-tools.service';

@Module({
  imports: [PrismaModule, CommonModule, ActivityLogModule, ContactsModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceToolsService],
  exports: [FinanceService, FinanceToolsService],
})
export class FinanceModule {}
