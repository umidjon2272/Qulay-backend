import { MeetingStatus } from '@prisma/client';
import { MeetingsService } from '../src/meetings/meetings.service';

describe('MeetingsService', () => {
  const prisma = {
    meeting: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: MeetingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MeetingsService(prisma, activityLog);
  });

  it('creates a meeting and records activity', async () => {
    const meeting = { id: 'meeting-id', userId: 'user-a', status: MeetingStatus.SCHEDULED };
    prisma.meeting.create.mockResolvedValue(meeting);

    await expect(service.createForUser('user-a', {
      title: 'Planning',
      startsAt: '2026-08-22T10:00:00+05:00',
      endsAt: '2026-08-22T11:00:00+05:00',
    })).resolves.toEqual(meeting);

    expect(activityLog.record).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'meeting-id' }));
  });

  it('updates and cancels an owned meeting', async () => {
    const meeting = {
      id: 'meeting-id',
      userId: 'user-a',
      startsAt: new Date('2026-08-22T05:00:00.000Z'),
      endsAt: new Date('2026-08-22T06:00:00.000Z'),
    };
    prisma.meeting.findFirst.mockResolvedValue(meeting);
    prisma.meeting.update.mockResolvedValue(meeting);

    await service.updateForUser('user-a', 'meeting-id', { title: 'Updated' });
    await service.cancelForUser('user-a', 'meeting-id');

    expect(prisma.meeting.findFirst).toHaveBeenCalledWith({ where: { id: 'meeting-id', userId: 'user-a' } });
    expect(prisma.meeting.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MeetingStatus.CANCELLED }),
    }));
  });
});
