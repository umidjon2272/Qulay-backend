import { ContactsService } from '../src/contacts/contacts.service';

describe('ContactsService', () => {
  const prisma = {
    contact: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: ContactsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContactsService(prisma, activityLog);
  });

  it('creates a contact and records activity', async () => {
    const contact = { id: 'contact-a', userId: 'user-a', displayName: 'Aziz' };
    prisma.contact.create.mockResolvedValue(contact);

    await expect(service.createForUser('user-a', {
      firstName: 'Aziz',
      displayName: 'Aziz',
      tags: ['client'],
    })).resolves.toEqual(contact);

    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-a', tags: ['client'] }),
    }));
    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CONTACT_CREATED',
      entityId: 'contact-a',
    }));
  });

  it('lists only the authenticated user contacts and supports search', async () => {
    prisma.contact.findMany.mockResolvedValue([{ id: 'contact-a', userId: 'user-a' }]);
    prisma.contact.count.mockResolvedValue(1);

    const result = await service.listForUser('user-a', { page: 1, limit: 20, search: 'Aziz' });

    expect(result.items).toEqual([{ id: 'contact-a', userId: 'user-a' }]);
    expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-a',
        OR: expect.arrayContaining([{ displayName: { contains: 'Aziz', mode: 'insensitive' } }]),
      }),
    }));
  });

  it('updates and deletes an owned contact', async () => {
    const contact = { id: 'contact-a', userId: 'user-a' };
    prisma.contact.findFirst.mockResolvedValue(contact);
    prisma.contact.update.mockResolvedValue({ ...contact, displayName: 'Aziz Khan' });
    prisma.contact.delete.mockResolvedValue(contact);

    await service.updateForUser('user-a', 'contact-a', { displayName: 'Aziz Khan' });
    await service.deleteForUser('user-a', 'contact-a');

    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'contact-a' },
      data: expect.objectContaining({ displayName: 'Aziz Khan' }),
    }));
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'contact-a' } });
    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONTACT_DELETED' }));
  });

  it('does not allow another user to access a contact', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(service.getForUser('user-b', 'contact-a')).rejects.toThrow('Contact was not found');
    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'contact-a', userId: 'user-b' },
    });
  });
});
