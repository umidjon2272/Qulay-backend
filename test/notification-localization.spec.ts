import { localizeNotification } from '../src/notifications/notification-localization';
describe('notification system localization', () => {
  it('translates system labels while preserving user content', () => {
    const notification = { title: 'Eslatma: AI sinovi', message: 'Mening o‘zbekcha izohim', metadata: { systemLabel: 'REMINDER', originalTitle: 'AI sinovi', systemBody: false } };
    expect(localizeNotification(notification, 'ru')).toMatchObject({ title: 'Напоминание: AI sinovi', message: 'Mening o‘zbekcha izohim' });
  });
  it('renders the selected locale without rewriting saved content', () => {
    const notification = { title: 'Vazifa: Ish', message: 'Vazifa muddati keldi.', metadata: { systemLabel: 'TASK', originalTitle: 'Ish', systemBody: true } };
    expect(localizeNotification(notification, 'ru').message).toBe('Наступил срок задачи.');
    expect(localizeNotification(notification, 'uz').message).toBe('Vazifa muddati keldi.');
    expect(notification.title).toBe('Vazifa: Ish');
  });
  it('does not translate arbitrary AI or legacy/user messages', () => {
    const notification = { title: 'Salom', message: 'Vazifa muddati keldi.', metadata: null };
    expect(localizeNotification(notification, 'ru')).toBe(notification);
  });
});
