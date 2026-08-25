"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIToolsModule = void 0;
const common_1 = require("@nestjs/common");
const activity_log_module_1 = require("../activity-log/activity-log.module");
const contacts_module_1 = require("../contacts/contacts.module");
const finance_module_1 = require("../finance/finance.module");
const memory_module_1 = require("../memory/memory.module");
const meetings_module_1 = require("../meetings/meetings.module");
const notes_module_1 = require("../notes/notes.module");
const reminders_module_1 = require("../reminders/reminders.module");
const tasks_module_1 = require("../tasks/tasks.module");
const today_module_1 = require("../today/today.module");
const telegram_module_1 = require("../telegram/telegram.module");
const google_module_1 = require("../google/google.module");
const files_module_1 = require("../files/files.module");
const ai_tool_execution_service_1 = require("./ai-tool-execution.service");
const ai_tools_controller_1 = require("./ai-tools.controller");
const ai_tool_registry_service_1 = require("./ai-tool-registry.service");
let AIToolsModule = class AIToolsModule {
};
exports.AIToolsModule = AIToolsModule;
exports.AIToolsModule = AIToolsModule = __decorate([
    (0, common_1.Module)({
        imports: [activity_log_module_1.ActivityLogModule, contacts_module_1.ContactsModule, finance_module_1.FinanceModule, memory_module_1.MemoryModule, meetings_module_1.MeetingsModule, notes_module_1.NotesModule, reminders_module_1.RemindersModule, tasks_module_1.TasksModule, today_module_1.TodayModule, telegram_module_1.TelegramModule, google_module_1.GoogleModule, files_module_1.FilesModule],
        controllers: [ai_tools_controller_1.AIToolsController],
        providers: [ai_tool_registry_service_1.AIToolRegistryService, ai_tool_execution_service_1.AIToolExecutionService],
        exports: [ai_tool_registry_service_1.AIToolRegistryService, ai_tool_execution_service_1.AIToolExecutionService],
    })
], AIToolsModule);
//# sourceMappingURL=ai-tools.module.js.map