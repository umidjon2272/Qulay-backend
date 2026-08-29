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
    googleConnection: { findUnique: jest.fn() },
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

  it('persists locally first, creates a Google event and stores its id', async () => {
    const local = {
      id: 'meeting-id', userId: 'user-a', title: 'Test', description: null, location: null,
      startsAt: new Date('2026-08-29T10:00:00.000Z'), endsAt: new Date('2026-08-29T11:00:00.000Z'),
      googleCalendarId: null, googleCalendarEventId: null,
    };
    const synced = { ...local, googleCalendarId: 'primary', googleCalendarEventId: 'google-event-1', googleSyncError: null };
    prisma.meeting.create.mockResolvedValue(local);
    prisma.meeting.update.mockResolvedValue(synced);
    prisma.googleConnection.findUnique.mockResolvedValue({ status: 'CONNECTED', scopes: ['https://www.googleapis.com/auth/calendar.events'] });
    const googleCalendar = { create: jest.fn().mockResolvedValue({ id: 'google-event-1' }) } as any;
    service = new MeetingsService(prisma, activityLog, undefined, googleCalendar);

    await expect(service.createForUser('user-a', { title: 'Test', startsAt: '2026-08-29T15:00:00+05:00', endsAt: '2026-08-29T16:00:00+05:00' })).resolves.toEqual(synced);
    expect(prisma.meeting.create.mock.invocationCallOrder[0]).toBeLessThan(googleCalendar.create.mock.invocationCallOrder[0]);
    expect(googleCalendar.create).toHaveBeenCalledWith('user-a', expect.objectContaining({ start: '2026-08-29T10:00:00.000Z', end: '2026-08-29T11:00:00.000Z' }));
    expect(prisma.meeting.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ googleCalendarEventId: 'google-event-1' }) }));
  });

  it('keeps the local meeting and exposes a safe sync error when Google create fails', async () => {
    const local = {
      id: 'meeting-id', userId: 'user-a', title: 'Test', description: null, location: null,
      startsAt: new Date('2026-08-29T10:00:00.000Z'), endsAt: new Date('2026-08-29T11:00:00.000Z'),
      googleCalendarId: null, googleCalendarEventId: null,
    };
    prisma.meeting.create.mockResolvedValue(local);
    prisma.meeting.update.mockResolvedValue({ ...local, googleSyncError: 'GOOGLE_CALENDAR_CREATE_FAILED' });
    prisma.googleConnection.findUnique.mockResolvedValue({ status: 'CONNECTED', scopes: ['https://www.googleapis.com/auth/calendar.events'] });
    const googleCalendar = { create: jest.fn().mockRejectedValue(new Error('provider details')) } as any;
    service = new MeetingsService(prisma, activityLog, undefined, googleCalendar);

    await expect(service.createForUser('user-a', { title: 'Test', startsAt: '2026-08-29T15:00:00+05:00', endsAt: '2026-08-29T16:00:00+05:00' })).resolves.toMatchObject({ googleSyncError: 'GOOGLE_CALENDAR_CREATE_FAILED' });
  });
});
