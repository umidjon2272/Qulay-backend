import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { ContactsModule } from '../contacts/contacts.module';
import { FinanceModule } from '../finance/finance.module';
import { MemoryModule } from '../memory/memory.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { NotesModule } from '../notes/notes.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { TodayModule } from '../today/today.module';
import { TelegramModule } from '../telegram/telegram.module';
import { GoogleModule } from '../google/google.module';
import { FilesModule } from '../files/files.module';
import { BriefingModule } from '../briefing/briefing.module';
import { AIToolExecutionService } from './ai-tool-execution.service';
import { AIToolsController } from './ai-tools.controller';
import { AIToolRegistryService } from './ai-tool-registry.service';

@Module({
  imports: [ActivityLogModule, ContactsModule, FinanceModule, MemoryModule, MeetingsModule, NotesModule, RemindersModule, TasksModule, TodayModule, TelegramModule, GoogleModule, FilesModule, BriefingModule],
  controllers: [AIToolsController],
  providers: [AIToolRegistryService, AIToolExecutionService],
  exports: [AIToolRegistryService, AIToolExecutionService],
})
export class AIToolsModule {}
