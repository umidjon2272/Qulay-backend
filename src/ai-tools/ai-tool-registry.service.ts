import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { FinanceTransactionType, MemoryType } from '@prisma/client';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { ContactHistoryService } from '../contacts/contact-history.service';
import { ContactsService } from '../contacts/contacts.service';
import { CreateContactDto } from '../contacts/dto/create-contact.dto';
import { ContactQueryDto } from '../contacts/dto/contact-query.dto';
import { FinanceService } from '../finance/finance.service';
import { FinanceToolsService } from '../finance/finance-tools.service';
import { CreateFinanceTransactionDto } from '../finance/dto/create-finance-transaction.dto';
import { CreateMemoryDto } from '../memory/dto/create-memory.dto';
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
import {
  CompareFinancePeriodsToolInput, ContactHistoryToolInput, CreateContactToolInput,
  CreateFinanceTransactionToolInput, CreateMeetingToolInput, CreateNoteToolInput,
  CreateReminderToolInput, CreateTaskToolInput, EmptyToolInput, FinanceSummaryToolInput,
  MeetingsToolInput, NotesToolInput, RelevantMemoriesToolInput, RemindersToolInput,
  SaveMemoryToolInput, SearchContactsToolInput, TasksToolInput, TodayFinanceToolInput,
  TodayPlanInput, SearchTelegramChatsToolInput, SendTelegramMessageToolInput,
  SearchFilesToolInput, GetFileMetadataToolInput,
  GetGoogleCalendarEventsToolInput, CreateGoogleCalendarEventToolInput,
  UpdateGoogleCalendarEventToolInput, DeleteGoogleCalendarEventToolInput, SearchGoogleDriveFilesToolInput,
} from './dto/tool-input.dto';
import { TelegramIntegrationService } from '../telegram/telegram-integration.service';
import { GoogleCalendarService } from '../google/google-calendar.service';
import { GoogleDriveService } from '../google/google-drive.service';
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
  return { type: 'object', properties, required };
}

async function validateInput<T>(input: unknown, dtoClass: Class<T>): Promise<T> {
  assertToolObject(input);
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
    private readonly activityLog: ActivityLogService,
    @Optional() private readonly googleCalendarService?: GoogleCalendarService,
    @Optional() private readonly googleDriveService?: GoogleDriveService,
    @Optional() private readonly filesService?: FilesService,
  ) {
    this.registerTools();
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

  private registerTools(): void {
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
      sideEffect: 'READ', validate: TasksToolInput, inputSchema: schema({ status: { type: 'string' }, priority: { type: 'string' }, date: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer' } }),
      execute: (context, input) => this.tasksService.listForUser(context.userId, { page: 1, limit: input.limit ?? 100, ...input } as TaskQueryDto),
    }));

    this.register(this.base<RemindersToolInput, unknown>({
      name: 'get_reminders', description: 'List the authenticated user\'s reminders.', category: AIToolCategory.REMINDER,
      sideEffect: 'READ', validate: RemindersToolInput, inputSchema: schema({ priority: { type: 'string' }, date: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer' } }),
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

    this.register(this.base<SearchFilesToolInput, unknown>({
      name: 'search_files', description: 'Search metadata for files owned by the authenticated user.', category: AIToolCategory.FILE,
      sideEffect: 'READ', validate: SearchFilesToolInput, inputSchema: schema({ query: { type: 'string' }, mimeType: { type: 'string' }, folderId: { type: 'string' }, source: { type: 'string' }, limit: { type: 'integer' } }, ['query']),
      execute: (context, input) => this.filesService!.searchForUser(context.userId, input.query, input),
    }));

    this.register(this.base<GetFileMetadataToolInput, unknown>({
      name: 'get_file_metadata', description: 'Get metadata for one file owned by the authenticated user.', category: AIToolCategory.FILE,
      sideEffect: 'READ', validate: GetFileMetadataToolInput, inputSchema: schema({ fileId: { type: 'string' } }, ['fileId']),
      execute: (context, input) => this.filesService!.getForUser(context.userId, input.fileId),
    }));

    this.register(this.base<SearchContactsToolInput, unknown>({
      name: 'search_contacts', description: 'Search contacts owned by the authenticated user.', category: AIToolCategory.CONTACT,
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
      name: 'get_finance_summary', description: 'Get a Decimal-safe finance summary for a period.', category: AIToolCategory.FINANCE,
      sideEffect: 'READ', validate: FinanceSummaryToolInput, inputSchema: schema({ from: { type: 'string' }, to: { type: 'string' }, currency: { type: 'string' } }, ['from', 'to', 'currency']),
      execute: (context, input) => { const period = assertPeriod(input.from, input.to); return this.financeToolsService.getPeriodSummary(context.userId, period.from, period.to, input.currency); },
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

    this.register(this.base<CreateTaskToolInput, unknown>({
      name: 'create_task', description: 'Create a task for the authenticated user.', category: AIToolCategory.TASK,
      sideEffect: 'WRITE', validate: CreateTaskToolInput, inputSchema: schema({ title: { type: 'string' }, description: { type: 'string' }, dueAt: { type: 'string' }, priority: { type: 'string' } }, ['title']),
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

    this.register(this.base<SaveMemoryToolInput, unknown>({
      name: 'save_memory', description: 'Save a user-scoped memory after confirmation.', category: AIToolCategory.MEMORY,
      sideEffect: 'WRITE', validate: SaveMemoryToolInput, inputSchema: schema({ type: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' }, importance: { type: 'integer' }, contactId: { type: 'string' } }, ['type', 'key', 'value']),
      authorize: async (context, input) => { if (input.contactId) await this.assertContactOwned(context.userId, input.contactId); },
      preview: (_context, input) => ({ type: input.type, key: input.key, value: input.value, importance: input.importance ?? 5, contactId: input.contactId ?? null }),
      execute: (context, input) => this.memoryService.createForUser(context.userId, { ...input, source: 'AI_TOOL' } as CreateMemoryDto),
    }));

    this.register(this.base<CreateFinanceTransactionToolInput, unknown>({
      name: 'create_finance_transaction', description: 'Create a finance transaction for the authenticated user.', category: AIToolCategory.FINANCE,
      sideEffect: 'WRITE', validate: CreateFinanceTransactionToolInput, inputSchema: schema({ type: { type: 'string' }, amount: { type: 'string' }, currency: { type: 'string' }, title: { type: 'string' }, categoryId: { type: 'string' }, contactId: { type: 'string' }, transactionDate: { type: 'string' }, description: { type: 'string' } }, ['type', 'amount', 'currency', 'title']),
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
        return { type: input.type, amount: input.amount, currency: input.currency, title: input.title, category: category ? { id: category.id, name: category.name } : null, contact: contact ? { id: contact.id, displayName: contact.displayName } : null };
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
      // Preview itself resolves/validates the recipient. Confirmed execution also
      // resolves the peer inside sendMessage(), so a separate authorize hook here
      // would open a second Telegram client and resolve the same peer twice.
      preview: (context, input) => this.telegramIntegrationService.prepareTelegramMessage(context.userId, input.peerId, input.text),
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
      create_contact: 'CONTACT', save_memory: 'MEMORY', create_finance_transaction: 'FINANCE_TRANSACTION',
      send_telegram_message: 'TELEGRAM_MESSAGE',
      create_google_calendar_event: 'GOOGLE_CALENDAR_EVENT', update_google_calendar_event: 'GOOGLE_CALENDAR_EVENT', delete_google_calendar_event: 'GOOGLE_CALENDAR_EVENT',
    };
    return types[toolName] ?? 'AI_TOOL';
  }
}
