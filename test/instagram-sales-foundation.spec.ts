import { InstagramCommentMatcherService } from '../src/instagram/instagram-comment-matcher.service';
import { InstagramIntegrationService } from '../src/instagram/instagram-integration.service';
import { InstagramCommentPollerService } from '../src/instagram/instagram-comment-poller.service';
import { InstagramSalesAgentService } from '../src/instagram/instagram-sales-agent.service';
import { SalesProductKnowledgeService } from '../src/ai-agent/sales-product-knowledge.service';

describe('Instagram sales foundation', () => {
  it('matches common comment trigger typos without spending an AI call', async () => {
    const provider = { complete: jest.fn() };
    const usage = { logTextUsage: jest.fn() };
    const matcher = new InstagramCommentMatcherService(provider as never, usage as never);

    await expect(matcher.matches('u', 'promt', 'prompt', true)).resolves.toBe(true);
    await expect(matcher.matches('u', 'menga ham prompt', 'prompt', true)).resolves.toBe(true);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('stores a comment automation only against a real Instagram post', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'a1', mediaId: 'm1' });
    const prisma = { instagramCommentAutomation: { create } };
    const graph = {
      configured: () => true,
      getMedia: jest.fn().mockResolvedValue({ id: 'm1', caption: 'Prompt post', permalink: 'https://instagram.com/p/x' }),
    };
    const service = new InstagramIntegrationService(prisma as never, graph as never, {} as never);

    await service.createAutomation('u', {
      mediaId: 'm1', triggerText: 'prompt', dmMessage: 'Mana promptingiz', semanticMatch: true,
    });

    expect(graph.getMedia).toHaveBeenCalledWith('u', 'm1');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u', mediaId: 'm1', mediaCaption: 'Prompt post', triggerText: 'prompt', dmMessage: 'Mana promptingiz' }),
    }));
  });

  it('pauses and resumes an existing comment automation without replacing unrelated fields', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'a1', active: false });
    const prisma = {
      instagramCommentAutomation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
        update,
      },
    };
    const service = new InstagramIntegrationService(prisma as never, {} as never, {} as never);

    await service.updateAutomation('u', 'a1', { active: false });

    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { active: false } });
  });

  it('routes recent development-polled comments through the canonical Instagram sales handler', async () => {
    const now = new Date().toISOString();
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig' }]),
      },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const graph = {
      listMedia: jest.fn().mockResolvedValue([{ id: 'm1' }]),
      listMediaComments: jest.fn().mockResolvedValue([
        { id: 'c1', mediaId: 'm1', text: 'promt', commenterId: 'customer-1', username: 'buyer', timestamp: now },
        { id: 'c2', mediaId: 'm1', text: 'self', commenterId: 'owner-ig', username: 'owner', timestamp: now },
      ]),
    };
    const sales = { handlePolledComment: jest.fn().mockResolvedValue(undefined) };
    const poller = new InstagramCommentPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(sales.handlePolledComment).toHaveBeenCalledTimes(1);
    expect(sales.handlePolledComment).toHaveBeenCalledWith('u', expect.objectContaining({ commentId: 'c1', mediaId: 'm1', text: 'promt' }));
  });

  it('releases both comment receipts when automation delivery fails so a poll/webhook retry is not dropped forever', async () => {
    const instagramReceiptDelete = jest.fn().mockResolvedValue({ count: 1 });
    const salesReceiptDelete = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      instagramCommentAutomation: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'a1', triggerText: 'prompt', semanticMatch: true, mediaCaption: null,
          sendPrivateReply: true, dmMessage: 'Mana promptingiz', replyPublicly: false, publicReply: null,
        }]),
      },
      instagramAutomationReceipt: {
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        deleteMany: instagramReceiptDelete,
      },
      salesInboundReceipt: { deleteMany: salesReceiptDelete },
    };
    const graph = {
      privateReplyToComment: jest.fn().mockRejectedValue(new Error('META_TEMPORARY')),
      replyToComment: jest.fn(),
      safeId: jest.fn(() => 'safe'),
      errorCode: jest.fn(() => 'META_TEMPORARY'),
    };
    const matcher = { matches: jest.fn().mockResolvedValue(true) };
    const service = new InstagramSalesAgentService(prisma as never, graph as never, {} as never, {} as never, {} as never, matcher as never);
    const event = { commentId: 'c1', commenterId: 'customer-1', username: 'buyer', text: 'promt', mediaId: 'm1' };

    await (service as any).runCommentAutomations('u', event);

    expect(instagramReceiptDelete).toHaveBeenCalledWith({ where: { userId: 'u', automationId: 'a1', commentId: 'c1' } });
    expect(salesReceiptDelete).toHaveBeenCalledWith({
      where: { channel: 'INSTAGRAM', userId: 'u', peerId: 'comment:customer-1', messageId: 'c1' },
    });
  });

  it('finds owner-taught off-Bito products by alias/family instead of requiring an exact name', async () => {
    const prisma = {
      salesProductKnowledge: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'k1', canonicalName: 'iPhone 13 Pro 128GB qora', productFamily: 'iPhone',
            aliases: ['ayfon 13 pro', '13 por'], description: 'Qora rang, 128 GB', publicPrice: { toString: () => '4800000' },
            currency: 'UZS', availability: 'AVAILABLE', stockQuantity: { toString: () => '2' }, unit: 'dona',
            attributes: ['128GB', 'qora'], note: null,
          },
        ]),
      },
    };
    const service = new SalesProductKnowledgeService(prisma as never);
    const results = await service.search('u', 'ayfon 13 por', 10);
    expect(results[0]).toMatchObject({ name: 'iPhone 13 Pro 128GB qora', availability: 'AVAILABLE' });
    expect(results[0].score).toBeGreaterThanOrEqual(0.72);
  });

  it('enables the Instagram sales agent on a successful fresh connection', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        upsert,
        findUnique: jest.fn().mockResolvedValue({
          status: 'CONNECTED', instagramUserId: '12345', username: 'shop', displayName: null,
          profilePictureUrl: null, webhookSubscribed: true, salesAgentEnabled: true,
          dmEnabled: true, commentsEnabled: true, imageVisionEnabled: true,
          connectedAt: new Date(), lastValidatedAt: new Date(), lastErrorCode: null,
        }),
      },
    };
    const graph = {
      configured: jest.fn(() => true), oauthReady: jest.fn(() => true),
      verifyProfile: jest.fn().mockResolvedValue({ id: '12345', username: 'shop', name: null, profilePictureUrl: null }),
      subscribeWebhooks: jest.fn().mockResolvedValue(true),
    };
    const crypto = { encrypt: jest.fn(() => 'encrypted') };
    const service = new InstagramIntegrationService(prisma as never, graph as never, crypto as never);

    await service.connect('u', { instagramUserId: '12345', accessToken: 'x'.repeat(30) });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ salesAgentEnabled: true }),
      update: expect.objectContaining({ salesAgentEnabled: true }),
    }));
  });

});
