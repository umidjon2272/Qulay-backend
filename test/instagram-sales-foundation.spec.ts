import { InstagramCommentMatcherService } from '../src/instagram/instagram-comment-matcher.service';
import { InstagramIntegrationService } from '../src/instagram/instagram-integration.service';
import { InstagramCommentPollerService } from '../src/instagram/instagram-comment-poller.service';
import { InstagramDmPollerService } from '../src/instagram/instagram-dm-poller.service';
import { parseInstagramMediaComments } from '../src/instagram/instagram-comment-parser';
import { parseInstagramConversationMessages } from '../src/instagram/instagram-dm-parser';
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
    const upsert = jest.fn().mockResolvedValue({ id: 'a1', mediaId: 'm1' });
    const prisma = { instagramCommentAutomation: { upsert } };
    const graph = {
      configured: () => true,
      getMedia: jest.fn().mockResolvedValue({ id: 'm1', caption: 'Prompt post', permalink: 'https://instagram.com/p/x' }),
    };
    const service = new InstagramIntegrationService(prisma as never, graph as never, {} as never);

    await service.createAutomation('u', {
      mediaId: 'm1', triggerText: 'prompt', dmMessage: 'Mana promptingiz', semanticMatch: true,
    });

    expect(graph.getMedia).toHaveBeenCalledWith('u', 'm1');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'u', mediaId: 'm1', mediaCaption: 'Prompt post', triggerText: 'prompt', triggerKey: 'prompt', dmMessage: 'Mana promptingiz' }),
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

  it('does not advance the Instagram comment poll cursor when a new comment fails to route', async () => {
    const cursor = new Date(Date.now() - 60_000);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig', commentPollCursorAt: cursor }]),
        update,
      },
      instagramCommentAutomation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const now = new Date().toISOString();
    const graph = {
      listMedia: jest.fn().mockResolvedValue([{ id: 'm1' }]),
      listMediaComments: jest.fn().mockResolvedValue([{ id: 'c1', mediaId: 'm1', text: 'narx', commenterId: 'buyer', username: 'buyer', timestamp: now }]),
    };
    const sales = { handlePolledComment: jest.fn().mockResolvedValue(false) };
    const poller = new InstagramCommentPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { commentPollCursorAt: expect.any(Date) } }));
  });

  it('routes recent development-polled comments through the canonical Instagram sales handler', async () => {
    const now = new Date().toISOString();
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig', commentPollCursorAt: new Date(Date.now() - 60_000) }]),
        update: jest.fn().mockResolvedValue({}),
      },
      instagramCommentAutomation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const graph = {
      listMedia: jest.fn().mockResolvedValue([{ id: 'm1' }]),
      listMediaComments: jest.fn().mockResolvedValue([
        { id: 'c1', mediaId: 'm1', text: 'promt', commenterId: 'customer-1', username: 'buyer', timestamp: now },
        { id: 'c2', mediaId: 'm1', text: 'self', commenterId: 'owner-ig', username: 'owner', timestamp: now },
      ]),
    };
    const sales = { handlePolledComment: jest.fn().mockResolvedValue(true) };
    const poller = new InstagramCommentPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(sales.handlePolledComment).toHaveBeenCalledTimes(1);
    expect(sales.handlePolledComment).toHaveBeenCalledWith('u', expect.objectContaining({ commentId: 'c1', mediaId: 'm1', text: 'promt' }));
  });

  it('runs exact comment automation before AI credit gating so narx replies do not go silent', async () => {
    let receipt: any = null;
    const prisma = {
      salesInboundReceipt: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      instagramCommentAutomation: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'a1', triggerText: 'narx', semanticMatch: false, mediaCaption: null,
          sendPrivateReply: true, dmMessage: 'Salom', replyPublicly: true, publicReply: 'Directga yubordik',
        }]),
      },
      instagramAutomationReceipt: {
        findUnique: jest.fn(async () => receipt),
        create: jest.fn(async () => {
          receipt = { id: 'r1', privateSentAt: null, publicSentAt: null, completedAt: null, nextRetryAt: null, attemptCount: 0 };
          return receipt;
        }),
        update: jest.fn(async ({ data }: any) => { receipt = { ...receipt, ...data }; return receipt; }),
      },
    };
    const graph = {
      privateReplyToComment: jest.fn().mockResolvedValue('dm1'),
      replyToComment: jest.fn().mockResolvedValue('reply1'),
      safeId: jest.fn(() => 'safe'),
      errorCode: jest.fn(() => 'FAILED'),
    };
    const matcher = { matches: jest.fn().mockResolvedValue(true) };
    const subscriptions = {
      assertFeatureAllowed: jest.fn().mockResolvedValue(undefined),
      assertAiAllowed: jest.fn().mockRejectedValue(new Error('AI_CREDIT_BLOCKED')),
    };
    const service = new InstagramSalesAgentService(prisma as never, graph as never, {} as never, {} as never, subscriptions as never, matcher as never);

    await (service as any).handleComment('u', { commentId: 'c1', commenterId: 'buyer-1', username: 'buyer', text: 'narx', mediaId: 'm1' });

    expect(graph.privateReplyToComment).toHaveBeenCalledTimes(1);
    expect(graph.replyToComment).toHaveBeenCalledTimes(1);
    expect(subscriptions.assertAiAllowed).not.toHaveBeenCalled();
  });

  it('parses Instagram conversation message actor, text and image attachments without depending on one response shape', () => {
    const rows = parseInstagramConversationMessages([
      { id: 'm1', created_time: '2026-09-16T11:00:00+0000', message: 'Salom', from: { id: 'buyer-1', username: 'buyer' }, to: { data: [{ id: 'owner-ig' }] } },
      { id: 'm2', created_time: '2026-09-16T11:01:00+0000', text: '16 pro bormi', sender: { id: 'buyer-2', username: 'buyer2' }, recipients: { data: [{ id: 'owner-ig' }] }, attachments: { data: [{ image_data: { url: 'https://cdn.example.test/product.jpg' } }] } },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ id: 'm1', fromId: 'buyer-1', fromUsername: 'buyer', text: 'Salom', imageUrls: [] }),
      expect.objectContaining({ id: 'm2', fromId: 'buyer-2', fromUsername: 'buyer2', text: '16 pro bormi', imageUrls: ['https://cdn.example.test/product.jpg'] }),
    ]);
  });

  it('does not advance the Instagram DM poll cursor when a new inbound message fails to route', async () => {
    const cursor = new Date(Date.now() - 60_000);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig', authMode: 'INSTAGRAM_LOGIN', dmPollCursorAt: cursor }]),
        update,
      },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const now = new Date().toISOString();
    const graph = {
      listConversations: jest.fn().mockResolvedValue([{ id: 'conv-1', updatedTime: now }]),
      listConversationMessages: jest.fn().mockResolvedValue([{ id: 'm-buyer', createdTime: now, fromId: 'buyer-1', fromUsername: 'buyer', text: 'salom', imageUrls: [] }]),
    };
    const sales = { handlePolledDm: jest.fn().mockResolvedValue(false) };
    const poller = new InstagramDmPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { dmPollCursorAt: expect.any(Date) } }));
  });

  it('routes only new inbound Instagram DMs through the canonical sales handler and persists a restart-safe cursor', async () => {
    const cursor = new Date(Date.now() - 60_000);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig', authMode: 'INSTAGRAM_LOGIN', dmPollCursorAt: cursor }]),
        update,
      },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const now = new Date().toISOString();
    const graph = {
      listConversations: jest.fn().mockResolvedValue([{ id: 'conv-1', updatedTime: now }]),
      listConversationMessages: jest.fn().mockResolvedValue([
        { id: 'm-owner', createdTime: now, fromId: 'owner-ig', fromUsername: 'owner', text: 'outgoing' },
        { id: 'm-buyer', createdTime: now, fromId: 'buyer-1', fromUsername: 'buyer', text: 'salom ayfon bormi' },
      ]),
    };
    const sales = { handlePolledDm: jest.fn().mockResolvedValue(true) };
    const poller = new InstagramDmPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(sales.handlePolledDm).toHaveBeenCalledTimes(1);
    expect(sales.handlePolledDm).toHaveBeenCalledWith('u', expect.objectContaining({ messageId: 'm-buyer', senderId: 'buyer-1', text: 'salom ayfon bormi' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u' }, data: { dmPollCursorAt: expect.any(Date) } }));
  });

  it('initializes Instagram DM polling cursor without replaying historical inbox messages', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig', authMode: 'INSTAGRAM_LOGIN', dmPollCursorAt: null }]),
        update,
      },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const graph = { listConversations: jest.fn(), listConversationMessages: jest.fn() };
    const sales = { handlePolledDm: jest.fn() };
    const poller = new InstagramDmPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(graph.listConversations).not.toHaveBeenCalled();
    expect(sales.handlePolledDm).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u' }, data: { dmPollCursorAt: expect.any(Date) } }));
  });

  it('tracks private and public automation delivery independently so a retry never duplicates the successful DM', async () => {
    let receipt: any = null;
    const updates: any[] = [];
    const prisma = {
      instagramCommentAutomation: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'a1', triggerText: 'narx', semanticMatch: false, mediaCaption: null,
          sendPrivateReply: true, dmMessage: 'Salom', replyPublicly: true, publicReply: 'Directga yubordik',
        }]),
      },
      instagramAutomationReceipt: {
        findUnique: jest.fn(async () => receipt),
        create: jest.fn(async () => {
          receipt = { id: 'r1', privateSentAt: null, publicSentAt: null, completedAt: null, nextRetryAt: null, attemptCount: 0 };
          return receipt;
        }),
        update: jest.fn(async ({ data }: any) => { updates.push(data); receipt = { ...receipt, ...data }; return receipt; }),
      },
    };
    const graph = {
      privateReplyToComment: jest.fn().mockResolvedValue('dm1'),
      replyToComment: jest.fn().mockRejectedValueOnce(new Error('META_TEMPORARY')).mockResolvedValueOnce('reply1'),
      safeId: jest.fn(() => 'safe'),
      errorCode: jest.fn((error: any) => error?.message || 'FAILED'),
    };
    const matcher = { matches: jest.fn().mockResolvedValue(true) };
    const service = new InstagramSalesAgentService(prisma as never, graph as never, {} as never, {} as never, {} as never, matcher as never);
    const event = { commentId: 'c1', commenterId: 'customer-1', username: 'buyer', text: 'narx', mediaId: 'm1' };

    const first = await (service as any).runCommentAutomations('u', event, false);
    if (receipt?.nextRetryAt) receipt.nextRetryAt = new Date(0);
    const second = await (service as any).runCommentAutomations('u', event, false);

    expect(first.matched).toBe(true);
    expect(second.complete).toBe(true);
    expect(graph.privateReplyToComment).toHaveBeenCalledTimes(1);
    expect(graph.replyToComment).toHaveBeenCalledTimes(2);
    expect(updates.some(data => data.privateSentAt instanceof Date)).toBe(true);
    expect(updates.some(data => data.completedAt instanceof Date)).toBe(true);
  });

  it('upserts duplicate media+trigger automation instead of creating another rule', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'a1', mediaId: 'm1' });
    const prisma = { instagramCommentAutomation: { upsert } };
    const graph = { getMedia: jest.fn().mockResolvedValue({ id: 'm1', caption: 'Post', permalink: null }) };
    const service = new InstagramIntegrationService(prisma as never, graph as never, {} as never);

    await service.createAutomation('u', { mediaId: 'm1', triggerText: ' Narx ', dmMessage: 'Salom' });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_mediaId_triggerKey: { userId: 'u', mediaId: 'm1', triggerKey: 'narx' } },
      update: expect.objectContaining({ dmMessage: 'Salom', active: true }),
      create: expect.objectContaining({ triggerKey: 'narx' }),
    }));
  });

  it('replaces all rules for one Instagram media in one transaction', async () => {
    const tx = {
      instagramCommentAutomation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn().mockResolvedValue({ id: 'new-rule' }),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const graph = { getMedia: jest.fn().mockResolvedValue({ id: 'm1', caption: 'Post', permalink: null }) };
    const service = new InstagramIntegrationService(prisma as never, graph as never, {} as never);

    await service.replaceAutomationsForMedia('u', { mediaId: 'm1', triggerText: 'narx', dmMessage: 'Salom', publicReply: 'Directga yubordik', replyPublicly: true });

    expect(tx.instagramCommentAutomation.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u', mediaId: 'm1' } });
    expect(tx.instagramCommentAutomation.create).toHaveBeenCalledTimes(1);
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


  it('does not treat a different model in the same family as authoritative owner knowledge', async () => {
    const prisma = {
      salesProductKnowledge: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'k1', canonicalName: 'iPhone 13 Pro 128GB qora', productFamily: 'iPhone',
          aliases: ['13 Pro'], description: null, publicPrice: 4_800_000, currency: 'UZS',
          availability: 'AVAILABLE', stockQuantity: 3, unit: 'dona', attributes: { storage: '128GB', color: 'qora' }, note: null,
        }]),
      },
    };
    const service = new SalesProductKnowledgeService(prisma as never);

    const wrongModel = await service.search('u', 'iPhone 16 Pro', 10);
    const exactModel = await service.search('u', 'iPhone 13 Pro', 10);

    expect(wrongModel[0]?.authoritative).toBe(false);
    expect(exactModel[0]?.authoritative).toBe(true);
  });


  it('parses Instagram comments from both from/user actor shapes without losing a valid commenter', () => {
    const rows = parseInstagramMediaComments('m1', [
      { id: 'c1', text: 'narx', timestamp: '2026-09-16T12:00:00Z', from: { id: 'u1', username: 'buyer1' } },
      { id: 'c2', text: 'promt', timestamp: '2026-09-16T12:01:00Z', user: { id: 'u2', username: 'buyer2' } },
      { id: 'c3', text: 'salom', timestamp: '2026-09-16T12:02:00Z', username: 'buyer3' },
    ]);
    expect(rows.map(row => row.commenterId)).toEqual(['u1', 'u2', 'buyer3']);
  });

  it('initializes a persistent Instagram poll cursor without replaying historical comments', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig', commentPollCursorAt: null }]),
        update,
      },
      instagramCommentAutomation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const graph = { listMedia: jest.fn(), listMediaComments: jest.fn() };
    const sales = { handlePolledComment: jest.fn() };
    const poller = new InstagramCommentPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u' }, data: { commentPollCursorAt: expect.any(Date) } }));
    expect(graph.listMedia).not.toHaveBeenCalled();
    expect(sales.handlePolledComment).not.toHaveBeenCalled();
  });

  it('uses the persistent poll cursor after restart and routes only new non-owner comments', async () => {
    const cursor = new Date(Date.now() - 60_000);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      instagramConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u', instagramUserId: 'owner-ig', commentPollCursorAt: cursor }]),
        update,
      },
      instagramCommentAutomation: { findMany: jest.fn().mockResolvedValue([{ mediaId: 'old-automation-post' }]) },
    };
    const config = { get: jest.fn((key: string) => key === 'instagram.devCommentPollEnabled' ? true : 60_000) };
    const graph = {
      listMedia: jest.fn().mockResolvedValue([{ id: 'm1' }]),
      listMediaComments: jest.fn(async (_user: string, mediaId: string) => mediaId === 'm1' ? [
        { id: 'new', mediaId: 'm1', text: 'narx', commenterId: 'customer', username: 'buyer', timestamp: new Date().toISOString() },
        { id: 'old', mediaId: 'm1', text: 'old', commenterId: 'customer', username: 'buyer', timestamp: new Date(cursor.getTime() - 1).toISOString() },
        { id: 'self', mediaId: 'm1', text: 'self', commenterId: 'owner-ig', username: 'owner', timestamp: new Date().toISOString() },
      ] : []),
    };
    const sales = { handlePolledComment: jest.fn().mockResolvedValue(true) };
    const poller = new InstagramCommentPollerService(config as never, prisma as never, graph as never, sales as never);

    await poller.tick();

    expect(graph.listMediaComments).toHaveBeenCalledWith('u', 'old-automation-post', 500);
    expect(sales.handlePolledComment).toHaveBeenCalledTimes(1);
    expect(sales.handlePolledComment).toHaveBeenCalledWith('u', expect.objectContaining({ commentId: 'new' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u' }, data: { commentPollCursorAt: expect.any(Date) } }));
  });

});
