import { AgentActionStatus } from '@prisma/client';
import { AiAgentService } from '../src/ai-agent/ai-agent.service';

describe('AiAgentService', () => {
  const prisma = {
    pendingAgentAction: { updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    message: { findFirst: jest.fn(), create: jest.fn() },
    conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    userMemory: { findMany: jest.fn() },
  } as any;
  const provider = { configured: jest.fn(), complete: jest.fn() } as any;
  const registry = { getToolDefinitionsForModel: jest.fn().mockReturnValue([]) } as any;
  const execution = { execute: jest.fn() } as any;
  const usage = { logTextUsage: jest.fn(), logToolUsage: jest.fn() } as any;
  const subscriptions = { assertAiAllowed: jest.fn() } as any;
  const activityLog = { record: jest.fn() } as any;
  const productKnowledge = { search: jest.fn().mockResolvedValue([]) } as any;
  let service: AiAgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiAgentService(prisma, provider, registry, execution, usage, subscriptions, activityLog, { listRelevantModelTools: jest.fn().mockResolvedValue([]) } as any, productKnowledge);
  });

  describe('expireStale', () => {
    it('moves PENDING-and-overdue actions to EXPIRED and reports the count', async () => {
      prisma.pendingAgentAction.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.expireStale();
      expect(result).toBe(3);
      expect(prisma.pendingAgentAction.updateMany).toHaveBeenCalledWith({
        where: { status: AgentActionStatus.PENDING, expiresAt: { lt: expect.any(Date) } },
        data: { status: AgentActionStatus.EXPIRED },
      });
    });
  });

  describe('listForUser', () => {
    it('scopes the query to the requesting user only, never another user\'s actions', async () => {
      prisma.pendingAgentAction.findMany.mockResolvedValue([]);
      prisma.pendingAgentAction.count.mockResolvedValue(0);
      await service.listForUser('user-a', { page: 1, limit: 20 } as any);
      expect(prisma.pendingAgentAction.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-a', status: undefined },
      }));
      expect(prisma.pendingAgentAction.count).toHaveBeenCalledWith({ where: { userId: 'user-a', status: undefined } });
    });

    it('filters by status when provided', async () => {
      prisma.pendingAgentAction.findMany.mockResolvedValue([]);
      prisma.pendingAgentAction.count.mockResolvedValue(0);
      await service.listForUser('user-a', { page: 1, limit: 20, status: AgentActionStatus.PENDING } as any);
      expect(prisma.pendingAgentAction.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-a', status: AgentActionStatus.PENDING },
      }));
    });
  });

  describe('confirm', () => {
    it('rejects confirming an action that does not belong to the requesting user', async () => {
      prisma.pendingAgentAction.findFirst.mockResolvedValue(null);
      await expect(service.confirm('user-b', 'action-owned-by-user-a', true)).rejects.toThrow();
      expect(prisma.pendingAgentAction.findFirst).toHaveBeenCalledWith({ where: { id: 'action-owned-by-user-a', userId: 'user-b' } });
    });

    it('cannot execute the same action twice: the second concurrent claim loses the race', async () => {
      prisma.pendingAgentAction.findFirst.mockResolvedValue({
        id: 'action-1', userId: 'user-a', status: AgentActionStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000), toolName: 'create_task', input: {}, idempotencyKey: 'key-1', conversationId: null,
      });
      prisma.pendingAgentAction.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.confirm('user-a', 'action-1', true)).rejects.toThrow();
      expect(execution.execute).not.toHaveBeenCalled();
    });
  });

  describe('product capability surface', () => {
    it('keeps WhatsApp and Instagram out of the active owner AI capability prompt', () => {
      const prompt = (service as any).systemPrompt(
        { firstName: 'Owner', lastName: 'Test', timezone: 'Asia/Tashkent', language: 'uz', memoryEnabled: true },
        [],
        null,
      ) as string;

      expect(prompt).toContain('Hozir faol sotuv kanali — Telegram Sales Agent');
      expect(prompt).toContain('WhatsApp va Instagram product sifatida vaqtincha to‘xtatilgan');
      expect(prompt).not.toContain('INSTAGRAM SALES BOSHQARUVI');
      expect(prompt).not.toContain('Telegram, WhatsApp va Instagram sales agent uchun biznes playbook');
      expect(prompt).not.toContain('Telegram/WhatsApp sales agent ishlatadigan Business Sales Profile');
    });

    it('never exposes paused WhatsApp or Instagram tools to the owner AI selector', () => {
      registry.getToolDefinitionsForModel.mockReturnValueOnce([
        { name: 'get_instagram_sales_settings' },
        { name: 'update_instagram_sales_settings' },
        { name: 'send_whatsapp_message' },
        { name: 'create_task' },
      ]);

      const selected = (service as any).selectToolsForMessage('Instagram sotuv agentini yoq va WhatsApp xabar yubor', true, []) as Set<string>;
      expect([...selected]).not.toEqual(expect.arrayContaining([
        'get_instagram_sales_settings',
        'update_instagram_sales_settings',
        'send_whatsapp_message',
      ]));
    });
  });

  describe('new external sales privacy classifier', () => {
    it('keeps a greeting eligible for the professional inbox when semantic AI is temporarily unavailable', async () => {
      provider.complete.mockRejectedValueOnce(new Error('provider down'));
      await expect(service.classifyNewExternalSalesTurn('user-a', 'Salom')).resolves.toMatchObject({ sales: true });
    });

    it('does not convert an ambiguous general DM into a customer when semantic AI is temporarily unavailable', async () => {
      provider.complete.mockRejectedValueOnce(new Error('provider down'));
      await expect(service.classifyNewExternalSalesTurn('user-a', 'kanalga reklama tashlab ber')).resolves.toMatchObject({ sales: false });
      provider.complete.mockRejectedValueOnce(new Error('provider down'));
      await expect(service.classifyNewExternalSalesTurn('user-a', 'ha')).resolves.toMatchObject({ sales: false });
    });

    it('does not convert a semantic GENERAL or ACKNOWLEDGEMENT turn into a new customer', async () => {
      const semantic = (intent: string) => ({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'understand_sales_turn', arguments: JSON.stringify({
            intent, topicSwitch: false, followUp: false, needsCatalogLookup: false, catalogScope: 'NONE',
            clearUnavailableSelection: false, businessFactRequest: 'NONE', answerGoal: 'classify opening',
          }) } }],
        },
        model: 'fixture',
        usage: {},
      });
      provider.complete.mockResolvedValueOnce(semantic('GENERAL'));
      await expect(service.classifyNewExternalSalesTurn('user-a', 'kanalga reklama tashlab ber')).resolves.toMatchObject({ sales: false, intent: 'GENERAL' });
      provider.complete.mockResolvedValueOnce(semantic('ACKNOWLEDGEMENT'));
      await expect(service.classifyNewExternalSalesTurn('user-a', 'ha')).resolves.toMatchObject({ sales: false, intent: 'ACKNOWLEDGEMENT' });
    });

    it('allows a semantic GREETING to open a professional non-contact inbox thread', async () => {
      provider.complete.mockResolvedValueOnce({
        message: {
          role: 'assistant', content: '',
          tool_calls: [{ function: { name: 'understand_sales_turn', arguments: JSON.stringify({
            intent: 'GREETING', topicSwitch: false, followUp: false, needsCatalogLookup: false, catalogScope: 'NONE',
            clearUnavailableSelection: false, businessFactRequest: 'NONE', answerGoal: 'greet naturally',
          }) } }],
        },
        model: 'fixture', usage: {},
      });
      await expect(service.classifyNewExternalSalesTurn('user-a', 'Salom')).resolves.toMatchObject({ sales: true, intent: 'GREETING' });
    });
  });

});
