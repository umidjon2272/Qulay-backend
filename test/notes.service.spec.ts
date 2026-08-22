import { NotesService } from '../src/notes/notes.service';

describe('NotesService', () => {
  const prisma = {
    note: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: NotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotesService(prisma, activityLog);
  });

  it('creates and updates a note', async () => {
    const note = { id: 'note-id', userId: 'user-a', title: 'Idea', content: 'Text' };
    prisma.note.create.mockResolvedValue(note);
    prisma.note.findFirst.mockResolvedValue(note);
    prisma.note.update.mockResolvedValue({ ...note, title: 'Updated' });

    await service.createForUser('user-a', { title: 'Idea', content: 'Text' });
    await service.updateForUser('user-a', 'note-id', { title: 'Updated' });

    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'NOTE' }));
    expect(prisma.note.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'note-id' } }));
  });

  it('applies search within the current user scope', async () => {
    prisma.note.findMany.mockResolvedValue([]);
    prisma.note.count.mockResolvedValue(0);

    await service.listForUser('user-a', { page: 1, limit: 20, search: 'idea' });

    expect(prisma.note.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', OR: expect.any(Array) }),
    }));
  });
});
