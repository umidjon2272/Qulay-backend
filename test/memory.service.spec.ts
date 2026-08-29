import { MemoryType } from '@prisma/client';
import { MemoryService } from '../src/memory/memory.service';

describe('MemoryService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    contact: { findFirst: jest.fn() },
    userMemory: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: MemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ memoryEnabled: true });
    prisma.userMemory.findFirst.mockResolvedValue(null);
    service = new MemoryService(prisma, activityLog);
  });

  it('creates a memory with a type and records activity', async () => {
    const memory = { id: 'memory-a', userId: 'user-a', key: 'aziz.position', type: MemoryType.CONTACT };
    prisma.userMemory.create.mockResolvedValue(memory);

    await expect(service.createForUser('user-a', {
      key: 'aziz.position',
      value: 'Marketing rahbari',
      type: MemoryType.CONTACT,
      importance: 8,
      source: 'MANUAL',
    })).resolves.toEqual(memory);

    expect(prisma.userMemory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-a', type: MemoryType.CONTACT, importance: 8 }),
    }));
    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'MEMORY_CREATED',
      entityId: 'memory-a',
    }));
  });

  it('updates, filters, and deletes memories only in the owner scope', async () => {
    const memory = { id: 'memory-a', userId: 'user-a', key: 'goal', type: MemoryType.GOAL };
    prisma.userMemory.findFirst.mockResolvedValue(memory);
    prisma.userMemory.findMany.mockResolvedValue([memory]);
    prisma.userMemory.count.mockResolvedValue(1);
    prisma.userMemory.update.mockResolvedValue({ ...memory, value: '100 mijoz' });

    await service.updateForUser('user-a', 'memory-a', { value: '100 mijoz', type: MemoryType.GOAL });
    const result = await service.listForUser('user-a', {
      page: 1,
      limit: 20,
      type: MemoryType.GOAL,
      importance: 8,
      search: 'mijoz',
    });
    await service.deleteForUser('user-a', 'memory-a');

    expect(result.items).toEqual([memory]);
    expect(prisma.userMemory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-a',
        type: MemoryType.GOAL,
        importance: 8,
      }),
    }));
    expect(prisma.userMemory.delete).toHaveBeenCalledWith({ where: { id: 'memory-a' } });
  });

  it('supports contact-linked memories and rejects a foreign contact', async () => {
    const contact = { id: 'contact-a', userId: 'user-a' };
    const memory = { id: 'memory-a', userId: 'user-a', contactId: 'contact-a', key: 'aziz.role' };
    prisma.contact.findFirst.mockResolvedValue(contact);
    prisma.userMemory.create.mockResolvedValue(memory);

    await expect(service.createForUser('user-a', {
      key: 'aziz.role',
      value: 'Marketing rahbari',
      contactId: 'contact-a',
    })).resolves.toEqual(memory);

    prisma.contact.findFirst.mockResolvedValue(null);
    await expect(service.createForUser('user-b', {
      key: 'aziz.role',
      value: 'Private',
      contactId: 'contact-a',
    })).rejects.toThrow('Contact was not found');
  });

  it('does not allow another user to access a memory', async () => {
    prisma.userMemory.findFirst.mockResolvedValue(null);

    await expect(service.updateForUser('user-b', 'memory-a', { value: 'nope' }))
      .rejects.toThrow('Memory was not found');
    await expect(service.deleteForUser('user-b', 'memory-a'))
      .rejects.toThrow('Memory was not found');
  });
});
