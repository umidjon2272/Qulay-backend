import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { CommonModule } from './common/common.module';
import { ConversationsModule } from './conversations/conversations.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().min(1).required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().min(1).default('15m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().min(1).default('30d'),
        BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),
        PORT: Joi.number().integer().min(1).max(65535).default(3000),
        FRONTEND_URL: Joi.string().min(1).default('http://localhost:5173'),
      }),
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
    MessagesModule,
    MemoryModule,
    UsageModule,
    HealthModule,
  ],
})
export class AppModule {}
