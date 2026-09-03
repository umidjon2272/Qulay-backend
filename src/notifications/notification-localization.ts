import { NotificationRecord } from './notification.types';

/** Translate system templates only. User titles/descriptions remain untouched. */
export function localizeNotification<T extends Pick<NotificationRecord, 'title' | 'message' | 'metadata'>>(notification: T, language?: string | null): T {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return notification;
  const label = metadata.systemLabel;
  const name = metadata.originalTitle;
  if (typeof label !== 'string' || typeof name !== 'string') return notification;
  const ru = language === 'ru';
  const labels: Record<string, string> = ru ? { TASK: 'Задача', REMINDER: 'Напоминание', MEETING: 'Встреча', MEETING_SOON: 'Скоро встреча' } : { TASK: 'Vazifa', REMINDER: 'Eslatma', MEETING: 'Uchrashuv', MEETING_SOON: 'Uchrashuv yaqin' };
  const bodies: Record<string, string> = ru ? { TASK: 'Наступил срок задачи.', REMINDER: 'Время напоминания.', MEETING: 'Встреча начинается.' } : { TASK: 'Vazifa muddati keldi.', REMINDER: 'Eslatma vaqti keldi.', MEETING: 'Uchrashuv boshlanmoqda.' };
  if (!labels[label]) return notification;
  let message = notification.message;
  if (metadata.systemBody === true) {
    if (label === 'MEETING_SOON' && typeof metadata.minutesBefore === 'number') message = ru ? `Встреча начнётся через ${metadata.minutesBefore} мин.` : `${metadata.minutesBefore} daqiqadan keyin uchrashuv boshlanadi.`;
    else message = bodies[label] ?? message;
  }
  return { ...notification, title: `${labels[label]}: ${name}`, message };
}
