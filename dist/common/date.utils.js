"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateTime = parseDateTime;
exports.assertValidTimezone = assertValidTimezone;
exports.assertDateKey = assertDateKey;
exports.utcDayRange = utcDayRange;
exports.zonedDayRange = zonedDayRange;
exports.dateKeyInTimezone = dateKeyInTimezone;
exports.monthRangeUtc = monthRangeUtc;
const common_1 = require("@nestjs/common");
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function parseDateTime(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new common_1.BadRequestException('Invalid date-time value');
    }
    return parsed;
}
function assertValidTimezone(timezone) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    }
    catch {
        throw new common_1.BadRequestException('Invalid IANA timezone');
    }
}
function assertDateKey(value) {
    if (!DATE_KEY_PATTERN.test(value)) {
        throw new common_1.BadRequestException('Date must use YYYY-MM-DD format');
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new common_1.BadRequestException('Invalid calendar date');
    }
}
function utcDayRange(dateKey) {
    assertDateKey(dateKey);
    const start = new Date(`${dateKey}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
}
function zonedParts(date, timezone) {
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
    return Object.fromEntries(parts
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]));
}
function timezoneOffsetMs(date, timezone) {
    const parts = zonedParts(date, timezone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - date.getTime();
}
function localMidnightToUtc(dateKey, timezone) {
    assertDateKey(dateKey);
    assertValidTimezone(timezone);
    const naiveUtc = new Date(`${dateKey}T00:00:00.000Z`).getTime();
    const firstGuess = naiveUtc - timezoneOffsetMs(new Date(naiveUtc), timezone);
    const corrected = naiveUtc - timezoneOffsetMs(new Date(firstGuess), timezone);
    return new Date(corrected);
}
function zonedDayRange(dateKey, timezone) {
    const start = localMidnightToUtc(dateKey, timezone);
    const nextDate = new Date(`${dateKey}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const end = localMidnightToUtc(nextDate.toISOString().slice(0, 10), timezone);
    return { start, end };
}
function dateKeyInTimezone(date, timezone) {
    assertValidTimezone(timezone);
    const parts = zonedParts(date, timezone);
    return [parts.year, String(parts.month).padStart(2, '0'), String(parts.day).padStart(2, '0')].join('-');
}
function monthRangeUtc(date = new Date()) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return { start, end };
}
//# sourceMappingURL=date.utils.js.map