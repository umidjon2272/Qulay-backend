"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIToolRegistryService = void 0;
const common_1 = require("@nestjs/common");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const contact_history_service_1 = require("../contacts/contact-history.service");
const contacts_service_1 = require("../contacts/contacts.service");
const finance_service_1 = require("../finance/finance.service");
const finance_tools_service_1 = require("../finance/finance-tools.service");
const memory_service_1 = require("../memory/memory.service");
const meetings_service_1 = require("../meetings/meetings.service");
const notes_service_1 = require("../notes/notes.service");
const reminders_service_1 = require("../reminders/reminders.service");
const tasks_service_1 = require("../tasks/tasks.service");
const today_service_1 = require("../today/today.service");
const tool_input_dto_1 = require("./dto/tool-input.dto");
const telegram_integration_service_1 = require("../telegram/telegram-integration.service");
const google_calendar_service_1 = require("../google/google-calendar.service");
const google_drive_service_1 = require("../google/google-drive.service");
const files_service_1 = require("../files/files.service");
const ai_tool_types_1 = require("./types/ai-tool.types");
function schema(properties, required = []) {
    return { type: 'object', properties, required };
}
async function validateInput(input, dtoClass) {
    (0, ai_tool_types_1.assertToolObject)(input);
    const instance = (0, class_transformer_1.plainToInstance)(dtoClass, input);
    const errors = await (0, class_validator_1.validate)(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
    });
    if (errors.length > 0) {
        throw new common_1.BadRequestException({ message: 'Invalid tool input', errors: flattenValidationErrors(errors) });
    }
    return instance;
}
function flattenValidationErrors(errors) {
    return errors.flatMap((error) => Object.values(error.constraints ?? {}).map((message) => `${error.property}: ${message}`));
}
function asDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new common_1.BadRequestException('Invalid date value');
    return date;
}
function assertPeriod(from, to) {
    const parsedFrom = asDate(from);
    const parsedTo = asDate(to);
    if (parsedFrom >= parsedTo)
        throw new common_1.BadRequestException('from must be before to');
    return { from: parsedFrom, to: parsedTo };
}
let AIToolRegistryService = class AIToolRegistryService {
    constructor(tasksService, remindersService, meetingsService, notesService, contactsService, contactHistoryService, memoryService, financeService, financeToolsService, todayService, telegramIntegrationService, activityLog, googleCalendarService, googleDriveService, filesService) {
        this.tasksService = tasksService;
        this.remindersService = remindersService;
        this.meetingsService = meetingsService;
        this.notesService = notesService;
        this.contactsService = contactsService;
        this.contactHistoryService = contactHistoryService;
        this.memoryService = memoryService;
        this.financeService = financeService;
        this.financeToolsService = financeToolsService;
        this.todayService = todayService;
        this.telegramIntegrationService = telegramIntegrationService;
        this.activityLog = activityLog;
        this.googleCalendarService = googleCalendarService;
        this.googleDriveService = googleDriveService;
        this.filesService = filesService;
        this.tools = new Map();
        this.registerTools();
    }
    listMetadata() {
        return [...this.tools.values()].map(({ name, category, requiresConfirmation, sideEffect }) => ({
            name, category, requiresConfirmation, sideEffect,
        }));
    }
    getToolDefinitionsForModel() {
        return [...this.tools.values()].map(({ name, description, category, inputSchema, requiresConfirmation, sideEffect, permission }) => ({
            name, description, category, inputSchema, requiresConfirmation, sideEffect, permission,
        }));
    }
    get(name) {
        const tool = this.tools.get(name);
        if (!tool)
            throw new common_1.NotFoundException(`Unknown AI tool: ${name}`);
        return tool;
    }
    register(tool) {
        if (this.tools.has(tool.name))
            throw new Error(`Duplicate AI tool registration: ${tool.name}`);
        this.tools.set(tool.name, tool);
    }
    base(config) {
        return {
            name: config.name,
            description: config.description,
            category: config.category,
            inputSchema: config.inputSchema,
            requiresConfirmation: config.sideEffect === 'WRITE',
            sideEffect: config.sideEffect,
            permission: 'USER_SCOPED',
            validate: (input) => validateInput(input, config.validate),
            authorize: config.authorize,
            preview: config.preview,
            execute: config.execute,
        };
    }
    registerTools() {
        this.register(this.base({
            name: 'get_today_plan', description: 'Get the user-scoped plan for today.', category: ai_tool_types_1.AIToolCategory.TODAY,
            sideEffect: 'READ', validate: tool_input_dto_1.TodayPlanInput, inputSchema: schema({ date: { type: 'string', description: 'Optional YYYY-MM-DD date' } }),
            execute: async (context, input) => {
                const [today, notes] = await Promise.all([
                    this.todayService.getForUser(context.userId, input.date),
                    this.notesService.listForUser(context.userId, { page: 1, limit: 5 }),
                ]);
                return {
                    date: today.date, timezone: today.timezone, tasks: today.tasks, reminders: today.reminders,
                    meetings: today.meetings, overdueTasks: today.overdueTasks, nextMeeting: today.nextMeeting,
                    notes: { count: notes.meta.total, recent: notes.items.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })) },
                };
            },
        }));
        this.register(this.base({
            name: 'get_tasks', description: 'List the authenticated user\'s tasks.', category: ai_tool_types_1.AIToolCategory.TASK,
            sideEffect: 'READ', validate: tool_input_dto_1.TasksToolInput, inputSchema: schema({ status: { type: 'string' }, priority: { type: 'string' }, date: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer' } }),
            execute: (context, input) => this.tasksService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input }),
        }));
        this.register(this.base({
            name: 'get_reminders', description: 'List the authenticated user\'s reminders.', category: ai_tool_types_1.AIToolCategory.REMINDER,
            sideEffect: 'READ', validate: tool_input_dto_1.RemindersToolInput, inputSchema: schema({ priority: { type: 'string' }, date: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer' } }),
            execute: (context, input) => this.remindersService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input }),
        }));
        this.register(this.base({
            name: 'get_meetings', description: 'List the authenticated user\'s meetings.', category: ai_tool_types_1.AIToolCategory.MEETING,
            sideEffect: 'READ', validate: tool_input_dto_1.MeetingsToolInput, inputSchema: schema({ date: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, status: { type: 'string' }, limit: { type: 'integer' } }),
            execute: (context, input) => this.meetingsService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input }),
        }));
        this.register(this.base({
            name: 'get_notes', description: 'List the authenticated user\'s notes.', category: ai_tool_types_1.AIToolCategory.NOTE,
            sideEffect: 'READ', validate: tool_input_dto_1.NotesToolInput, inputSchema: schema({ search: { type: 'string' }, limit: { type: 'integer' } }),
            execute: (context, input) => this.notesService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input }),
        }));
        this.register(this.base({
            name: 'get_google_calendar_events', description: 'Read events from the authenticated user Google Calendar.', category: ai_tool_types_1.AIToolCategory.GOOGLE,
            sideEffect: 'READ', validate: tool_input_dto_1.GetGoogleCalendarEventsToolInput, inputSchema: schema({ from: { type: 'string' }, to: { type: 'string' }, calendarId: { type: 'string' } }, ['from', 'to']),
            execute: (context, input) => this.googleCalendarService.list(context.userId, input),
        }));
        this.register(this.base({
            name: 'search_google_drive_files', description: 'Search metadata for files in the authenticated user Google Drive.', category: ai_tool_types_1.AIToolCategory.GOOGLE,
            sideEffect: 'READ', validate: tool_input_dto_1.SearchGoogleDriveFilesToolInput, inputSchema: schema({ query: { type: 'string' }, mimeType: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
            execute: (context, input) => this.googleDriveService.list(context.userId, { q: input.query, mimeType: input.mimeType, limit: input.limit }),
        }));
        this.register(this.base({
            name: 'search_files', description: 'Search metadata for files owned by the authenticated user.', category: ai_tool_types_1.AIToolCategory.FILE,
            sideEffect: 'READ', validate: tool_input_dto_1.SearchFilesToolInput, inputSchema: schema({ query: { type: 'string' }, mimeType: { type: 'string' }, folderId: { type: 'string' }, source: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
            execute: (context, input) => this.filesService.searchForUser(context.userId, input.query, input),
        }));
        this.register(this.base({
            name: 'get_file_metadata', description: 'Get metadata for one file owned by the authenticated user.', category: ai_tool_types_1.AIToolCategory.FILE,
            sideEffect: 'READ', validate: tool_input_dto_1.GetFileMetadataToolInput, inputSchema: schema({ fileId: { type: 'string' } }, ['fileId']),
            execute: (context, input) => this.filesService.getForUser(context.userId, input.fileId),
        }));
        this.register(this.base({
            name: 'search_contacts', description: 'Search contacts owned by the authenticated user.', category: ai_tool_types_1.AIToolCategory.CONTACT,
            sideEffect: 'READ', validate: tool_input_dto_1.SearchContactsToolInput, inputSchema: schema({ query: { type: 'string' } }, ['query']),
            execute: async (context, input) => {
                const result = await this.contactsService.listForUser(context.userId, { search: input.query, page: 1, limit: input.limit ?? 20 });
                return result.items.map(({ id, displayName, phone, email, telegramUsername }) => ({ id, displayName, phone, email, telegramUsername }));
            },
        }));
        this.register(this.base({
            name: 'get_contact_history', description: 'Get recent history for an owned contact.', category: ai_tool_types_1.AIToolCategory.CONTACT,
            sideEffect: 'READ', validate: tool_input_dto_1.ContactHistoryToolInput, inputSchema: schema({ contactId: { type: 'string' } }, ['contactId']),
            authorize: (context, input) => this.assertContactOwned(context.userId, input.contactId),
            execute: (context, input) => this.contactHistoryService.getContactHistory(context.userId, input.contactId),
        }));
        this.register(this.base({
            name: 'get_relevant_memories', description: 'Retrieve relevant user-scoped memories.', category: ai_tool_types_1.AIToolCategory.MEMORY,
            sideEffect: 'READ', validate: tool_input_dto_1.RelevantMemoriesToolInput, inputSchema: schema({ query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
            execute: (context, input) => this.memoryService.getRelevantMemories(context.userId, input.query, { type: input.type, limit: input.limit ?? 20 }),
        }));
        this.register(this.base({
            name: 'get_finance_summary', description: 'Get a Decimal-safe finance summary for a period.', category: ai_tool_types_1.AIToolCategory.FINANCE,
            sideEffect: 'READ', validate: tool_input_dto_1.FinanceSummaryToolInput, inputSchema: schema({ from: { type: 'string' }, to: { type: 'string' }, currency: { type: 'string' } }, ['from', 'to', 'currency']),
            execute: (context, input) => { const period = assertPeriod(input.from, input.to); return this.financeToolsService.getPeriodSummary(context.userId, period.from, period.to, input.currency); },
        }));
        this.register(this.base({
            name: 'get_today_finance', description: 'Get today\'s finance summary for the authenticated user.', category: ai_tool_types_1.AIToolCategory.FINANCE,
            sideEffect: 'READ', validate: tool_input_dto_1.TodayFinanceToolInput, inputSchema: schema({ currency: { type: 'string' } }),
            execute: (context, input) => this.financeToolsService.getTodayFinance(context.userId, input.currency),
        }));
        this.register(this.base({
            name: 'compare_finance_periods', description: 'Compare two finance periods using Decimal-safe totals.', category: ai_tool_types_1.AIToolCategory.FINANCE,
            sideEffect: 'READ', validate: tool_input_dto_1.CompareFinancePeriodsToolInput, inputSchema: schema({ currentFrom: { type: 'string' }, currentTo: { type: 'string' }, previousFrom: { type: 'string' }, previousTo: { type: 'string' }, currency: { type: 'string' } }, ['currentFrom', 'currentTo', 'previousFrom', 'previousTo', 'currency']),
            execute: (context, input) => {
                const current = assertPeriod(input.currentFrom, input.currentTo);
                const previous = assertPeriod(input.previousFrom, input.previousTo);
                return this.financeToolsService.compareFinancePeriods(context.userId, current.from, current.to, previous.from, previous.to, input.currency);
            },
        }));
        this.register(this.base({
            name: 'create_task', description: 'Create a task for the authenticated user.', category: ai_tool_types_1.AIToolCategory.TASK,
            sideEffect: 'WRITE', validate: tool_input_dto_1.CreateTaskToolInput, inputSchema: schema({ title: { type: 'string' }, description: { type: 'string' }, dueAt: { type: 'string' }, priority: { type: 'string' } }, ['title']),
            preview: (_context, input) => ({ title: input.title, dueDate: input.dueAt ?? null, priority: input.priority ?? 'MEDIUM' }),
            execute: (context, input) => this.tasksService.createForUser(context.userId, { title: input.title, description: input.description, dueDate: input.dueAt, priority: input.priority }),
        }));
        this.register(this.base({
            name: 'create_reminder', description: 'Create a reminder for the authenticated user.', category: ai_tool_types_1.AIToolCategory.REMINDER,
            sideEffect: 'WRITE', validate: tool_input_dto_1.CreateReminderToolInput, inputSchema: schema({ title: { type: 'string' }, remindAt: { type: 'string' }, note: { type: 'string' } }, ['title', 'remindAt']),
            preview: (_context, input) => ({ title: input.title, remindAt: input.remindAt }),
            execute: (context, input) => this.remindersService.createForUser(context.userId, { title: input.title, remindAt: input.remindAt, description: input.note }),
        }));
        this.register(this.base({
            name: 'create_meeting', description: 'Create a meeting for the authenticated user.', category: ai_tool_types_1.AIToolCategory.MEETING,
            sideEffect: 'WRITE', validate: tool_input_dto_1.CreateMeetingToolInput, inputSchema: schema({ title: { type: 'string' }, startAt: { type: 'string' }, endAt: { type: 'string' }, contactId: { type: 'string' }, location: { type: 'string' }, notes: { type: 'string' } }, ['title', 'startAt']),
            authorize: async (context, input) => { if (input.contactId)
                await this.assertContactOwned(context.userId, input.contactId); },
            preview: (_context, input) => ({ title: input.title, startAt: input.startAt, endAt: input.endAt ?? new Date(asDate(input.startAt).getTime() + 3600000).toISOString(), contactId: input.contactId ?? null, location: input.location ?? null, notes: input.notes ?? null }),
            execute: (context, input) => this.meetingsService.createForUser(context.userId, { title: input.title, startsAt: input.startAt, endsAt: input.endAt ?? new Date(asDate(input.startAt).getTime() + 3600000).toISOString(), contactId: input.contactId, location: input.location, description: input.notes }),
        }));
        this.register(this.base({
            name: 'create_note', description: 'Create a note for the authenticated user.', category: ai_tool_types_1.AIToolCategory.NOTE,
            sideEffect: 'WRITE', validate: tool_input_dto_1.CreateNoteToolInput, inputSchema: schema({ title: { type: 'string' }, content: { type: 'string' }, contactId: { type: 'string' } }, ['content']),
            authorize: async (context, input) => { if (input.contactId)
                await this.assertContactOwned(context.userId, input.contactId); },
            preview: (_context, input) => ({ title: input.title ?? 'AI note', content: input.content, contactId: input.contactId ?? null }),
            execute: (context, input) => this.notesService.createForUser(context.userId, { title: input.title ?? 'AI note', content: input.content, contactId: input.contactId }),
        }));
        this.register(this.base({
            name: 'create_contact', description: 'Create a contact for the authenticated user.', category: ai_tool_types_1.AIToolCategory.CONTACT,
            sideEffect: 'WRITE', validate: tool_input_dto_1.CreateContactToolInput, inputSchema: schema({ firstName: { type: 'string' }, lastName: { type: 'string' }, displayName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, telegramUsername: { type: 'string' }, company: { type: 'string' }, position: { type: 'string' }, notes: { type: 'string' }, tags: { type: 'array' } }, ['firstName']),
            preview: (_context, input) => ({ firstName: input.firstName, lastName: input.lastName ?? null, displayName: input.displayName ?? null, phone: input.phone ?? null, email: input.email ?? null, telegramUsername: input.telegramUsername ?? null }),
            execute: (context, input) => this.contactsService.createForUser(context.userId, input),
        }));
        this.register(this.base({
            name: 'save_memory', description: 'Save a user-scoped memory after confirmation.', category: ai_tool_types_1.AIToolCategory.MEMORY,
            sideEffect: 'WRITE', validate: tool_input_dto_1.SaveMemoryToolInput, inputSchema: schema({ type: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' }, importance: { type: 'integer' }, contactId: { type: 'string' } }, ['type', 'key', 'value']),
            authorize: async (context, input) => { if (input.contactId)
                await this.assertContactOwned(context.userId, input.contactId); },
            preview: (_context, input) => ({ type: input.type, key: input.key, value: input.value, importance: input.importance ?? 5, contactId: input.contactId ?? null }),
            execute: (context, input) => this.memoryService.createForUser(context.userId, { ...input, source: 'AI_TOOL' }),
        }));
        this.register(this.base({
            name: 'create_finance_transaction', description: 'Create a finance transaction for the authenticated user.', category: ai_tool_types_1.AIToolCategory.FINANCE,
            sideEffect: 'WRITE', validate: tool_input_dto_1.CreateFinanceTransactionToolInput, inputSchema: schema({ type: { type: 'string' }, amount: { type: 'string' }, currency: { type: 'string' }, title: { type: 'string' }, categoryId: { type: 'string' }, contactId: { type: 'string' }, transactionDate: { type: 'string' }, description: { type: 'string' } }, ['type', 'amount', 'currency', 'title']),
            authorize: async (context, input) => {
                if (input.contactId)
                    await this.assertContactOwned(context.userId, input.contactId);
                if (input.categoryId) {
                    const categories = await this.financeService.listCategoriesForUser(context.userId, {});
                    const category = categories.find((item) => item.id === input.categoryId);
                    if (!category || (category.type !== 'BOTH' && category.type !== input.type))
                        throw new common_1.NotFoundException('Finance category was not found');
                }
            },
            preview: async (context, input) => {
                const category = input.categoryId ? (await this.financeService.listCategoriesForUser(context.userId, {})).find((item) => item.id === input.categoryId) : null;
                const contact = input.contactId ? await this.contactsService.getForUser(context.userId, input.contactId) : null;
                return { type: input.type, amount: input.amount, currency: input.currency, title: input.title, category: category ? { id: category.id, name: category.name } : null, contact: contact ? { id: contact.id, displayName: contact.displayName } : null };
            },
            execute: (context, input) => this.financeToolsService.createFinanceTransactionForUser(context.userId, { ...input, transactionDate: input.transactionDate ?? new Date().toISOString() }),
        }));
        this.register(this.base({
            name: 'search_telegram_chats', description: 'Search chats available through the authenticated user Telegram account.', category: ai_tool_types_1.AIToolCategory.CONTACT,
            sideEffect: 'READ', validate: tool_input_dto_1.SearchTelegramChatsToolInput, inputSchema: schema({ query: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
            execute: (context, input) => this.telegramIntegrationService.search(context.userId, { q: input.query, limit: input.limit ?? 10 }),
        }));
        this.register(this.base({
            name: 'send_telegram_message', description: 'Send a Telegram message after explicit user confirmation.', category: ai_tool_types_1.AIToolCategory.SYSTEM,
            sideEffect: 'WRITE', validate: tool_input_dto_1.SendTelegramMessageToolInput, inputSchema: schema({ peerId: { type: 'string' }, text: { type: 'string' } }, ['peerId', 'text']),
            authorize: async (context, input) => { await this.telegramIntegrationService.prepareTelegramMessage(context.userId, input.peerId, input.text); },
            preview: (context, input) => this.telegramIntegrationService.prepareTelegramMessage(context.userId, input.peerId, input.text),
            execute: (context, input) => this.telegramIntegrationService.sendMessage(context.userId, input.peerId, input.text),
        }));
        this.register(this.base({
            name: 'create_google_calendar_event', description: 'Create a Google Calendar event after explicit confirmation.', category: ai_tool_types_1.AIToolCategory.GOOGLE,
            sideEffect: 'WRITE', validate: tool_input_dto_1.CreateGoogleCalendarEventToolInput, inputSchema: schema({ title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' }, attendees: { type: 'array' }, location: { type: 'string' }, calendarId: { type: 'string' } }, ['title', 'start', 'end']),
            preview: (_context, input) => ({ title: input.title, start: input.start, end: input.end, location: input.location ?? null }),
            execute: (context, input) => this.googleCalendarService.create(context.userId, input),
        }));
        this.register(this.base({
            name: 'update_google_calendar_event', description: 'Update a Google Calendar event after explicit confirmation.', category: ai_tool_types_1.AIToolCategory.GOOGLE,
            sideEffect: 'WRITE', validate: tool_input_dto_1.UpdateGoogleCalendarEventToolInput, inputSchema: schema({ eventId: { type: 'string' }, title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' }, attendees: { type: 'array' }, location: { type: 'string' }, calendarId: { type: 'string' } }, ['eventId']),
            preview: (_context, input) => ({ eventId: input.eventId, title: input.title, start: input.start, end: input.end }),
            execute: (context, input) => this.googleCalendarService.update(context.userId, input.eventId, input),
        }));
        this.register(this.base({
            name: 'delete_google_calendar_event', description: 'Delete a Google Calendar event after explicit confirmation.', category: ai_tool_types_1.AIToolCategory.GOOGLE,
            sideEffect: 'WRITE', validate: tool_input_dto_1.DeleteGoogleCalendarEventToolInput, inputSchema: schema({ eventId: { type: 'string' }, calendarId: { type: 'string' } }, ['eventId']),
            preview: (_context, input) => ({ eventId: input.eventId, calendarId: input.calendarId ?? 'primary' }),
            execute: (context, input) => this.googleCalendarService.delete(context.userId, input.eventId, input.calendarId),
        }));
    }
    async assertContactOwned(userId, contactId) {
        await this.contactsService.getForUser(userId, contactId);
    }
    async recordWriteExecution(toolName, userId, result) {
        const entityId = toolName.startsWith('create_google_') || toolName.startsWith('update_google_') || toolName.startsWith('delete_google_')
            ? undefined
            : typeof result === 'object' && result !== null && 'id' in result && typeof result.id === 'string' ? result.id : undefined;
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.AI_TOOL_EXECUTED,
            entityType: this.entityTypeFor(toolName),
            entityId,
            metadata: { toolName, source: 'AI_TOOL' },
        });
    }
    entityTypeFor(toolName) {
        const types = {
            create_task: 'TASK', create_reminder: 'REMINDER', create_meeting: 'MEETING', create_note: 'NOTE',
            create_contact: 'CONTACT', save_memory: 'MEMORY', create_finance_transaction: 'FINANCE_TRANSACTION',
            send_telegram_message: 'TELEGRAM_MESSAGE',
            create_google_calendar_event: 'GOOGLE_CALENDAR_EVENT', update_google_calendar_event: 'GOOGLE_CALENDAR_EVENT', delete_google_calendar_event: 'GOOGLE_CALENDAR_EVENT',
        };
        return types[toolName] ?? 'AI_TOOL';
    }
};
exports.AIToolRegistryService = AIToolRegistryService;
exports.AIToolRegistryService = AIToolRegistryService = __decorate([
    (0, common_1.Injectable)(),
    __param(12, (0, common_1.Optional)()),
    __param(13, (0, common_1.Optional)()),
    __param(14, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        reminders_service_1.RemindersService,
        meetings_service_1.MeetingsService,
        notes_service_1.NotesService,
        contacts_service_1.ContactsService,
        contact_history_service_1.ContactHistoryService,
        memory_service_1.MemoryService,
        finance_service_1.FinanceService,
        finance_tools_service_1.FinanceToolsService,
        today_service_1.TodayService,
        telegram_integration_service_1.TelegramIntegrationService,
        activity_log_service_1.ActivityLogService,
        google_calendar_service_1.GoogleCalendarService,
        google_drive_service_1.GoogleDriveService,
        files_service_1.FilesService])
], AIToolRegistryService);
//# sourceMappingURL=ai-tool-registry.service.js.map