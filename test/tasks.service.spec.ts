import { TaskPriority, TaskStatus } from '@prisma/client';
import { TasksService } from '../src/tasks/tasks.service';

describe('TasksService', () => {
  const prisma = {
    task: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: TasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(prisma, activityLog);
  });

  it('creates a task for the authenticated user and logs it', async () => {
    const task = { id: 'task-id', userId: 'user-a', title: 'Plan', status: TaskStatus.TODO };
    prisma.task.create.mockResolvedValue(task);

    await expect(service.createForUser('user-a', {
      title: 'Plan',
      priority: TaskPriority.HIGH,
    })).resolves.toEqual(task);

    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-a', title: 'Plan', priority: TaskPriority.HIGH }),
    });
    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      entityId: 'task-id',
    }));
  });

  it('updates, completes, reopens and deletes an owned task', async () => {
    const current = { id: 'task-id', userId: 'user-a', status: TaskStatus.TODO, completedAt: null };
    prisma.task.findFirst.mockResolvedValue(current);
    prisma.task.update.mockResolvedValue({ ...current, status: TaskStatus.COMPLETED });
    prisma.task.delete.mockResolvedValue(current);

    await service.updateForUser('user-a', 'task-id', { priority: TaskPriority.LOW });
    await service.completeForUser('user-a', 'task-id');
    await service.reopenForUser('user-a', 'task-id');
    await service.deleteForUser('user-a', 'task-id');

    expect(prisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 'task-id', userId: 'user-a' } });
    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-id' },
    }));
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-id' } });
  });

  it('does not allow access to another user task', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(service.getForUser('user-b', 'task-id')).rejects.toThrow('Task was not found');
    expect(prisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 'task-id', userId: 'user-b' } });
  });
});
