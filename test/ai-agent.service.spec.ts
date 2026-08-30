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
  let service: AiAgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiAgentService(prisma, provider, registry, execution, usage, subscriptions, activityLog);
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
});
