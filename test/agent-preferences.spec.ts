import { AgentSettingsService } from '../src/agent-settings/agent-settings.service';
import { MessagesService } from '../src/messages/messages.service';

describe('account AI preferences and history privacy', () => {
  it('persists behavior flags per account and survives a later read', async () => {
    let saved: any;
    const prisma = { agentPreference: { findUnique: jest.fn(async () => saved), upsert: jest.fn(async ({ create, update }: any) => (saved = saved ? { ...saved, ...update } : { id: 'pref', ...create })) } };
    const service = new AgentSettingsService(prisma as any, { record: jest.fn().mockResolvedValue(undefined) } as any);
    await service.upsertForUser('owner', { saveHistory: false, voiceReply: false, confirmExternalActions: false, replyLength: 'Qisqa', replyStyle: 'Sodda' });
    expect(await service.getForUser('owner')).toMatchObject({ userId: 'owner', saveHistory: false, voiceReply: false, confirmExternalActions: false, replyLength: 'Qisqa', replyStyle: 'Sodda' });
    expect(prisma.agentPreference.findUnique).toHaveBeenCalledWith({ where: { userId: 'owner' } });
  });
  it('does not report failure after a successful preference write when audit logging fails', async () => {
    const service = new AgentSettingsService({ agentPreference: { upsert: jest.fn().mockResolvedValue({ id: 'pref', saveHistory: false }) } } as any, { record: jest.fn().mockRejectedValue(new Error('offline')) } as any);
    expect(await service.upsertForUser('owner', { saveHistory: false })).toMatchObject({ saveHistory: false });
  });
  it('legacy message writes cannot bypass temporary conversation privacy', async () => {
    const prisma = { conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'temporary', isTemporary: true }) }, $transaction: jest.fn() };
    const service = new MessagesService(prisma as any);
    await expect(service.createForConversation('owner', 'temporary', { content: 'Private text' })).rejects.toThrow('Temporary');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
