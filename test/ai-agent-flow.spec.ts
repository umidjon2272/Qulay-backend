import { BadRequestException } from '@nestjs/common';
import { AiAgentService } from '../src/ai-agent/ai-agent.service';

describe('AI conversation to durable action flow', () => {
  let prisma: any, provider: any, execution: any, service: AiAgentService, actions: any[];
  const user = { firstName: 'Test', lastName: 'User', language: 'uz', timezone: 'Asia/Tashkent', memoryEnabled: true };
  const toolCall = (name: string, input: unknown) => ({ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', function: { name, arguments: JSON.stringify(input) } }] }, model: 'test', usage: { inputTokens: 1, outputTokens: 1 } });
  beforeEach(() => {
    actions = [];
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) }, userMemory: { findMany: jest.fn().mockResolvedValue([]) },
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conversation-1' }), update: jest.fn().mockResolvedValue({}) },
      message: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([{ role: 'USER', content: 'bugunga 500 min daromad qush' }]) },
      notification: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      pendingAgentAction: {
        findFirst: jest.fn(async ({ where }: any) => actions.find(a => where.id ? a.id === where.id && a.userId === where.userId : a.userId === where.userId && a.conversationId === where.conversationId && a.status === where.status) ?? null),
        create: jest.fn(async ({ data }: any) => { const action = { id: 'action-1', status: 'PENDING', ...data }; actions.push(action); return action; }),
        update: jest.fn(async ({ where, data }: any) => Object.assign(actions.find(a => a.id === where.id), data)),
        updateMany: jest.fn(async ({ where, data }: any) => { let count = 0; for (const a of actions) if ((!where.id || a.id === where.id) && a.userId === where.userId && a.status === where.status) { Object.assign(a, data); count++; } return { count }; }),
      },
    };
    provider = { complete: jest.fn() }; execution = { execute: jest.fn() };
    service = new AiAgentService(prisma, provider, { getToolDefinitionsForModel: () => [] } as any, execution, { logTextUsage: jest.fn().mockResolvedValue({}), logToolUsage: jest.fn().mockResolvedValue({}) } as any, { assertAiAllowed: jest.fn(), assertToolAllowed: jest.fn() } as any, { record: jest.fn().mockResolvedValue({}) } as any);
  });
  it('prepares normalized finance once, accepts ha without another model call, and prevents repeat execution', async () => {
    provider.complete.mockResolvedValue(toolCall('create_finance_transaction', { type: 'INCOME', amount: '500 min', transactionDate: 'bugun' }));
    const normalized = { type: 'INCOME', amount: '500000', currency: 'UZS', title: 'Daromad', transactionDate: '2026-08-31T19:00:00Z' };
    execution.execute.mockResolvedValueOnce({ status: 'confirmation_required', input: normalized, preview: normalized }).mockResolvedValue({ status: 'success', data: { id: 'finance-1' } });
    const prepared = await service.chat('user-a', { conversationId: 'conversation-1', message: 'bugunga 500 min daromad qush' });
    expect(prepared.pendingConfirmation?.id).toBe('action-1');
    expect(actions[0].input).toEqual(normalized);
    const result = await service.chat('user-a', { conversationId: 'conversation-1', message: 'ha' });
    expect(result.pendingConfirmation).toBeNull();
    expect(result.message.replace(/\s/g, ' ')).toContain('500 000');
    expect(result.message).toContain('daromad qo‘shildi');
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(execution.execute).toHaveBeenLastCalledWith('user-a', expect.objectContaining({ confirmed: true, input: normalized }), { locale: 'uz', timezone: 'Asia/Tashkent' });
    await service.confirm('user-a', 'action-1', true);
    expect(execution.execute).toHaveBeenCalledTimes(2);
    expect(actions[0].status).toBe('EXECUTED');
  });
  it('returns one recipient-specific result and reuses it without sending Telegram twice', async () => {
    actions.push({ id: 'telegram-action', userId: 'user-a', conversationId: 'conversation-1', status: 'PENDING', expiresAt: new Date(Date.now() + 60000), input: { peerId: 'user:1', text: 'Salom' }, preview: { recipient: 'Aziz (@aziz)', text: 'Salom' }, toolName: 'send_telegram_message', idempotencyKey: 'telegram-key' });
    execution.execute.mockResolvedValue({ status: 'success', data: { messageId: 'message-1' } });
    const first = await service.confirm('user-a', 'telegram-action', true);
    const replay = await service.confirm('user-a', 'telegram-action', true);
    expect(first.message).toBe('Aziz (@aziz)ga xabar yuborildi.');
    expect(replay).toMatchObject({ message: first.message, alreadyExecuted: true });
    expect(execution.execute).toHaveBeenCalledTimes(1);
  });
  it('takes recent history and supports normal advice without tools or confirmation', async () => {
    provider.complete.mockResolvedValue({ message: { role: 'assistant', content: 'Reklamani kichik auditoriyada sinang.' }, model: 'test', usage: { inputTokens: 1, outputTokens: 1 } });
    await service.chat('user-a', { conversationId: 'conversation-1', message: 'reklamani qanday yaxshilay' });
    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }));
    const prompt = provider.complete.mock.calls[0][0][0].content;
    expect(prompt).toContain('Asia/Tashkent'); expect(prompt).toContain('Bugun=');
    expect(execution.execute).not.toHaveBeenCalled();
  });
  it('reads all-time totals even when the model tries to answer without a tool', async () => {
    execution.execute.mockResolvedValue({status:'success',data:{period:'ALL_TIME',byCurrency:[{currency:'UZS',totalIncome:'500000.00'}]}});
    provider.complete.mockResolvedValue({ message:{role:'assistant',content:'Barcha davr: 500 000 so‘m.'},model:'test',usage:{inputTokens:1,outputTokens:1} });
    await service.chat('user-a',{conversationId:'conversation-1',message:'obshi daromad qancha bold'});
    expect(execution.execute).toHaveBeenCalledWith('user-a',expect.objectContaining({tool:'get_all_time_finance',input:{},confirmed:false}),expect.anything());
    expect(JSON.stringify(provider.complete.mock.calls[0][0])).toContain('500000.00');
  });
  it('does not report no income when the all-time database read fails', async () => {
    execution.execute.mockRejectedValue(new Error('offline'));
    const result = await service.chat('user-a',{conversationId:'conversation-1',message:'umumiy daromad qancha'});
    expect(result.message).toContain('yozuvlari yo‘q degani emas');
    expect(provider.complete).not.toHaveBeenCalled();
  });
  it('gives the model field-level validation errors so it can fix input instead of asking the same question', async () => {
    provider.complete.mockResolvedValueOnce(toolCall('create_finance_transaction', { amount: 'bad' })).mockResolvedValueOnce({ message: { role: 'assistant', content: 'Summa qancha?' }, model: 'test', usage: { inputTokens: 1, outputTokens: 1 } });
    execution.execute.mockRejectedValue(new BadRequestException({ message: 'Invalid tool input', errors: ['amount: amount must be a number string'] }));
    await service.chat('user-a', { conversationId: 'conversation-1', message: 'daromad qush' });
    expect(JSON.stringify(provider.complete.mock.calls[1][0])).toContain('amount must be a number string');
  });
  it('does not execute an ambiguous spoken correction', async () => {
    actions.push({ id: 'a', userId: 'user-a', conversationId: 'conversation-1', status: 'PENDING', expiresAt: new Date(Date.now() + 60000), input: {}, toolName: 'send_telegram_message' });
    provider.complete.mockResolvedValue({ message: { role: 'assistant', content: 'Qaysi Sardor?' }, model: 'test', usage: { inputTokens: 1, outputTokens: 1 } });
    await service.chat('user-a', { conversationId: 'conversation-1', message: 'ha lekin Sardorga yuborma' });
    expect(execution.execute).not.toHaveBeenCalled(); expect(actions[0].status).toBe('PENDING');
  });
  it('claims one write when two confirmation requests arrive together', async () => {
    actions.push({ id: 'a', userId: 'user-a', conversationId: 'conversation-1', status: 'PENDING', expiresAt: new Date(Date.now() + 60000), input: { amount: '500000' }, toolName: 'create_finance_transaction', idempotencyKey: 'unique' });
    execution.execute.mockResolvedValue({ status: 'success', data: { id: 'one-record' } });
    const outcomes = await Promise.allSettled([service.confirm('user-a', 'a', true), service.confirm('user-a', 'a', true)]);
    expect(outcomes.some(outcome => outcome.status === 'fulfilled')).toBe(true);
    expect(execution.execute).toHaveBeenCalledTimes(1);
    expect(actions[0].status).toBe('EXECUTED');
  });
  it('never retries completed batch steps when a later write fails', async () => {
    actions.push({ id: 'a', userId: 'user-a', conversationId: 'conversation-1', status: 'PENDING', expiresAt: new Date(Date.now() + 60000), input: { actions: [{ toolName: 'create_finance_transaction', input: {} }, { toolName: 'send_telegram_message', input: {} }] }, toolName: '__batch__', idempotencyKey: 'unique' });
    execution.execute.mockResolvedValueOnce({ status: 'success', data: { id: 'record' } }).mockRejectedValueOnce(new Error('transport unavailable'));
    const result = await service.confirm('user-a', 'a', true);
    expect(result).toMatchObject({ status: 'failed', completedCount: 1 });
    await expect(service.confirm('user-a', 'a', true)).rejects.toThrow();
    expect(execution.execute).toHaveBeenCalledTimes(2);
    expect(actions[0].errorCode).toBe('PARTIAL_EXECUTION');
  });

});
