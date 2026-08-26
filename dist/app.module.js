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
const configuration_1 = require("./config/configuration");
const env_validation_1 = require("./config/env-validation");
const auth_module_1 = require("./auth/auth.module");
const activity_log_module_1 = require("./activity-log/activity-log.module");
const common_module_1 = require("./common/common.module");
const conversations_module_1 = require("./conversations/conversations.module");
const contacts_module_1 = require("./contacts/contacts.module");
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
const finance_module_1 = require("./finance/finance.module");
const ai_tools_module_1 = require("./ai-tools/ai-tools.module");
const telegram_module_1 = require("./telegram/telegram.module");
const google_module_1 = require("./google/google.module");
const notifications_module_1 = require("./notifications/notifications.module");
const files_module_1 = require("./files/files.module");
const admin_module_1 = require("./admin/admin.module");
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
                validationSchema: env_validation_1.envValidationSchema,
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
            contacts_module_1.ContactsModule,
            messages_module_1.MessagesModule,
            memory_module_1.MemoryModule,
            usage_module_1.UsageModule,
            finance_module_1.FinanceModule,
            ai_tools_module_1.AIToolsModule,
            telegram_module_1.TelegramModule,
            google_module_1.GoogleModule,
            notifications_module_1.NotificationsModule,
            files_module_1.FilesModule,
            admin_module_1.AdminModule,
            health_module_1.HealthModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map