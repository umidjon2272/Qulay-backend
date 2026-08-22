import { BadRequestException } from '@nestjs/common';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateTime(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid date-time value');
  }
  return parsed;
}

export function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException('Invalid IANA timezone');
  }
}

export function assertDateKey(value: string): void {
  if (!DATE_KEY_PATTERN.test(value)) {
    throw new BadRequestException('Date must use YYYY-MM-DD format');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Invalid calendar date');
  }
}

export function utcDayRange(dateKey: string): { start: Date; end: Date } {
  assertDateKey(dateKey);
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function zonedParts(date: Date, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = zonedParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function localMidnightToUtc(dateKey: string, timezone: string): Date {
  assertDateKey(dateKey);
  assertValidTimezone(timezone);
  const naiveUtc = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  const firstGuess = naiveUtc - timezoneOffsetMs(new Date(naiveUtc), timezone);
  const corrected = naiveUtc - timezoneOffsetMs(new Date(firstGuess), timezone);
  return new Date(corrected);
}

export function zonedDayRange(dateKey: string, timezone: string): { start: Date; end: Date } {
  const start = localMidnightToUtc(dateKey, timezone);
  const nextDate = new Date(`${dateKey}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const end = localMidnightToUtc(nextDate.toISOString().slice(0, 10), timezone);
  return { start, end };
}

export function dateKeyInTimezone(date: Date, timezone: string): string {
  assertValidTimezone(timezone);
  const parts = zonedParts(date, timezone);
  return [parts.year, String(parts.month).padStart(2, '0'), String(parts.day).padStart(2, '0')].join('-');
}

export function monthRangeUtc(date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}
