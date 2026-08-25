import { GoogleCalendarService, normalizeEvent } from '../src/google/google-calendar.service';
import { GoogleDriveService } from '../src/google/google-drive.service';

describe('Google integration adapters', () => {
  it('normalizes Calendar events without changing timezone-bearing values', () => {
    expect(normalizeEvent({ id: 'e1', summary: 'Demo', start: { dateTime: '2026-08-26T09:00:00+05:00' }, end: { dateTime: '2026-08-26T10:00:00+05:00' }, attendees: [{ email: 'user@example.com', responseStatus: 'accepted' }] })).toEqual(expect.objectContaining({ id: 'e1', title: 'Demo', start: '2026-08-26T09:00:00+05:00', end: '2026-08-26T10:00:00+05:00' }));
  });

  it('normalizes Drive metadata and prepares Docs export metadata without content', async () => {
    const auth = { getAccessToken: jest.fn().mockResolvedValue('access') };
    const api = { request: jest.fn().mockResolvedValue({ files: [{ id: 'f1', name: 'Spec', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-08-26T00:00:00Z', owners: [{ displayName: 'Owner' }] }], nextPageToken: 'next' }) };
    const drive = new GoogleDriveService(auth as any, api as any);
    await expect(drive.list('user-1', { q: 'Spec', limit: 10 })).resolves.toMatchObject({ items: [{ id: 'f1', name: 'Spec', size: null }], nextPageToken: 'next' });
    expect(drive.exportMetadata({ id: 'f1', mimeType: 'application/vnd.google-apps.document' })).toMatchObject({ contentFetched: false, fileId: 'f1' });
  });

  it('uses the mock Google adapter for Calendar writes', async () => {
    const auth = { getAccessToken: jest.fn().mockResolvedValue('access') };
    const api = { request: jest.fn().mockResolvedValue({ id: 'e1', summary: 'Created', start: { dateTime: '2026-08-26T09:00:00Z' }, end: { dateTime: '2026-08-26T10:00:00Z' } }) };
    const activity = { record: jest.fn().mockResolvedValue(undefined) };
    const calendar = new GoogleCalendarService(auth as any, api as any, activity as any);
    await expect(calendar.create('user-1', { title: 'Created', start: '2026-08-26T09:00:00Z', end: '2026-08-26T10:00:00Z' })).resolves.toMatchObject({ id: 'e1', title: 'Created' });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('/calendars/primary/events'), 'access', expect.objectContaining({ method: 'POST' }));
  });
});
