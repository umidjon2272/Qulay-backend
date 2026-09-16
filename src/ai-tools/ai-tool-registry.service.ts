import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { FinanceCurrency, FinanceTransactionType, MemoryType, TaskStatus, TaskPriority, MeetingStatus } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { ContactHistoryService } from '../contacts/contact-history.service';
import { ContactsService } from '../contacts/contacts.service';
import { CreateContactDto } from '../contacts/dto/create-contact.dto';
import { UpdateContactDto } from '../contacts/dto/update-contact.dto';
import { ContactQueryDto } from '../contacts/dto/contact-query.dto';
import { FinanceService } from '../finance/finance.service';
import { FinanceToolsService } from '../finance/finance-tools.service';
import { CreateFinanceTransactionDto } from '../finance/dto/create-finance-transaction.dto';
import { FinanceTransactionQueryDto } from '../finance/dto/transaction-query.dto';
import { EntityToolInput, UpdateTaskToolInput, UpdateReminderToolInput, UpdateMeetingToolInput, UpdateNoteToolInput, UpdateTransactionToolInput } from './dto/workspace-tool-input.dto';
import { CreateMemoryDto } from '../memory/dto/create-memory.dto';
import { UpdateMemoryDto } from '../memory/dto/update-memory.dto';
import { MemoryService } from '../memory/memory.service';
import { CreateMeetingDto } from '../meetings/dto/create-meeting.dto';
import { MeetingQueryDto } from '../meetings/dto/meeting-query.dto';
import { MeetingsService } from '../meetings/meetings.service';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { NoteQueryDto } from '../notes/dto/note-query.dto';
import { NotesService } from '../notes/notes.service';
import { CreateReminderDto } from '../reminders/dto/create-reminder.dto';
import { ReminderQueryDto } from '../reminders/dto/reminder-query.dto';
import { RemindersService } from '../reminders/reminders.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { TaskQueryDto } from '../tasks/dto/task-query.dto';
import { TasksService } from '../tasks/tasks.service';
import { TodayService } from '../today/today.service';
import { BriefingService } from '../briefing/briefing.service';
import { FileQueryDto } from '../files/dto/file-query.dto';
import { BitoIntegrationService } from '../bito/bito-integration.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

import {
  CompareFinancePeriodsToolInput, ContactHistoryToolInput, CreateContactToolInput,
  CreateFinanceTransactionToolInput, CreateMeetingToolInput, CreateNoteToolInput,
  CreateReminderToolInput, CreateTaskToolInput, EmptyToolInput, FinanceSummaryToolInput,
  MeetingsToolInput, NotesToolInput, RelevantMemoriesToolInput, RemindersToolInput,
 SaveMemoryToolInput, SearchContactsToolInput, TasksToolInput, TodayFinanceToolInput,
TodayPlanInput, SearchTelegramChatsToolInput, SendTelegramMessageToolInput,
ListFilesToolInput, SearchFilesToolInput, GetFileMetadataToolInput, GetFileContentToolInput,
  UpdateContactToolInput, DeleteContactToolInput, UpdateMemoryToolInput, DeleteMemoryToolInput,
  GetGoogleCalendarEventsToolInput, CreateGoogleCalendarEventToolInput,
  UpdateGoogleCalendarEventToolInput, DeleteGoogleCalendarEventToolInput, SearchGoogleDriveFilesToolInput,
  BudgetStatusToolInput, CashflowForecastToolInput, DailyBriefingToolInput,
  SaveSalesPlaybookRuleToolInput, ListSalesPlaybookRulesToolInput, DeleteSalesPlaybookRuleToolInput,
  SaveSalesProductKnowledgeToolInput, ListSalesProductKnowledgeToolInput, DeleteSalesProductKnowledgeToolInput,
  ListInstagramPostsToolInput, SaveInstagramCommentAutomationToolInput,
  ListInstagramCommentAutomationsToolInput, DeleteInstagramCommentAutomationToolInput,
  UpdateInstagramSalesSettingsToolInput, UpdateInstagramCommentAutomationToolInput,
} from './dto/tool-input.dto';
import { TelegramIntegrationService } from '../telegram/telegram-integration.service';
import { GoogleCalendarService } from '../google/google-calendar.service';
import { GoogleDriveService } from '../google/google-drive.service';
import { InstagramIntegrationService } from '../instagram/instagram-integration.service';
import { FilesService } from '../files/files.service';
import { CalendarEventsQueryDto, CreateCalendarEventDto, UpdateCalendarEventDto, DriveFilesQueryDto } from '../google/dto/google.dto';
import {
  AIToolCategory, AIToolDefinition, AIToolExecutionContext, AIToolInputSchema,
  AIToolMetadata, AIToolSideEffect, assertToolObject,
} from './types/ai-tool.types';

type Class<T> = new () => T;

function schema(
  properties: Record<string, { type: string; description?: string; enum?: readonly string[] }>,
  required: readonly string[] = [],
): AIToolInputSchema {
  return { type: 'object', properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, value.type === 'array' ? { ...value, items: { type: 'string' } } : value])), required };
}

async function validateInput<T>(input: unknown, dtoClass: Class<T>): Promise<T> {
  assertToolObject(input);
  if (dtoClass === EmptyToolInput && Object.keys(input).length === 0) return new dtoClass();
  const instance = plainToInstance(dtoClass, input);
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException({ message: 'Invalid tool input', errors: flattenValidationErrors(errors) });
  }
  return instance;
}

function flattenValidationErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => Object.values(error.constraints ?? {}).map((message) => `${error.property}: ${message}`));
}

function asDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date value');
  return date;
}

function assertPeriod(from: string, to: string): { from: Date; to: Date } {
  const parsedFrom = asDate(from);
  const parsedTo = asDate(to);
  if (parsedFrom >= parsedTo) throw new BadRequestException('from must be before to');
  return { from: parsedFrom, to: parsedTo };
}

@Injectable()
export class AIToolRegistryService {
  private readonly tools = new Map<string, AIToolDefinition<unknown, unknown>>();

  constructor(
    private readonly tasksService: TasksService,
    private readonly remindersService: RemindersService,
    private readonly meetingsService: MeetingsService,
    private readonly notesService: NotesService,
    private readonly contactsService: ContactsService,
    private readonly contactHistoryService: ContactHistoryService,
    private readonly memoryService: MemoryService,
    private readonly financeService: FinanceService,
    private readonly financeToolsService: FinanceToolsService,
    private readonly todayService: TodayService,
    private readonly telegramIntegrationService: TelegramIntegrationService,
    private readonly briefingService: BriefingService,
    private readonly activityLog: ActivityLogService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly googleCalendarService?: GoogleCalendarService,
    @Optional() private readonly googleDriveService?: GoogleDriveService,
    @Optional() private readonly filesService?: FilesService,
    @Optional() private readonly bitoIntegrationService?: BitoIntegrationService,
    @Optional() private readonly instagramIntegrationService?: InstagramIntegrationService,
  ) {
    this.registerTools();
    this.registerWorkspaceTools();
  }

  listMetadata(): Array<Pick<AIToolMetadata, 'name' | 'category' | 'requiresConfirmation' | 'sideEffect'>> {
    return [...this.tools.values()].map(({ name, category, requiresConfirmation, sideEffect }) => ({
      name, category, requiresConfirmation, sideEffect,
    }));
  }

  getToolDefinitionsForModel(): AIToolMetadata[] {
    return [...this.tools.values()].map(({ name, description, category, inputSchema, requiresConfirmation, sideEffect, permission }) => ({
      name, description, category, inputSchema, requiresConfirmation, sideEffect, permission,
    }));
  }

  get(name: string): AIToolDefinition<unknown, unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new NotFoundException(`Unknown AI tool: ${name}`);
    return tool;
  }

  private register<TInput, TResult>(tool: AIToolDefinition<TInput, TResult>): void {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate AI tool registration: ${tool.name}`);
    this.tools.set(tool.name, tool as AIToolDefinition<unknown, unknown>);
  }

  private registerWorkspaceTools() {
    // All entity reads and writes use the same ownership-checked services as the UI.
    const entities = [
      { name: 'task', category: AIToolCategory.TASK, get: (u: string, id: string) => this.tasksService.getForUser(u, id), remove: (u: string, id: string) => this.tasksService.deleteForUser(u, id) },
      { name: 'reminder', category: AIToolCategory.REMINDER, get: (u: string, id: string) => this.remindersService.getForUser(u, id), remove: (u: string, id: string) => this.remindersService.deleteForUser(u, id) },
      { name: 'meeting', category: AIToolCategory.MEETING, get: (u: string, id: string) => this.meetingsService.getForUser(u, id), remove: (u: string, id: string) => this.meetingsService.deleteForUser(u, id) },
      { name: 'note', category: AIToolCategory.NOTE, get: (u: string, id: string) => this.notesService.getForUser(u, id), remove: (u: string, id: string) => this.notesService.deleteForUser(u, id) },
      { name: 'finance_transaction', category: AIToolCategory.FINANCE, get: (u: string, id: string) => this.financeService.getForUser(u, id), remove: (u: string, id: string) => this.financeService.deleteForUser(u, id) },
    ];
    for (const entity of entities) {
      this.register(this.base<EntityToolInput, unknown>({ name: `get_${entity.name}`, description: `Read one owned ${entity.name} by its real ID. Search first; never invent IDs.`, category: entity.category, sideEffect: 'READ', validate: EntityToolInput, inputSchema: schema({ id: { type: 'string' } }, ['id']), execute: (ctx, input) => entity.get(ctx.userId, input.id) }));
      this.register(this.base({
        name: `delete_${entity.name}`, description: `Delete one owned ${entity.name} after confirmation. Search/read first to identify the exact record.`, category: entity.category, sideEffect: 'WRITE', validate: EntityToolInput, inputSchema: schema({ id: { type: 'string' } }, ['id']),
        authorize: async (ctx, input) => { await entity.get(ctx.userId, input.id); },
        preview: async (ctx, input) => { const current = await entity.get(ctx.userId, input.id); return { id: input.id, title: current.title, operation: 'delete', warning: ctx.locale === 'ru' ? 'Удаление нельзя отменить в этом чате.' : 'O‘chirilgan yozuvni bu chat orqali tiklab bo‘lmaydi.' }; },
        execute: (ctx, input) => entity.remove(ctx.userId, input.id),
      }));
    }
    const update = <T extends EntityToolInput>(name: string, category: AIToolCategory, dto: Class<T>, properties: AIToolInputSchema['properties'], get: (u: string, id: string) => Promise<{ title: string }>, run: (u: string, id: string, patch: Omit<T, 'id'>) => Promise<unknown>) => {
      this.register(this.base({
        name, description: `Update an owned record after confirmation. Get its real id using the corresponding list/read tool; include ONLY fields the user asked to change.`, category, sideEffect: 'WRITE', validate: dto,
        inputSchema: schema({ id: { type: 'string' }, ...properties }, ['id']),
        authorize: async (ctx, { id, ...patch }) => { if (!Object.values(patch).some(value => value !== undefined)) throw new BadRequestException('No changes provided'); await get(ctx.userId, id); },
        preview: async (ctx, { id, ...patch }) => ({ id, title: (await get(ctx.userId, id)).title, changes: patch }),
        execute: (ctx, { id, ...patch }) => run(ctx.userId, id, patch),
      }));
    };
    update('update_task', AIToolCategory.TASK, UpdateTaskToolInput, { title: { type: 'string' }, description: { type: 'string' }, dueDate: { type: 'string', description: 'ISO datetime with timezone' }, priority: { type: 'string', enum: Object.values(TaskPriority) }, status: { type: 'string', enum: Object.values(TaskStatus) } }, (u, id) => this.tasksService.getForUser(u, id), (u, id, p) => this.tasksService.updateForUser(u, id, p));
    update('update_reminder', AIToolCategory.REMINDER, UpdateReminderToolInput, { title: { type: 'string' }, description: { type: 'string' }, remindAt: { type: 'string', description: 'ISO datetime with timezone' }, priority: { type: 'string', enum: Object.values(TaskPriority) } }, (u, id) => this.remindersService.getForUser(u, id), (u, id, p) => this.remindersService.updateForUser(u, id, p));
    update('update_meeting', AIToolCategory.MEETING, UpdateMeetingToolInput, { title: { type: 'string' }, description: { type: 'string' }, startsAt: { type: 'string' }, endsAt: { type: 'string' }, participant: { type: 'string' }, contactId: { type: 'string' }, location: { type: 'string' }, status: { type: 'string', enum: Object.values(MeetingStatus) } }, (u, id) => this.meetingsService.getForUser(u, id), (u, id, p) => this.meetingsService.updateForUser(u, id, p));
    update('update_note', AIToolCategory.NOTE, UpdateNoteToolInput, { title: { type: 'string' }, content: { type: 'string' }, contactId: { type: 'string' } }, (u, id) => this.notesService.getForUser(u, id), (u, id, p) => this.notesService.updateForUser(u, id, p));
    update('update_finance_transaction', AIToolCategory.FINANCE, UpdateTransactionToolInput, { title: { type: 'string' }, amount: { type: 'string' }, type: { type: 'string', enum: Object.values(FinanceTransactionType) }, currency: { type: 'string', enum: Object.values(FinanceCurrency) }, transactionDate: { type: 'string' }, categoryId: { type: 'string' }, accountId: { type: 'string' }, contactId: { type: 'string' }, description: { type: 'string' } }, (u, id) => this.financeService.getForUser(u, id), (u, id, p) => this.financeService.updateForUser(u, id, p));
    for (const action of [
      { name: 'complete_task', category: AIToolCategory.TASK, get: (u: string, id: string) => this.tasksService.getForUser(u, id), run: (u: string, id: string) => this.tasksService.completeForUser(u, id) },
      { name: 'reopen_task', category: AIToolCategory.TASK, get: (u: string, id: string) => this.tasksService.getForUser(u, id), run: (u: string, id: string) => this.tasksService.reopenForUser(u, id) },
      { name: 'complete_reminder', category: AIToolCategory.REMINDER, get: (u: string, id: string) => this.remindersService.getForUser(u, id), run: (u: string, id: string) => this.remindersService.completeForUser(u, id) },
      { name: 'cancel_meeting', category: AIToolCategory.MEETING, get: (u: string, id: string) => this.meetingsService.getForUser(u, id), run: (u: string, id: string) => this.meetingsService.cancelForUser(u, id) },
    ]) this.register(this.base<EntityToolInput, unknown>({ name: action.name, description: `${action.name} for one owned record after confirmation. Search first for its exact ID.`, category: action.category, sideEffect: 'WRITE', validate: EntityToolInput, inputSchema: schema({ id: { type: 'string' } }, ['id']), authorize: async (ctx, input) => { await action.get(ctx.userId, input.id); }, preview: async (ctx, input) => ({ id: input.id, title: (await action.get(ctx.userId, input.id)).title, operation: action.name }), execute: (ctx, input) => action.run(ctx.userId, input.id) }));
    this.register(this.base({ name: 'get_finance_transactions', description: 'Search saved finance transactions, including old records. With no from/to returns all dates, paginated. Use summaries (not this page) to compute totals.', category: AIToolCategory.FINANCE, sideEffect: 'READ', validate: FinanceTransactionQueryDto, inputSchema: schema({ search: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, type: { type: 'string', enum: Object.values(FinanceTransactionType) }, currency: { type: 'string', enum: Object.values(FinanceCurrency) }, page: { type: 'integer' }, limit: { type: 'integer' } }), execute: (ctx, input) => this.financeService.listTransactionsForUser(ctx.userId, input) }));
    this.register(this.base({ name: 'get_finance_categories', description: 'List owned finance categories and their IDs before linking a transaction.', category: AIToolCategory.FINANCE, sideEffect: 'READ', validate: EmptyToolInput, inputSchema: schema({}), execute: ctx => this.financeService.listCategoriesForUser(ctx.userId, {}) }));
    this.register(this.base({ name: 'get_finance_accounts', description: 'List owned finance accounts and currencies before linking a transaction.', category: AIToolCategory.FINANCE, sideEffect: 'READ', validate: EmptyToolInput, inputSchema: schema({}), execute: ctx => this.financeService.listAccountsForUser(ctx.userId) }));
  }

  private base<TInput, TResult>(config: {
    name: string;
    description: string;
    category: AIToolCategory;
    inputSchema: AIToolInputSchema;
    sideEffect: AIToolSideEffect;
    validate: Class<TInput>;
    authorize?: (context: AIToolExecutionContext, input: TInput) => Promise<void>;
    preview?: (context: AIToolExecutionContext, input: TInput) => Promise<unknown> | unknown;
    execute: (context: AIToolExecutionContext, input: TInput) => Promise<TResult> | TResult;
  }): AIToolDefinition<TInput, TResult> {
    return {
      name: config.name,
      description: config.description,
      category: config.category,
      inputSchema: ['get_tasks', 'get_reminders', 'get_meetings', 'get_notes'].includes(config.name)
        ? { ...config.inputSchema, properties: { ...config.inputSchema.properties, page: { type: 'integer', description: 'Page number, starting at 1. Fetch further pages when meta.total exceeds returned items.' } } }
        : config.inputSchema,
      requiresConfirmation: config.sideEffect === 'WRITE' && !['save_memory', 'update_memory', 'save_sales_playbook_rule', 'save_sales_product_knowledge', 'update_instagram_sales_settings'].includes(config.name),
      sideEffect: config.sideEffect,
      permission: 'USER_SCOPED',
      validate: (input) => validateInput(input, config.validate),
      authorize: config.authorize,
      preview: config.preview,
      execute: config.execute,
    };
  }

  private registerTools(): void {
    if (this.bitoIntegrationService) {
      this.register(this.base<EmptyToolInput, unknown>({
        name: 'bito_connection_status',
        description: 'Check whether the authenticated user has a usable Bito ERP MCP connection. Use this when Bito/business data is requested but no Bito data tool is available.',
        category: AIToolCategory.BITO,
        sideEffect: 'READ', validate: EmptyToolInput, inputSchema: schema({}),
        execute: (context) => this.bitoIntegrationService!.status(context.userId),
      }));
    }
    this.register(this.base<EmptyToolInput, unknown>({
      name: 'telegram_connection_status',
      description: 'Check the authenticated user Telegram connection status directly. Use this for questions such as Telegram ulanganmi/status.',
      category: AIToolCategory.SYSTEM,
      sideEffect: 'READ', validate: EmptyToolInput, inputSchema: schema({}),
      execute: (context) => this.telegramIntegrationService.status(context.userId),
    }));
    this.register(this.base<EmptyToolInput, unknown>({
      name: 'get_subscription_status',
      description: 'Get the authenticated user current Qulay AI tariff, active period, remaining AI credits and current limits. Use this when the user asks about tariff, obuna, kredit or expiry.',
      category: AIToolCategory.SYSTEM,
      sideEffect: 'READ', validate: EmptyToolInput, inputSchema: schema({}),
      execute: (context) => this.subscriptionsService.getForUser(context.userId),
    }));
    this.register(this.base<TodayPlanInput, unknown>({
      name: 'get_today_plan', description: 'Get the user-scoped plan for today.', category: AIToolCategory.TODAY,
      sideEffect: 'READ', validate: TodayPlanInput, inputSchema: schema({ date: { type: 'string', description: 'Optional YYYY-MM-DD date' } }),
      execute: async (context, input) => {
        const [today, notes] = await Promise.all([
          this.todayService.getForUser(context.userId, input.date),
          this.notesService.listForUser(context.userId, { page: 1, limit: 5 } as NoteQueryDto),
        ]);
        return {
          date: today.date, timezone: today.timezone, tasks: today.tasks, reminders: today.reminders,
          meetings: today.meetings, overdueTasks: today.overdueTasks, nextMeeting: today.nextMeeting,
          notes: { count: notes.meta.total, recent: notes.items.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })) },
        };
      },
    }));

    this.register(this.base<TasksToolInput, unknown>({
      name: 'get_tasks', description: 'List the authenticated user\'s tasks.', category: AIToolCategory.TASK,
      sideEffect: 'READ', validate: TasksToolInput, inputSchema: schema({ status: { type: 'string', enum: Object.values(TaskStatus) }, priority: { type: 'string', enum: Object.values(TaskPriority) }, date: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer' } }),
      execute: (context, input) => this.tasksService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input } as TaskQueryDto),
    }));

    this.register(this.base<RemindersToolInput, unknown>({
      name: 'get_reminders', description: 'List the authenticated user\'s reminders.', category: AIToolCategory.REMINDER,
      sideEffect: 'READ', validate: RemindersToolInput, inputSchema: schema({ priority: { type: 'string', enum: Object.values(TaskPriority) }, date: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer' } }),
      execute: (context, input) => this.remindersService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input } as ReminderQueryDto),
    }));

    this.register(this.base<MeetingsToolInput, unknown>({
      name: 'get_meetings', description: 'List the authenticated user\'s meetings.', category: AIToolCategory.MEETING,
      sideEffect: 'READ', validate: MeetingsToolInput, inputSchema: schema({ date: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, status: { type: 'string' }, limit: { type: 'integer' } }),
      execute: (context, input) => this.meetingsService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input } as MeetingQueryDto),
    }));

    this.register(this.base<NotesToolInput, unknown>({
      name: 'get_notes', description: 'List the authenticated user\'s notes.', category: AIToolCategory.NOTE,
      sideEffect: 'READ', validate: NotesToolInput, inputSchema: schema({ search: { type: 'string' }, limit: { type: 'integer' } }),
      execute: (context, input) => this.notesService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input } as NoteQueryDto),
    }));

    this.register(this.base<GetGoogleCalendarEventsToolInput, unknown>({
      name: 'get_google_calendar_events', description: 'Read events from the authenticated user Google Calendar.', category: AIToolCategory.GOOGLE,
      sideEffect: 'READ', validate: GetGoogleCalendarEventsToolInput, inputSchema: schema({ from: { type: 'string' }, to: { type: 'string' }, calendarId: { type: 'string' } }, ['from', 'to']),
      execute: (context, input) => this.googleCalendarService!.list(context.userId, input as CalendarEventsQueryDto),
    }));

    this.register(this.base<SearchGoogleDriveFilesToolInput, unknown>({
      name: 'search_google_drive_files', description: 'Search metadata for files in the authenticated user Google Drive.', category: AIToolCategory.GOOGLE,
      sideEffect: 'READ', validate: SearchGoogleDriveFilesToolInput, inputSchema: schema({ query: { type: 'string' }, mimeType: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
      execute: (context, input) => this.googleDriveService!.list(context.userId, { q: input.query, mimeType: input.mimeType, limit: input.limit } as DriveFilesQueryDto),
    }));
    this.register(this.base<ListFilesToolInput, unknown>({
      name: 'list_files',
      description:
        'List files owned by the authenticated user. Use this when the user asks whether they have files, asks to show all files, asks for recent/latest files, or does not provide a specific filename. Files are returned newest first.',
      category: AIToolCategory.FILE,
      sideEffect: 'READ',
      validate: ListFilesToolInput,
      inputSchema: schema({
        page: { type: 'integer' },
        limit: { type: 'integer' },
        mimeType: { type: 'string' },
        folderId: { type: 'string' },
        source: {
          type: 'string',
          enum: ['UPLOAD', 'GOOGLE_DRIVE', 'TELEGRAM', 'SYSTEM'],
        },
      }),
      execute: (context, input) =>
        this.filesService!.listForUser(context.userId, {
          page: input.page ?? 1,
          limit: input.limit ?? 20,
          mimeType: input.mimeType,
          folderId: input.folderId,
          source: input.source,
          sort: 'createdAt',
        } as FileQueryDto),
    }));
    this.register(this.base<SearchFilesToolInput, unknown>({
      name: 'search_files',
      description:
        'Search files owned by the authenticated user by filename, extension, folder name or extracted text. Use list_files instead when the user asks generally what files they have. Never invent file IDs.',
      category: AIToolCategory.FILE,
      sideEffect: 'READ',
      validate: SearchFilesToolInput,
      inputSchema: schema(
        {
          query: { type: 'string' },
          mimeType: { type: 'string' },
          folderId: { type: 'string' },
          source: { type: 'string' },
          limit: { type: 'integer' },
        },
        ['query'],
      ),
      execute: (context, input) =>
        this.filesService!.searchForUser(context.userId, input.query, input),
    }));

    this.register(this.base<GetFileMetadataToolInput, unknown>({
      name: 'get_file_metadata', description: 'Get metadata for one file owned by the authenticated user.', category: AIToolCategory.FILE,
      sideEffect: 'READ', validate: GetFileMetadataToolInput, inputSchema: schema({ fileId: { type: 'string' } }, ['fileId']),
      execute: (context, input) => this.filesService!.getForUser(context.userId, input.fileId),
    }));

    this.register(this.base<GetFileContentToolInput, unknown>({
      name: 'get_file_content', description: 'Read extracted text from an owned PDF, DOCX, XLSX, TXT, CSV or JSON file.', category: AIToolCategory.FILE,
      sideEffect: 'READ', validate: GetFileContentToolInput, inputSchema: schema({ fileId: { type: 'string' } }, ['fileId']),
      execute: (context, input) => this.filesService!.getContentForUser(context.userId, input.fileId),
    }));

    this.register(this.base<SearchContactsToolInput, unknown>({
      name: 'search_contacts', description:
        'Search contacts owned by the authenticated user by name, phone, email or Telegram username. Use this before contact updates or when resolving a person mentioned by name. Never invent contact IDs.', category: AIToolCategory.CONTACT,
      sideEffect: 'READ', validate: SearchContactsToolInput, inputSchema: schema({ query: { type: 'string' } }, ['query']),
      execute: async (context, input) => {
        const result = await this.contactsService.listForUser(context.userId, { search: input.query, page: 1, limit: input.limit ?? 20 } as ContactQueryDto);
        return result.items.map(({ id, displayName, phone, email, telegramUsername }) => ({ id, displayName, phone, email, telegramUsername }));
      },
    }));

    this.register(this.base<ContactHistoryToolInput, unknown>({
      name: 'get_contact_history', description: 'Get recent history for an owned contact.', category: AIToolCategory.CONTACT,
      sideEffect: 'READ', validate: ContactHistoryToolInput, inputSchema: schema({ contactId: { type: 'string' } }, ['contactId']),
      authorize: (context, input) => this.assertContactOwned(context.userId, input.contactId),
      execute: (context, input) => this.contactHistoryService.getContactHistory(context.userId, input.contactId),
    }));

    this.register(this.base<RelevantMemoriesToolInput, unknown>({
      name: 'get_relevant_memories', description: 'Retrieve relevant user-scoped memories.', category: AIToolCategory.MEMORY,
      sideEffect: 'READ', validate: RelevantMemoriesToolInput, inputSchema: schema({ query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
      execute: (context, input) => this.memoryService.getRelevantMemories(context.userId, input.query, { type: input.type, limit: input.limit ?? 20 }),
    }));

    this.register(this.base<FinanceSummaryToolInput, unknown>({
      name: 'get_finance_summary', description: 'Get finance totals for an explicit date range in the user timezone (date-only from/to are inclusive days). For umumiy/obshi/all-time use get_all_time_finance, never invent a start date.', category: AIToolCategory.FINANCE,
      sideEffect: 'READ', validate: FinanceSummaryToolInput, inputSchema: schema({ from: { type: 'string' }, to: { type: 'string' }, currency: { type: 'string' } }, ['from', 'to', 'currency']),
      execute: (context, input) => { const period = assertPeriod(input.from, input.to); return this.financeToolsService.getPeriodSummary(context.userId, period.from, period.to, input.currency); },
    }));

    this.register(this.base<TodayFinanceToolInput, unknown>({
      name: 'get_all_time_finance', description: 'Get ALL saved income, expenses and net totals across ALL dates, including old records. Use for umumiy, obshi, jami, all-time, за всё время. Returns separate totals per currency; no date parameters. A failed read is not zero income.', category: AIToolCategory.FINANCE,
      sideEffect: 'READ', validate: TodayFinanceToolInput, inputSchema: schema({ currency: { type: 'string', enum: Object.values(FinanceCurrency) } }),
      execute: (context, input) => this.financeService.getAllTimeSummaryForUser(context.userId, input.currency),
    }));

    this.register(this.base<TodayFinanceToolInput, unknown>({
      name: 'get_today_finance', description: 'Get today\'s finance summary for the authenticated user.', category: AIToolCategory.FINANCE,
      sideEffect: 'READ', validate: TodayFinanceToolInput, inputSchema: schema({ currency: { type: 'string' } }),
      execute: (context, input) => this.financeToolsService.getTodayFinance(context.userId, input.currency),
    }));

    this.register(this.base<CompareFinancePeriodsToolInput, unknown>({
      name: 'compare_finance_periods', description: 'Compare two finance periods using Decimal-safe totals.', category: AIToolCategory.FINANCE,
      sideEffect: 'READ', validate: CompareFinancePeriodsToolInput, inputSchema: schema({ currentFrom: { type: 'string' }, currentTo: { type: 'string' }, previousFrom: { type: 'string' }, previousTo: { type: 'string' }, currency: { type: 'string' } }, ['currentFrom', 'currentTo', 'previousFrom', 'previousTo', 'currency']),
      execute: (context, input) => {
        const current = assertPeriod(input.currentFrom, input.currentTo); const previous = assertPeriod(input.previousFrom, input.previousTo);
        return this.financeToolsService.compareFinancePeriods(context.userId, current.from, current.to, previous.from, previous.to, input.currency);
      },
    }));

    this.register(this.base<BudgetStatusToolInput, unknown>({
      name: 'get_budget_status', description: 'Get deterministic spent-vs-budgeted totals per category for a month.', category: AIToolCategory.FINANCE,
      sideEffect: 'READ', validate: BudgetStatusToolInput, inputSchema: schema({ monthKey: { type: 'string' }, currency: { type: 'string' } }, ['currency']),
      execute: (context, input) => this.financeToolsService.getBudgetStatus(context.userId, input.monthKey, input.currency),
    }));

    this.register(this.base<CashflowForecastToolInput, unknown>({
      name: 'get_cashflow_forecast', description: 'Get a deterministic linear cash-flow forecast for the current month. Never invent numbers beyond what this tool returns.', category: AIToolCategory.FINANCE,
      sideEffect: 'READ', validate: CashflowForecastToolInput, inputSchema: schema({ currency: { type: 'string' } }, ['currency']),
      execute: (context, input) => this.financeToolsService.getCashflowForecast(context.userId, input.currency),
    }));

    this.register(this.base<DailyBriefingToolInput, unknown>({
      name: 'get_daily_briefing', description: 'Get the user\'s deterministic daily plan and priorities for today.', category: AIToolCategory.TODAY,
      sideEffect: 'READ', validate: DailyBriefingToolInput, inputSchema: schema({ date: { type: 'string' } }),
      execute: (context, input) => this.briefingService.buildMorningBriefing(context.userId, input.date),
    }));

    this.register(this.base<SaveSalesPlaybookRuleToolInput, unknown>({
      name: 'save_sales_playbook_rule',
      description: 'Teach the Telegram/WhatsApp/Instagram sales agent a persistent business-specific sales rule, script, objection-handling instruction, store fact, delivery/payment policy, or example. Use when the authenticated owner explicitly says how the sales agent should sell or respond. Do not store secrets.',
      category: AIToolCategory.SYSTEM,
      sideEffect: 'WRITE',
      validate: SaveSalesPlaybookRuleToolInput,
      inputSchema: schema({
        title: { type: 'string' }, instruction: { type: 'string' }, category: { type: 'string' },
        triggerExamples: { type: 'array' }, responseExamples: { type: 'array' }, priority: { type: 'integer' }, active: { type: 'boolean' },
      }, ['title', 'instruction']),
      preview: (_context, input) => input,
      execute: (context, input) => this.prisma.salesPlaybookRule.upsert({
        where: { userId_title: { userId: context.userId, title: input.title } },
        create: {
          userId: context.userId, title: input.title, instruction: input.instruction,
          category: input.category || 'GENERAL', triggerExamples: input.triggerExamples ?? [],
          responseExamples: input.responseExamples ?? [], priority: input.priority ?? 50, active: input.active ?? true,
        },
        update: {
          instruction: input.instruction, category: input.category || 'GENERAL',
          triggerExamples: input.triggerExamples ?? [], responseExamples: input.responseExamples ?? [],
          priority: input.priority ?? 50, active: input.active ?? true,
        },
        select: { id: true, title: true, instruction: true, category: true, triggerExamples: true, responseExamples: true, priority: true, active: true, updatedAt: true },
      }),
    }));

    this.register(this.base<ListSalesPlaybookRulesToolInput, unknown>({
      name: 'list_sales_playbook_rules',
      description: "List the authenticated owner's saved sales-agent playbook rules and business sales instructions.",
      category: AIToolCategory.SYSTEM,
      sideEffect: 'READ',
      validate: ListSalesPlaybookRulesToolInput,
      inputSchema: schema({ activeOnly: { type: 'boolean' } }),
      execute: (context, input) => this.prisma.salesPlaybookRule.findMany({
        where: { userId: context.userId, ...(input.activeOnly === false ? {} : { active: true }) },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
        select: { id: true, title: true, instruction: true, category: true, triggerExamples: true, responseExamples: true, priority: true, active: true, updatedAt: true },
      }),
    }));

    this.register(this.base<DeleteSalesPlaybookRuleToolInput, unknown>({
      name: 'delete_sales_playbook_rule',
      description: 'Delete one saved sales playbook rule by its real ruleId. List rules first if the id is unknown.',
      category: AIToolCategory.SYSTEM,
      sideEffect: 'WRITE',
      validate: DeleteSalesPlaybookRuleToolInput,
      inputSchema: schema({ ruleId: { type: 'string' } }, ['ruleId']),
      authorize: async (context, input) => {
        const row = await this.prisma.salesPlaybookRule.findFirst({ where: { id: input.ruleId, userId: context.userId }, select: { id: true } });
        if (!row) throw new NotFoundException('Sales playbook rule not found');
      },
      preview: (context, input) => this.prisma.salesPlaybookRule.findFirst({ where: { id: input.ruleId, userId: context.userId }, select: { id: true, title: true, instruction: true } }),
      execute: (context, input) => this.prisma.salesPlaybookRule.delete({ where: { id: input.ruleId }, select: { id: true, title: true } }),
    }));


    this.register(this.base<SaveSalesProductKnowledgeToolInput, unknown>({
      name: 'save_sales_product_knowledge',
      description: 'Save or update a customer-facing product fact explicitly taught by the authenticated business owner. This is WHAT the business sells, not a sales script. Never infer missing price/stock or store secrets.',
      category: AIToolCategory.SYSTEM,
      sideEffect: 'WRITE',
      validate: SaveSalesProductKnowledgeToolInput,
      inputSchema: schema({
        canonicalName: { type: 'string' }, productFamily: { type: 'string' }, aliases: { type: 'array' }, description: { type: 'string' },
        publicPrice: { type: 'string' }, currency: { type: 'string', enum: Object.values(FinanceCurrency) },
        availability: { type: 'string', enum: ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'] }, stockQuantity: { type: 'number' },
        unit: { type: 'string' }, attributes: { type: 'array' }, note: { type: 'string' }, active: { type: 'boolean' },
      }, ['canonicalName']),
      preview: (_context, input) => input,
      execute: (context, input) => this.prisma.salesProductKnowledge.upsert({
        where: { userId_canonicalName: { userId: context.userId, canonicalName: input.canonicalName } },
        create: {
          userId: context.userId, canonicalName: input.canonicalName, productFamily: input.productFamily,
          aliases: input.aliases ?? [], description: input.description, publicPrice: input.publicPrice,
          currency: input.currency, availability: input.availability ?? 'UNKNOWN', stockQuantity: input.stockQuantity,
          unit: input.unit, attributes: input.attributes ?? undefined, note: input.note, active: input.active ?? true,
        },
        update: {
          ...(input.productFamily !== undefined ? { productFamily: input.productFamily } : {}),
          ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.publicPrice !== undefined ? { publicPrice: input.publicPrice } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.availability !== undefined ? { availability: input.availability } : {}),
          ...(input.stockQuantity !== undefined ? { stockQuantity: input.stockQuantity } : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
          ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
        select: { id: true, canonicalName: true, productFamily: true, aliases: true, description: true, publicPrice: true, currency: true, availability: true, stockQuantity: true, unit: true, attributes: true, note: true, active: true, updatedAt: true },
      }),
    }));

    this.register(this.base<ListSalesProductKnowledgeToolInput, unknown>({
      name: 'list_sales_product_knowledge',
      description: 'List customer-facing product facts taught by the authenticated business owner. Use to review or find the real knowledgeId before deleting.',
      category: AIToolCategory.SYSTEM,
      sideEffect: 'READ',
      validate: ListSalesProductKnowledgeToolInput,
      inputSchema: schema({ query: { type: 'string' }, limit: { type: 'integer' } }),
      execute: (context, input) => this.prisma.salesProductKnowledge.findMany({
        where: {
          userId: context.userId,
          ...(input.query ? { OR: [
            { canonicalName: { contains: input.query, mode: 'insensitive' } },
            { productFamily: { contains: input.query, mode: 'insensitive' } },
            { description: { contains: input.query, mode: 'insensitive' } },
          ] } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: input.limit ?? 50,
        select: { id: true, canonicalName: true, productFamily: true, aliases: true, description: true, publicPrice: true, currency: true, availability: true, stockQuantity: true, unit: true, attributes: true, note: true, active: true, updatedAt: true },
      }),
    }));

    this.register(this.base<DeleteSalesProductKnowledgeToolInput, unknown>({
      name: 'delete_sales_product_knowledge',
      description: 'Delete one owner-taught product fact by its real knowledgeId. List product knowledge first if the id is unknown.',
      category: AIToolCategory.SYSTEM,
      sideEffect: 'WRITE',
      validate: DeleteSalesProductKnowledgeToolInput,
      inputSchema: schema({ knowledgeId: { type: 'string' } }, ['knowledgeId']),
      authorize: async (context, input) => {
        const row = await this.prisma.salesProductKnowledge.findFirst({ where: { id: input.knowledgeId, userId: context.userId }, select: { id: true } });
        if (!row) throw new NotFoundException('Product knowledge not found');
      },
      preview: (context, input) => this.prisma.salesProductKnowledge.findFirst({ where: { id: input.knowledgeId, userId: context.userId }, select: { id: true, canonicalName: true } }),
      execute: (context, input) => this.prisma.salesProductKnowledge.delete({ where: { id: input.knowledgeId }, select: { id: true, canonicalName: true } }),
    }));

    if (this.instagramIntegrationService) {
      this.register(this.base<EmptyToolInput, unknown>({
        name: 'get_instagram_sales_settings',
        description: 'Read the authenticated owner Instagram connection and AI sales-agent settings. Use this before changing Instagram sales-agent, Direct, comment or image-understanding toggles.',
        category: AIToolCategory.INSTAGRAM,
        sideEffect: 'READ',
        validate: EmptyToolInput,
        inputSchema: schema({}),
        execute: (context) => this.instagramIntegrationService!.status(context.userId),
      }));
      this.register(this.base<UpdateInstagramSalesSettingsToolInput, unknown>({
        name: 'update_instagram_sales_settings',
        description: 'Turn the authenticated owner Instagram AI sales agent, Direct replies, comment replies, or image understanding on/off. Include only fields the owner explicitly asked to change.',
        category: AIToolCategory.INSTAGRAM,
        sideEffect: 'WRITE',
        validate: UpdateInstagramSalesSettingsToolInput,
        inputSchema: schema({ enabled: { type: 'boolean' }, dmEnabled: { type: 'boolean' }, commentsEnabled: { type: 'boolean' }, imageVisionEnabled: { type: 'boolean' } }),
        execute: (context, input) => this.instagramIntegrationService!.updateSettings(context.userId, input),
      }));
      this.register(this.base<ListInstagramPostsToolInput, unknown>({
        name: 'list_instagram_posts',
        description: 'List REAL posts/reels from the authenticated owner Instagram account, newest first. Always use this before creating a post-specific comment automation; never invent mediaId.',
        category: AIToolCategory.INSTAGRAM,
        sideEffect: 'READ',
        validate: ListInstagramPostsToolInput,
        inputSchema: schema({ limit: { type: 'integer' } }),
        execute: (context, input) => this.instagramIntegrationService!.listPosts(context.userId, input.limit ?? 25),
      }));
      this.register(this.base<ListInstagramCommentAutomationsToolInput, unknown>({
        name: 'list_instagram_comment_automations',
        description: 'List saved Instagram comment-to-DM automations for the authenticated owner.',
        category: AIToolCategory.INSTAGRAM,
        sideEffect: 'READ',
        validate: ListInstagramCommentAutomationsToolInput,
        inputSchema: schema({ activeOnly: { type: 'boolean' } }),
        execute: (context, input) => this.instagramIntegrationService!.listAutomations(context.userId, input.activeOnly === true),
      }));
      this.register(this.base<SaveInstagramCommentAutomationToolInput, unknown>({
        name: 'save_instagram_comment_automation',
        description: 'Prepare an Instagram comment automation for one REAL mediaId returned by list_instagram_posts. Matching comments may receive a private reply/DM and optionally a public reply. This future external messaging action requires confirmation.',
        category: AIToolCategory.INSTAGRAM,
        sideEffect: 'WRITE',
        validate: SaveInstagramCommentAutomationToolInput,
        inputSchema: schema({ mediaId: { type: 'string' }, triggerText: { type: 'string' }, dmMessage: { type: 'string' }, publicReply: { type: 'string' }, semanticMatch: { type: 'boolean' }, sendPrivateReply: { type: 'boolean' }, replyPublicly: { type: 'boolean' }, active: { type: 'boolean' } }, ['mediaId', 'triggerText', 'dmMessage']),
        authorize: async (context, input) => {
          const posts = await this.instagramIntegrationService!.listPosts(context.userId, 50);
          if (!posts.some(post => post.id === input.mediaId)) throw new BadRequestException('Instagram mediaId real postlar orasida topilmadi');
        },
        preview: async (context, input) => {
          const posts = await this.instagramIntegrationService!.listPosts(context.userId, 50);
          const post = posts.find(item => item.id === input.mediaId);
          return { post: post ? { id: post.id, caption: post.caption, permalink: post.permalink } : { id: input.mediaId }, triggerText: input.triggerText, dmMessage: input.dmMessage, publicReply: input.publicReply ?? null, semanticMatch: input.semanticMatch !== false, sendPrivateReply: input.sendPrivateReply !== false, replyPublicly: input.replyPublicly === true };
        },
        execute: (context, input) => this.instagramIntegrationService!.createAutomation(context.userId, input),
      }));
      this.register(this.base<UpdateInstagramCommentAutomationToolInput, unknown>({
        name: 'update_instagram_comment_automation',
        description: 'Update, pause or resume one existing Instagram comment automation by its real automationId. List automations first when the id is unknown. This changes future external messaging and therefore requires confirmation.',
        category: AIToolCategory.INSTAGRAM,
        sideEffect: 'WRITE',
        validate: UpdateInstagramCommentAutomationToolInput,
        inputSchema: schema({ automationId: { type: 'string' }, triggerText: { type: 'string' }, dmMessage: { type: 'string' }, publicReply: { type: 'string' }, semanticMatch: { type: 'boolean' }, sendPrivateReply: { type: 'boolean' }, replyPublicly: { type: 'boolean' }, active: { type: 'boolean' } }, ['automationId']),
        authorize: async (context, input) => {
          const rows = await this.instagramIntegrationService!.listAutomations(context.userId, false);
          if (!rows.some(row => row.id === input.automationId)) throw new NotFoundException('Instagram automation not found');
        },
        preview: async (context, input) => ({
          current: (await this.instagramIntegrationService!.listAutomations(context.userId, false)).find(row => row.id === input.automationId) ?? null,
          changes: input,
        }),
        execute: (context, input) => {
          const { automationId, ...patch } = input;
          return this.instagramIntegrationService!.updateAutomation(context.userId, automationId, patch);
        },
      }));
      this.register(this.base<DeleteInstagramCommentAutomationToolInput, unknown>({
        name: 'delete_instagram_comment_automation',
        description: 'Delete one Instagram comment automation by its real automationId.',
        category: AIToolCategory.INSTAGRAM,
        sideEffect: 'WRITE',
        validate: DeleteInstagramCommentAutomationToolInput,
        inputSchema: schema({ automationId: { type: 'string' } }, ['automationId']),
        authorize: async (context, input) => {
          const rows = await this.instagramIntegrationService!.listAutomations(context.userId, false);
          if (!rows.some(row => row.id === input.automationId)) throw new NotFoundException('Instagram automation not found');
        },
        preview: async (context, input) => (await this.instagramIntegrationService!.listAutomations(context.userId, false)).find(row => row.id === input.automationId) ?? null,
        execute: (context, input) => this.instagramIntegrationService!.deleteAutomation(context.userId, input.automationId),
      }));
    }

    this.register(this.base<CreateTaskToolInput, unknown>({
      name: 'create_task', description: 'Create a task for the authenticated user.', category: AIToolCategory.TASK,
      sideEffect: 'WRITE', validate: CreateTaskToolInput, inputSchema: schema({ title: { type: 'string' }, description: { type: 'string' }, dueAt: { type: 'string' }, priority: { type: 'string', enum: Object.values(TaskPriority) } }, ['title']),
      preview: (_context, input) => ({ title: input.title, dueDate: input.dueAt ?? null, priority: input.priority ?? 'MEDIUM' }),
      execute: (context, input) => this.tasksService.createForUser(context.userId, { title: input.title, description: input.description, dueDate: input.dueAt, priority: input.priority } as CreateTaskDto),
    }));

    this.register(this.base<CreateReminderToolInput, unknown>({
      name: 'create_reminder', description: 'Create a reminder for the authenticated user.', category: AIToolCategory.REMINDER,
      sideEffect: 'WRITE', validate: CreateReminderToolInput, inputSchema: schema({ title: { type: 'string' }, remindAt: { type: 'string' }, note: { type: 'string' } }, ['title', 'remindAt']),
      preview: (_context, input) => ({ title: input.title, remindAt: input.remindAt }),
      execute: (context, input) => this.remindersService.createForUser(context.userId, { title: input.title, remindAt: input.remindAt, description: input.note } as CreateReminderDto),
    }));

    this.register(this.base<CreateMeetingToolInput, unknown>({
      name: 'create_meeting', description: 'Create a meeting for the authenticated user.', category: AIToolCategory.MEETING,
      sideEffect: 'WRITE', validate: CreateMeetingToolInput, inputSchema: schema({ title: { type: 'string' }, startAt: { type: 'string' }, endAt: { type: 'string' }, contactId: { type: 'string' }, location: { type: 'string' }, notes: { type: 'string' } }, ['title', 'startAt']),
      authorize: async (context, input) => { if (input.contactId) await this.assertContactOwned(context.userId, input.contactId); },
      preview: (_context, input) => ({ title: input.title, startAt: input.startAt, endAt: input.endAt ?? new Date(asDate(input.startAt).getTime() + 3600000).toISOString(), contactId: input.contactId ?? null, location: input.location ?? null, notes: input.notes ?? null }),
      execute: (context, input) => this.meetingsService.createForUser(context.userId, { title: input.title, startsAt: input.startAt, endsAt: input.endAt ?? new Date(asDate(input.startAt).getTime() + 3600000).toISOString(), contactId: input.contactId, location: input.location, description: input.notes } as CreateMeetingDto),
    }));

    this.register(this.base<CreateNoteToolInput, unknown>({
      name: 'create_note', description: 'Create a note for the authenticated user.', category: AIToolCategory.NOTE,
      sideEffect: 'WRITE', validate: CreateNoteToolInput, inputSchema: schema({ title: { type: 'string' }, content: { type: 'string' }, contactId: { type: 'string' } }, ['content']),
      authorize: async (context, input) => { if (input.contactId) await this.assertContactOwned(context.userId, input.contactId); },
      preview: (_context, input) => ({ title: input.title ?? 'AI note', content: input.content, contactId: input.contactId ?? null }),
      execute: (context, input) => this.notesService.createForUser(context.userId, { title: input.title ?? 'AI note', content: input.content, contactId: input.contactId } as CreateNoteDto),
    }));

    this.register(this.base<CreateContactToolInput, unknown>({
      name: 'create_contact', description: 'Create a contact for the authenticated user.', category: AIToolCategory.CONTACT,
      sideEffect: 'WRITE', validate: CreateContactToolInput, inputSchema: schema({ firstName: { type: 'string' }, lastName: { type: 'string' }, displayName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, telegramUsername: { type: 'string' }, company: { type: 'string' }, position: { type: 'string' }, notes: { type: 'string' }, tags: { type: 'array' } }, ['firstName']),
      preview: (_context, input) => ({ firstName: input.firstName, lastName: input.lastName ?? null, displayName: input.displayName ?? null, phone: input.phone ?? null, email: input.email ?? null, telegramUsername: input.telegramUsername ?? null }),
      execute: (context, input) => this.contactsService.createForUser(context.userId, input as CreateContactDto),
    }));

    this.register(this.base<UpdateContactToolInput, unknown>({
      name: 'update_contact', description: 'Correct or update an owned contact after explicit confirmation.', category: AIToolCategory.CONTACT,
      sideEffect: 'WRITE', validate: UpdateContactToolInput, inputSchema: schema({ contactId: { type: 'string' }, firstName: { type: 'string' }, lastName: { type: 'string' }, displayName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, telegramUsername: { type: 'string' }, company: { type: 'string' }, position: { type: 'string' }, relationship: { type: 'string' }, notes: { type: 'string' }, tags: { type: 'array' } }, ['contactId']),
      authorize: (context, input) => this.assertContactOwned(context.userId, input.contactId),
      preview: async (context, input) => ({ current: await this.contactsService.getForUser(context.userId, input.contactId), changes: input }),
      execute: (context, input) => { const { contactId, ...changes } = input; return this.contactsService.updateForUser(context.userId, contactId, changes as UpdateContactDto); },
    }));

    this.register(this.base<DeleteContactToolInput, unknown>({
      name: 'delete_contact', description: 'Delete an owned contact after explicit confirmation.', category: AIToolCategory.CONTACT,
      sideEffect: 'WRITE', validate: DeleteContactToolInput, inputSchema: schema({ contactId: { type: 'string' } }, ['contactId']),
      authorize: (context, input) => this.assertContactOwned(context.userId, input.contactId),
      preview: (context, input) => this.contactsService.getForUser(context.userId, input.contactId),
      execute: (context, input) => this.contactsService.deleteForUser(context.userId, input.contactId),
    }));

    this.register(this.base<SaveMemoryToolInput, unknown>({
      name: 'save_memory', description: 'Remember a stable fact explicitly provided by the user about themselves or a contact. No extra confirmation while memory is enabled. Use subject-specific keys, e.g. sardor.role; search existing memories before saving. Never store secrets or speculative traits.', category: AIToolCategory.MEMORY,
      sideEffect: 'WRITE', validate: SaveMemoryToolInput, inputSchema: schema({ type: { type: 'string', enum: Object.values(MemoryType) }, key: { type: 'string' }, value: { type: 'string' }, importance: { type: 'integer' }, contactId: { type: 'string' } }, ['type', 'key', 'value']),
      authorize: async (context, input) => { if (input.contactId) await this.assertContactOwned(context.userId, input.contactId); },
      preview: (_context, input) => ({ type: input.type, key: input.key, value: input.value, importance: input.importance ?? 5, contactId: input.contactId ?? null }),
      execute: (context, input) => this.memoryService.createForUser(context.userId, { ...input, source: 'AI_USER_STATED', isVerified: true, confidence: 100 } as CreateMemoryDto),
    }));

    this.register(this.base<UpdateMemoryToolInput, unknown>({
      name: 'update_memory', description: 'Correct an owned memory when the user explicitly supplies a correction. Search first to obtain its real memoryId. No extra confirmation.', category: AIToolCategory.MEMORY,
      sideEffect: 'WRITE', validate: UpdateMemoryToolInput, inputSchema: schema({ memoryId: { type: 'string' }, type: { type: 'string', enum: Object.values(MemoryType) }, key: { type: 'string' }, value: { type: 'string' }, importance: { type: 'integer' } }, ['memoryId']),
      authorize: (context, input) => this.memoryService.getForUser(context.userId, input.memoryId).then(() => undefined),
      preview: async (context, input) => ({ current: await this.memoryService.getForUser(context.userId, input.memoryId), changes: input }),
      execute: (context, input) => { const { memoryId, ...changes } = input; return this.memoryService.updateForUser(context.userId, memoryId, { ...changes, source: 'AI_CORRECTION', isVerified: true, confidence: 100 } as UpdateMemoryDto); },
    }));

    this.register(this.base<DeleteMemoryToolInput, unknown>({
      name: 'delete_memory', description: 'Forget an owned long-term memory after explicit confirmation.', category: AIToolCategory.MEMORY,
      sideEffect: 'WRITE', validate: DeleteMemoryToolInput, inputSchema: schema({ memoryId: { type: 'string' } }, ['memoryId']),
      authorize: (context, input) => this.memoryService.getForUser(context.userId, input.memoryId).then(() => undefined),
      preview: (context, input) => this.memoryService.getForUser(context.userId, input.memoryId),
      execute: (context, input) => this.memoryService.deleteForUser(context.userId, input.memoryId),
    }));

    this.register(this.base<CreateFinanceTransactionToolInput, unknown>({
      name: 'create_finance_transaction', description: 'Create a finance transaction for the authenticated user.', category: AIToolCategory.FINANCE,
      sideEffect: 'WRITE', validate: CreateFinanceTransactionToolInput, inputSchema: schema({ type: { type: 'string', enum: Object.values(FinanceTransactionType) }, amount: { type: 'string', description: 'Positive decimal amount, e.g. 500000. 500 ming/min/k = 500000; yarim mln = 500000.' }, currency: { type: 'string', enum: Object.values(FinanceCurrency) }, title: { type: 'string' }, categoryId: { type: 'string' }, accountId: { type: 'string' }, contactId: { type: 'string' }, transactionDate: { type: 'string', description: 'ISO datetime with offset, YYYY-MM-DD, or bugun/kecha/ertaga; resolved in user timezone. Omit only when date is not specified (now).' }, description: { type: 'string' } }, ['type', 'amount', 'currency', 'title']),
      authorize: async (context, input) => {
        if (input.contactId) await this.assertContactOwned(context.userId, input.contactId);
        if (input.categoryId) {
          const categories = await this.financeService.listCategoriesForUser(context.userId, {});
          const category = categories.find((item) => item.id === input.categoryId);
          if (!category || (category.type !== 'BOTH' && category.type !== input.type)) throw new NotFoundException('Finance category was not found');
        }
      },
      preview: async (context, input) => {
        const category = input.categoryId ? (await this.financeService.listCategoriesForUser(context.userId, {})).find((item) => item.id === input.categoryId) : null;
        const contact = input.contactId ? await this.contactsService.getForUser(context.userId, input.contactId) : null;
        return { type: input.type, amount: input.amount, currency: input.currency, title: input.title, transactionDate: input.transactionDate, timezone: context.timezone ?? 'Asia/Tashkent', category: category ? { id: category.id, name: category.name } : null, contact: contact ? { id: contact.id, displayName: contact.displayName } : null };
      },
      execute: (context, input) => this.financeToolsService.createFinanceTransactionForUser(context.userId, { ...input, transactionDate: input.transactionDate ?? new Date().toISOString() } as CreateFinanceTransactionDto),
    }));

    this.register(this.base<SearchTelegramChatsToolInput, unknown>({
      name: 'search_telegram_chats', description: 'Search chats available through the authenticated user Telegram account.', category: AIToolCategory.CONTACT,
      sideEffect: 'READ', validate: SearchTelegramChatsToolInput, inputSchema: schema({ query: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
      execute: (context, input) => this.telegramIntegrationService.search(context.userId, { q: input.query, limit: input.limit ?? 10 } as never),
    }));

    this.register(this.base<SendTelegramMessageToolInput, unknown>({
      name: 'send_telegram_message', description: 'Send a Telegram message after explicit user confirmation.', category: AIToolCategory.SYSTEM,
      sideEffect: 'WRITE', validate: SendTelegramMessageToolInput, inputSchema: schema({ peerId: { type: 'string' }, text: { type: 'string' } }, ['peerId', 'text']),
      preview: async (context, input) => {
        const prepared = await this.telegramIntegrationService.prepareTelegramMessage(context.userId, input.peerId, input.text);
        const recipient = prepared.recipient.username
          ? `${prepared.recipient.displayName} (${prepared.recipient.username})`
          : prepared.recipient.displayName;
        return {
          recipient,
          peerId: prepared.recipient.peerId,
          text: prepared.text,
          confirmationRequired: true,
        };
      },
      execute: (context, input) => this.telegramIntegrationService.sendMessage(context.userId, input.peerId, input.text),
    }));
    this.register(this.base<CreateGoogleCalendarEventToolInput, unknown>({
      name: 'create_google_calendar_event', description: 'Create a Google Calendar event after explicit confirmation.', category: AIToolCategory.GOOGLE,
      sideEffect: 'WRITE', validate: CreateGoogleCalendarEventToolInput, inputSchema: schema({ title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' }, attendees: { type: 'array' }, location: { type: 'string' }, calendarId: { type: 'string' } }, ['title', 'start', 'end']),
      preview: (_context, input) => ({ title: input.title, start: input.start, end: input.end, location: input.location ?? null }),
      execute: (context, input) => this.googleCalendarService!.create(context.userId, input as CreateCalendarEventDto),
    }));

    this.register(this.base<UpdateGoogleCalendarEventToolInput, unknown>({
      name: 'update_google_calendar_event', description: 'Update a Google Calendar event after explicit confirmation.', category: AIToolCategory.GOOGLE,
      sideEffect: 'WRITE', validate: UpdateGoogleCalendarEventToolInput, inputSchema: schema({ eventId: { type: 'string' }, title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' }, attendees: { type: 'array' }, location: { type: 'string' }, calendarId: { type: 'string' } }, ['eventId']),
      preview: (_context, input) => ({ eventId: input.eventId, title: input.title, start: input.start, end: input.end }),
      execute: (context, input) => this.googleCalendarService!.update(context.userId, input.eventId, input as UpdateCalendarEventDto),
    }));

    this.register(this.base<DeleteGoogleCalendarEventToolInput, unknown>({
      name: 'delete_google_calendar_event', description: 'Delete a Google Calendar event after explicit confirmation.', category: AIToolCategory.GOOGLE,
      sideEffect: 'WRITE', validate: DeleteGoogleCalendarEventToolInput, inputSchema: schema({ eventId: { type: 'string' }, calendarId: { type: 'string' } }, ['eventId']),
      preview: (_context, input) => ({ eventId: input.eventId, calendarId: input.calendarId ?? 'primary' }),
      execute: (context, input) => this.googleCalendarService!.delete(context.userId, input.eventId, input.calendarId),
    }));
  }

  private async assertContactOwned(userId: string, contactId: string): Promise<void> {
    await this.contactsService.getForUser(userId, contactId);
  }

  async recordWriteExecution(toolName: string, userId: string, result: unknown): Promise<void> {
    const entityId = toolName.startsWith('create_google_') || toolName.startsWith('update_google_') || toolName.startsWith('delete_google_')
      ? undefined
      : typeof result === 'object' && result !== null && 'id' in result && typeof result.id === 'string' ? result.id : undefined;
    await this.activityLog.record({
      userId,
      action: ACTIVITY_ACTIONS.AI_TOOL_EXECUTED,
      entityType: this.entityTypeFor(toolName),
      entityId,
      metadata: { toolName, source: 'AI_TOOL' },
    });
  }

  private entityTypeFor(toolName: string): string {
    const types: Record<string, string> = {
      create_task: 'TASK', create_reminder: 'REMINDER', create_meeting: 'MEETING', create_note: 'NOTE',
      create_contact: 'CONTACT', update_contact: 'CONTACT', delete_contact: 'CONTACT',
      save_memory: 'MEMORY', update_memory: 'MEMORY', delete_memory: 'MEMORY', create_finance_transaction: 'FINANCE_TRANSACTION',
      save_sales_playbook_rule: 'SALES_PLAYBOOK', delete_sales_playbook_rule: 'SALES_PLAYBOOK',
      send_telegram_message: 'TELEGRAM_MESSAGE',
      create_google_calendar_event: 'GOOGLE_CALENDAR_EVENT', update_google_calendar_event: 'GOOGLE_CALENDAR_EVENT', delete_google_calendar_event: 'GOOGLE_CALENDAR_EVENT',
    };
    return types[toolName] ?? 'AI_TOOL';
  }
}
