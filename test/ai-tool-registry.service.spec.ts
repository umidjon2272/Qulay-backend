import { NotFoundException } from '@nestjs/common';
import { TaskPriority } from '@prisma/client';
import { AIToolExecutionService } from '../src/ai-tools/ai-tool-execution.service';
import { AIToolRegistryService } from '../src/ai-tools/ai-tool-registry.service';

describe('AI tool registry and execution', () => {
  const task = { id: 'task-1', userId: 'user-a', title: 'Ship feature' };
  const tasksService = {
    listForUser: jest.fn().mockResolvedValue({ items: [task], meta: { total: 1 } }),
    createForUser: jest.fn().mockResolvedValue(task),
    getForUser: jest.fn().mockResolvedValue(task),
    updateForUser: jest.fn().mockResolvedValue(task),
    deleteForUser: jest.fn().mockResolvedValue({message:'deleted'}),
    completeForUser: jest.fn().mockResolvedValue(task),
  };
  const remindersService = { listForUser: jest.fn() };
  const meetingsService = { listForUser: jest.fn(), createForUser: jest.fn() };
  const notesService = { listForUser: jest.fn().mockResolvedValue({ items: [], meta: { total: 0 } }), createForUser: jest.fn() };
  const contactsService = {
    listForUser: jest.fn().mockResolvedValue({ items: [], meta: { total: 0 } }),
    getForUser: jest.fn().mockResolvedValue({ id: 'contact-1', displayName: 'Owned contact' }),
    createForUser: jest.fn(),
  };
  const contactHistoryService = { getContactHistory: jest.fn() };
  const memoryService = { getRelevantMemories: jest.fn(), createForUser: jest.fn() };
  const financeService = { listCategoriesForUser: jest.fn().mockResolvedValue([]) };
  const financeToolsService = { getPeriodSummary: jest.fn(), getTodayFinance: jest.fn(), compareFinancePeriods: jest.fn(), createFinanceTransactionForUser: jest.fn() };
  const todayService = { getForUser: jest.fn().mockResolvedValue({ date: '2026-08-25', timezone: 'UTC', tasks: [], reminders: [], meetings: [], overdueTasks: [], nextMeeting: null }) };
  const telegramIntegrationService = { search: jest.fn(), prepareTelegramMessage: jest.fn(), sendMessage: jest.fn() };
  const briefingService = { buildMorningBriefing: jest.fn() };
  const googleCalendarService = { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const googleDriveService = { list: jest.fn(), metadata: jest.fn() };
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) };
  let registry: AIToolRegistryService;
  let execution: AIToolExecutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new AIToolRegistryService(
      tasksService as any, remindersService as any, meetingsService as any, notesService as any,
      contactsService as any, contactHistoryService as any, memoryService as any, financeService as any,
      financeToolsService as any, todayService as any, telegramIntegrationService as any, briefingService as any,
      activityLog as any, googleCalendarService as any, googleDriveService as any,
    );
    execution = new AIToolExecutionService(registry);
  });

  it('lists all first-party tools with confirmation metadata', () => {
    const tools = registry.listMetadata();
    expect(tools).toHaveLength(58);
    expect(tools.find((tool) => tool.name === 'get_file_content')).toMatchObject({ sideEffect: 'READ', requiresConfirmation: false });
    expect(tools.find((tool) => tool.name === 'get_tasks')).toMatchObject({ sideEffect: 'READ', requiresConfirmation: false });
    expect(tools.find((tool) => tool.name === 'create_task')).toMatchObject({ sideEffect: 'WRITE', requiresConfirmation: true });
  });

  it('blocks an unknown tool', () => {
    expect(() => registry.get('does_not_exist')).toThrow(NotFoundException);
  });
  it('exposes all new mutations only behind confirmation', () => {
    for (const name of ['update_task','delete_task','complete_task','reopen_task','update_reminder','complete_reminder','delete_reminder','update_meeting','cancel_meeting','delete_meeting','update_note','delete_note','update_finance_transaction','delete_finance_transaction']) {
      expect(registry.get(name)).toMatchObject({sideEffect:'WRITE',requiresConfirmation:true,permission:'USER_SCOPED'});
    }
  });
  it('uses real user ownership before preparing deletion', async () => {
    tasksService.getForUser.mockRejectedValueOnce(new NotFoundException('Task was not found'));
    await expect(execution.execute('other-user',{tool:'delete_task',input:{id:'00000000-0000-4000-8000-000000000001'},confirmed:false})).rejects.toThrow('Task was not found');
    expect(tasksService.deleteForUser).not.toHaveBeenCalled();
  });
  it('prepares task changes, then executes only after confirmation', async () => {
    const input={id:'00000000-0000-4000-8000-000000000001',title:'Updated'};
    expect(await execution.execute('user-a',{tool:'update_task',input,confirmed:false})).toMatchObject({status:'confirmation_required',preview:{changes:{title:'Updated'}}});
    expect(tasksService.updateForUser).not.toHaveBeenCalled();
    await execution.execute('user-a',{tool:'update_task',input,confirmed:true});
    expect(tasksService.updateForUser).toHaveBeenCalledWith('user-a',input.id,expect.objectContaining({title:'Updated'}));
  });
  it('supports later pages without raising page size past 100', async () => {
    await execution.execute('user-a',{tool:'get_tasks',input:{page:3,limit:50},confirmed:false});
    expect(tasksService.listForUser).toHaveBeenCalledWith('user-a',expect.objectContaining({page:3,limit:50}));
    await expect(execution.execute('user-a',{tool:'get_tasks',input:{limit:101},confirmed:false})).rejects.toThrow();
  });

  it('executes a read tool and returns normalized data', async () => {
    await expect(execution.execute('user-a', { tool: 'get_tasks', input: {}, confirmed: false, requestId: 'req-read' })).resolves.toMatchObject({
      status: 'success', tool: 'get_tasks', data: { items: [task] }, meta: { requestId: 'req-read' },
    });
    expect(tasksService.listForUser).toHaveBeenCalledWith('user-a', expect.objectContaining({ page: 1 }));
  });

  it('requires confirmation and does not execute a write tool', async () => {
    await expect(execution.execute('user-a', { tool: 'create_task', input: { title: 'Ship feature', priority: TaskPriority.HIGH }, confirmed: false })).resolves.toMatchObject({
      status: 'confirmation_required', tool: 'create_task', preview: { title: 'Ship feature', priority: TaskPriority.HIGH },
    });
    expect(tasksService.createForUser).not.toHaveBeenCalled();
  });

  it('executes a confirmed write and records AI_TOOL activity', async () => {
    await expect(execution.execute('user-a', { tool: 'create_task', input: { title: 'Ship feature' }, confirmed: true })).resolves.toMatchObject({ status: 'success', data: task });
    expect(tasksService.createForUser).toHaveBeenCalledWith('user-a', expect.objectContaining({ title: 'Ship feature' }));
    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a', action: 'AI_TOOL_EXECUTED', entityType: 'TASK', entityId: 'task-1', metadata: { toolName: 'create_task', source: 'AI_TOOL' },
    }));
  });

  it('rejects foreign contact references before confirmation', async () => {
    contactsService.getForUser.mockRejectedValueOnce(new NotFoundException('Contact was not found'));
    await expect(execution.execute('user-a', {
      tool: 'create_note', input: { content: 'Private note', contactId: '00000000-0000-4000-8000-000000000001' }, confirmed: false,
    })).rejects.toThrow('Contact was not found');
    expect(notesService.createForUser).not.toHaveBeenCalled();
  });

  it('validates finance writes and keeps confirmation before execution', async () => {
    await expect(execution.execute('user-a', {
      tool: 'create_finance_transaction', input: { type: 'EXPENSE', amount: '12.50', currency: 'USD', title: 'Taxi' }, confirmed: false,
    })).resolves.toMatchObject({ status: 'confirmation_required', preview: { amount: '12.50', currency: 'USD' } });
    expect(financeToolsService.createFinanceTransactionForUser).not.toHaveBeenCalled();
    await expect(execution.execute('user-a', {
      tool: 'create_finance_transaction', input: { type: 'EXPENSE', amount: 'bad', currency: 'USD', title: 'Taxi' }, confirmed: false,
    })).rejects.toThrow('Invalid tool input');
  });

  it('registers Telegram search as read-only and send as confirmation-aware write without duplicate preview resolution', async () => {
    telegramIntegrationService.search.mockResolvedValue([{ peerId: '-1001234567890' }]);
    telegramIntegrationService.prepareTelegramMessage.mockResolvedValue({ recipient: { peerId: '-1001234567890', displayName: 'Aziz' }, text: 'Hello', confirmationRequired: true });
    telegramIntegrationService.sendMessage.mockResolvedValue({ messageId: '7', recipient: { peerId: '-1001234567890', displayName: 'Aziz', type: 'USER' } });

    expect(registry.get('search_telegram_chats')).toMatchObject({ sideEffect: 'READ', requiresConfirmation: false });
    await expect(execution.execute('user-a', { tool: 'send_telegram_message', input: { peerId: '-1001234567890', text: 'Hello' }, confirmed: false })).resolves.toMatchObject({ status: 'confirmation_required' });
    expect(telegramIntegrationService.prepareTelegramMessage).toHaveBeenCalledTimes(1);
    expect(telegramIntegrationService.sendMessage).not.toHaveBeenCalled();

    await expect(execution.execute('user-a', { tool: 'send_telegram_message', input: { peerId: '-1001234567890', text: 'Hello' }, confirmed: true })).resolves.toMatchObject({ status: 'success', data: { messageId: '7' } });
    expect(telegramIntegrationService.prepareTelegramMessage).toHaveBeenCalledTimes(1);
    expect(telegramIntegrationService.sendMessage).toHaveBeenCalledWith('user-a', '-1001234567890', 'Hello');
  });

  it('registers Google reads without confirmation and Calendar writes with confirmation', async () => {
    googleCalendarService.list.mockResolvedValue([{ id: 'event-1' }]);
    expect(registry.get('get_google_calendar_events')).toMatchObject({ sideEffect: 'READ', requiresConfirmation: false });
    await expect(execution.execute('user-a', { tool: 'get_google_calendar_events', input: { from: '2026-08-26T09:00:00Z', to: '2026-08-26T10:00:00Z' }, confirmed: false })).resolves.toMatchObject({ status: 'success', data: [{ id: 'event-1' }] });
    expect(googleCalendarService.list).toHaveBeenCalled();
    expect(registry.get('create_google_calendar_event')).toMatchObject({ sideEffect: 'WRITE', requiresConfirmation: true });
    await expect(execution.execute('user-a', { tool: 'create_google_calendar_event', input: { title: 'Demo', start: '2026-08-26T09:00:00Z', end: '2026-08-26T10:00:00Z' }, confirmed: false })).resolves.toMatchObject({ status: 'confirmation_required' });
    expect(googleCalendarService.create).not.toHaveBeenCalled();
  });
  it('remembers a stated contact fact without another confirmation, while deletion still requires one', async () => {
    memoryService.createForUser.mockResolvedValue({ id: 'memory-a', key: 'sardor.role', value: 'Sardor is my marketer' });
    const result = await execution.execute('user-a', { tool: 'save_memory', input: { type: 'CONTACT', key: 'sardor.role', value: 'Sardor is my marketer' }, confirmed: false });
    expect(result.status).toBe('success');
    expect(memoryService.createForUser).toHaveBeenCalledWith('user-a', expect.objectContaining({ key: 'sardor.role', source: 'AI_USER_STATED', isVerified: true }));
    expect(registry.get('delete_memory').requiresConfirmation).toBe(true);
  });
  it('normalizes the exact finance payload before showing its preview', async () => {
    const result = await execution.execute('user-a', { tool: 'create_finance_transaction', input: { type: 'daromad', amount: '500 min', currency: 'UZS', title: 'Daromad', transactionDate: '01.09.2026' }, confirmed: false }, { timezone: 'Asia/Tashkent' });
    expect(result).toMatchObject({ status: 'confirmation_required', input: { amount: '500000', transactionDate: '2026-08-31T19:00:00.000Z' }, preview: { amount: '500000', transactionDate: '2026-08-31T19:00:00.000Z' } });
    expect(financeToolsService.createFinanceTransactionForUser).not.toHaveBeenCalled();
  });

});
