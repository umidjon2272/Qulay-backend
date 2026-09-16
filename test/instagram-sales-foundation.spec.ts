import { InstagramCommentMatcherService } from '../src/instagram/instagram-comment-matcher.service';
import { InstagramIntegrationService } from '../src/instagram/instagram-integration.service';
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
});
