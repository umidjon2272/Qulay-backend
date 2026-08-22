"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const Joi = require("joi");
const configuration_1 = require("./config/configuration");
const auth_module_1 = require("./auth/auth.module");
const activity_log_module_1 = require("./activity-log/activity-log.module");
const common_module_1 = require("./common/common.module");
const conversations_module_1 = require("./conversations/conversations.module");
const health_module_1 = require("./health/health.module");
const meetings_module_1 = require("./meetings/meetings.module");
const memory_module_1 = require("./memory/memory.module");
const messages_module_1 = require("./messages/messages.module");
const notes_module_1 = require("./notes/notes.module");
const prisma_module_1 = require("./prisma/prisma.module");
const reminders_module_1 = require("./reminders/reminders.module");
const tasks_module_1 = require("./tasks/tasks.module");
const today_module_1 = require("./today/today.module");
const users_module_1 = require("./users/users.module");
const usage_module_1 = require("./usage/usage.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                cache: true,
                load: [configuration_1.default],
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
            prisma_module_1.PrismaModule,
            common_module_1.CommonModule,
            activity_log_module_1.ActivityLogModule,
            users_module_1.UsersModule,
            auth_module_1.AuthModule,
            tasks_module_1.TasksModule,
            reminders_module_1.RemindersModule,
            meetings_module_1.MeetingsModule,
            notes_module_1.NotesModule,
            today_module_1.TodayModule,
            conversations_module_1.ConversationsModule,
            messages_module_1.MessagesModule,
            memory_module_1.MemoryModule,
            usage_module_1.UsageModule,
            health_module_1.HealthModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map