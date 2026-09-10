import { AiAgentService } from '../src/ai-agent/ai-agent.service';
import { BITO_INVENTORY_TOOL_NAME } from '../src/bito/bito-tool-bridge.service';

describe('Bito chat orchestration (mock provider/ERP)', () => {
  let prisma: any, provider: any, execution: any, bridge: any, service: AiAgentService;
  const inventory = { name: BITO_INVENTORY_TOOL_NAME, description: 'Inventory', sideEffect: 'READ', requiresConfirmation: false, parameters: { type: 'object', properties: {} } };
  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ language: 'uz', timezone: 'Asia/Tashkent', memoryEnabled: false }) },
      agentPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'c' }), update: jest.fn().mockResolvedValue({}) },
      message: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      pendingAgentAction: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    provider = { complete: jest.fn().mockResolvedValue({ message: { role: 'assistant', content: 'Cola — 12 dona.' }, model: 'fixture', usage: {} }) };
    execution = { execute: jest.fn().mockResolvedValue({ status: 'success', data: { source: 'BITO', complete: true, productCount: 78, stockPositionCount: 46, items: [{ name: 'Cola', quantity: 12, unit: 'dona' }] } }) };
    bridge = { listModelTools: jest.fn().mockResolvedValue([inventory, { ...inventory, name: 'bito__get_sales' }, { ...inventory, name: 'bito__get_profit' }]) };
    const registry = { getToolDefinitionsForModel: () => ['search_files', 'search_google_drive_files', 'get_today_finance', 'bito_connection_status'].map(name => ({ name, description: name, inputSchema: {} })) };
    service = new AiAgentService(prisma, provider, registry as any, execution, { logToolUsage: jest.fn().mockResolvedValue({}), logTextUsage: jest.fn().mockResolvedValue({}) } as any, { assertAiAllowed: jest.fn() } as any, { record: jest.fn().mockResolvedValue({}) } as any, bridge);
  });
  it.each(['Omborda nimalar bor?', 'Bitoda qidir omborda nimalar bor', 'Omborda nechta mahsulot bor?', 'Cola qancha qoldi?'])('prefetches inventory without file tools or confirmation: %s', async message => {
    const result = await service.chat('u', { conversationId: 'c', message });
    expect(execution.execute).toHaveBeenCalledWith('u', expect.objectContaining({ tool: BITO_INVENTORY_TOOL_NAME, confirmed: false }), expect.anything());
    expect(result.pendingConfirmation).toBeNull();
    const [messages, tools] = provider.complete.mock.calls[0];
    expect(messages.some((item: any) => item.role === 'tool' && item.content.includes('"quantity":12'))).toBe(true);
    expect(tools.map((tool: any) => tool.function.name)).not.toEqual(expect.arrayContaining(['search_files']));
    expect(tools.map((tool: any) => tool.function.name)).not.toEqual(expect.arrayContaining(['search_google_drive_files']));
    expect(tools.map((tool: any) => tool.function.name)).not.toEqual(expect.arrayContaining(['bito__get_sales', 'bito__get_profit']));
  });
  it.each(['Bugungi savdo qancha?', 'Bugungi foyda qancha?'])('requires a real Bito read for %s', async message => {
    await service.chat('u', { conversationId: 'c', message });
    const call = provider.complete.mock.calls[0];
    expect(call[4]).toBe('required');
    expect(call[1].every((tool: any) => tool.function.name.startsWith('bito__'))).toBe(true);
  });
  it.each(['Hammasini chiqar', '46 tasini chiqar'])('refetches from prior inventory even if the old response failed: %s', async message => {
    prisma.message.findMany.mockResolvedValue([
      { role: 'USER', content: message },
      { role: 'ASSISTANT', content: 'Bir dona natija.' },
      { role: 'TOOL', content: JSON.stringify({ source: 'BITO', intent: 'inventory', complete: false, tool: BITO_INVENTORY_TOOL_NAME }) },
      { role: 'USER', content: 'Omborda nimalar bor?' },
    ]);
    await service.chat('u', { conversationId: 'c', message });
    expect(execution.execute).toHaveBeenCalledWith('u', expect.objectContaining({ tool: BITO_INVENTORY_TOOL_NAME, input: { includeZero: true } }), expect.anything());
  });
  it('does not turn a sales follow-up into inventory', async () => {
    prisma.message.findMany.mockResolvedValue([{ role: 'USER', content: 'Hammasini chiqar' }, { role: 'USER', content: 'Bugungi savdo qancha?' }]);
    await service.chat('u', { conversationId: 'c', message: 'Hammasini chiqar' });
    expect(execution.execute).not.toHaveBeenCalled();
    expect(provider.complete.mock.calls[0][4]).toBe('required');
  });
  it('returns an honest disconnected answer without guessing or calling files', async () => {
    bridge.listModelTools.mockRejectedValue(new Error('BITO_NOT_CONNECTED'));
    const result = await service.chat('u', { conversationId: 'c', message: 'Omborda nimalar bor?' });
    expect(result.message).toContain('Bito ulanmagan');
    expect(provider.complete).not.toHaveBeenCalled();
    expect(execution.execute).not.toHaveBeenCalled();
  });
  it('returns a safe inventory error and preserves incomplete context', async () => {
    execution.execute.mockRejectedValue(new Error('BITO_MAPPING_FAILED secret-token'));
    const result = await service.chat('u', { conversationId: 'c', message: 'Omborda nimalar bor?' });
    expect(result.message).toContain('ma’lumotni hozir olib bo‘lmadi');
    expect(result.message).not.toContain('secret-token');
    expect(prisma.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({ role: 'TOOL', content: expect.stringContaining('"complete":false') }) });
  });
  it('never falls back to model-selected sales when no inventory route is verified', async () => {
    bridge.listModelTools.mockResolvedValue([{ ...inventory, name: 'bito__report_sales_by_item_pagin' }]);
    execution.execute.mockRejectedValue(new Error('BITO_INVENTORY_TOOLS_UNAVAILABLE'));
    const result = await service.chat('u', { conversationId: 'c', message: 'Omborda nimalar bor?' });
    expect(execution.execute).toHaveBeenCalledTimes(1);
    expect(execution.execute.mock.calls[0][1].tool).toBe(BITO_INVENTORY_TOOL_NAME);
    expect(provider.complete).not.toHaveBeenCalled();
    expect(result.pendingConfirmation).toBeNull();
  });
  it('rejects unadvertised sales/file/write calls returned by the model during inventory', async () => {
    provider.complete.mockResolvedValueOnce({ message: { role: 'assistant', content: null, tool_calls: ['bito__get_sales', 'search_files', 'bito__create_order'].map((name, id) => ({ id: String(id), type: 'function', function: { name, arguments: '{}' } })) }, model: 'fixture', usage: {} });
    const result = await service.chat('u', { conversationId: 'c', message: 'Omborda nimalar bor?' });
    expect(execution.execute).toHaveBeenCalledTimes(1);
    expect(result.pendingConfirmation).toBeNull();
  });
});
