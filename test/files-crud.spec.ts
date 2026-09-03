import { FilesService } from '../src/files/files.service';

describe('file CRUD contracts', () => {
  let prisma: any, service: FilesService, activity: any;
  const file = { id: 'file-a', originalName: 'report.pdf', extension: 'pdf', sizeBytes: 100n, status: 'ACTIVE', folderId: null };
  beforeEach(() => {
    prisma = { userFile: { findFirst: jest.fn().mockResolvedValue(file), update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...file, ...data })), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, fileFolder: { findFirst: jest.fn().mockResolvedValue({ id: 'folder-a' }), findMany: jest.fn().mockResolvedValue([]) } };
    activity = { record: jest.fn().mockResolvedValue(undefined) };
    service = new FilesService(prisma, activity, { get: () => undefined } as any, {} as any, {} as any, {} as any);
  });
  it('renames an owned file and serializes its size', async () => {
    const result = await service.updateForUser('owner', 'file-a', { originalName: 'budget.pdf' });
    expect(result.originalName).toBe('budget.pdf'); expect(result.sizeBytes).toBe(100);
    expect(prisma.userFile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'file-a', userId: 'owner' }) }));
  });
  it('rejects an extension change without writing', async () => {
    await expect(service.updateForUser('owner', 'file-a', { originalName: 'budget.exe' })).rejects.toThrow();
    expect(prisma.userFile.update).not.toHaveBeenCalled();
  });
  it('rejects another account folder without moving a file', async () => {
    prisma.fileFolder.findFirst.mockResolvedValue(null);
    await expect(service.updateForUser('owner', 'file-a', { folderId: 'foreign' })).rejects.toThrow();
    expect(prisma.userFile.update).not.toHaveBeenCalled();
  });
  it('moves to root using null and does not fail on an analytics outage', async () => {
    activity.record.mockRejectedValue(new Error('offline'));
    const result = await service.updateForUser('owner', 'file-a', { folderId: null });
    expect(result.folderId).toBeNull();
  });
  it('filters root files rather than displaying children twice', async () => {
    await service.listForUser('owner', { page: 1, limit: 50, folderId: 'root' });
    expect(prisma.userFile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'owner', folderId: null }), take: 50 }));
  });
  it('folder counts exclude deleted files without hiding empty folders', async () => {
    await service.listFoldersForUser('owner');
    expect(prisma.fileFolder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' }, include: { _count: { select: { files: { where: { status: 'ACTIVE' } }, children: true } } } }));
  });
});
