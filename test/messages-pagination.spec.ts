import { MessagesService } from '../src/messages/messages.service';
import { MessageQueryDto } from '../src/messages/dto/message-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('conversation history cursor paging', () => {
  const rows = Array.from({ length: 235 }, (_, i) => ({ id: String(i).padStart(3,'0'), content: `message ${i}`, role: 'USER', createdAt: new Date('2026-09-01Z') }));
  let prisma: any, service: MessagesService;
  beforeEach(() => {
    prisma = { conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'chat-a' }) }, message: {
      findFirst: jest.fn(async ({where}) => rows.find(row => row.id === where.id)),
      findMany: jest.fn(async ({where,take,skip}) => [...rows].reverse().filter(row => !where.OR || row.id < where.OR[1].id.lt).slice(skip,skip+take)),
      count: jest.fn().mockResolvedValue(rows.length),
    } };
    service = new MessagesService(prisma);
  });
  it('retrieves all 235 messages exactly once, including tied timestamps', async () => {
    let before: string | undefined; let found: string[] = [];
    do {
      const result = await service.listForConversation('user-a','chat-a',{ page: 1, limit: 50, before });
      found = [...result.items.map(row => row.id), ...found];
      before = result.meta.nextCursor ?? undefined;
    } while (before);
    expect(found).toEqual(rows.map(row => row.id));
    expect(new Set(found).size).toBe(235);
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({ where: { id: 'chat-a', userId: 'user-a' } });
  });
  it('rejects foreign conversations before querying messages', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    await expect(service.listForConversation('other','chat-a',{page:1,limit:50})).rejects.toThrow();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
  it('rejects a missing/foreign cursor', async () => {
    await expect(service.listForConversation('user-a','chat-a',{page:1,limit:50,before:'foreign'})).rejects.toThrow('cursor');
    expect(prisma.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({conversationId:'chat-a',id:'foreign'})}));
  });
  it('keeps the 100-message API boundary instead of removing validation', async () => {
    expect(await validate(plainToInstance(MessageQueryDto,{limit:101}))).not.toHaveLength(0);
    expect(await validate(plainToInstance(MessageQueryDto,{limit:100}))).toHaveLength(0);
  });
});
