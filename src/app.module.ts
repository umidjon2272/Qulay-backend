import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env-validation';
import { AuthModule } from './auth/auth.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { CommonModule } from './common/common.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ContactsModule } from './contacts/contacts.module';
import { HealthModule } from './health/health.module';
import { MeetingsModule } from './meetings/meetings.module';
import { MemoryModule } from './memory/memory.module';
import { MessagesModule } from './messages/messages.module';
import { NotesModule } from './notes/notes.module';
import { PrismaModule } from './prisma/prisma.module';
import { RemindersModule } from './reminders/reminders.module';
import { TasksModule } from './tasks/tasks.module';
import { TodayModule } from './today/today.module';
import { UsersModule } from './users/users.module';
import { UsageModule } from './usage/usage.module';
import { FinanceModule } from './finance/finance.module';
import { AIToolsModule } from './ai-tools/ai-tools.module';
import { TelegramModule } from './telegram/telegram.module';
import { GoogleModule } from './google/google.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { AdminModule } from './admin/admin.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { AgentSettingsModule } from './agent-settings/agent-settings.module';
import { BriefingModule } from './briefing/briefing.module';
import { IntegrationsHealthModule } from './integrations-health/integrations-health.module';
import { ProactiveSuggestionsModule } from './proactive-suggestions/proactive-suggestions.module';
import { AgentSchedulerModule } from './agent-scheduler/agent-scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    CommonModule,
    ActivityLogModule,
    UsersModule,
    AuthModule,
    TasksModule,
    RemindersModule,
    MeetingsModule,
    NotesModule,
    TodayModule,
    ConversationsModule,
    ContactsModule,
    MessagesModule,
    MemoryModule,
    UsageModule,
    FinanceModule,
    AIToolsModule,
    TelegramModule,
    GoogleModule,
    NotificationsModule,
    FilesModule,
    AdminModule,
    SubscriptionsModule,
    AiAgentModule,
    AgentSettingsModule,
    IntegrationsHealthModule,
    BriefingModule,
    ProactiveSuggestionsModule,
    AgentSchedulerModule,
    HealthModule,
  ],
})
export class AppModule {}
