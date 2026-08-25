import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import configuration from './config/configuration';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().min(1).required(),
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
        REQUEST_BODY_LIMIT: Joi.string().pattern(/^\d+(kb|mb)$/i).default('1mb'),
        JWT_ACCESS_SECRET: Joi.string().min(64).pattern(/^[\x21-\x7e]+$/).required(),
        JWT_REFRESH_SECRET: Joi.string().min(64).pattern(/^[\x21-\x7e]+$/).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().min(1).default('15m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().min(1).default('30d'),
        BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),
        AUTH_TIMING_LOGS: Joi.boolean().truthy('true').falsy('false').default(false),
        PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().integer().min(15).max(30).default(30),
        PORT: Joi.number().integer().min(1).max(65535).default(3000),
        FRONTEND_URL: Joi.string().min(1).default('http://localhost:5173'),
        TELEGRAM_API_ID: Joi.number().integer().positive().required(),
        TELEGRAM_API_HASH: Joi.string().min(1).required(),
        TELEGRAM_SESSION_ENCRYPTION_KEY: Joi.string().pattern(/^[a-fA-F0-9]{64}$/).required(),
        GOOGLE_CLIENT_ID: Joi.string().min(1).required(),
        GOOGLE_CLIENT_SECRET: Joi.string().min(1).required(),
        GOOGLE_REDIRECT_URI: Joi.string().uri().required(),
        GOOGLE_TOKEN_ENCRYPTION_KEY: Joi.string().pattern(/^[a-fA-F0-9]{64}$/).required(),
        FILE_STORAGE_PROVIDER: Joi.string().lowercase().valid('local', 's3').default('local'),
        FILE_STORAGE_LOCAL_PATH: Joi.string().min(1).default('./uploads'),
        FILE_MAX_SIZE_MB: Joi.number().integer().min(1).max(1024).default(20),
        S3_ENDPOINT: Joi.string().uri().optional(),
        S3_REGION: Joi.string().optional(),
        S3_BUCKET: Joi.string().optional(),
        S3_ACCESS_KEY_ID: Joi.string().optional(),
        S3_SECRET_ACCESS_KEY: Joi.string().optional(),
      }).custom((value, helpers) => {
        if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) return helpers.error('any.invalid');
        if (value.NODE_ENV === 'production' && value.AUTH_TIMING_LOGS) return helpers.error('any.invalid');
        return value;
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
    HealthModule,
  ],
})
export class AppModule {}
