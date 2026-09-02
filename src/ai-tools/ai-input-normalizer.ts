import { assertDateKey, dateKeyInTimezone, zonedDayRange } from '../common/date.utils';

/** Normalize extracted fields only. Never rewrite a message, recipient ID or free-form note. */
export function normalizeAmount(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : value;
  if (typeof value !== 'string') return value;
  let text = value.trim().toLowerCase().replace(/(?:uzs|so[‘’'ʻ]?m|som|сум)$/u, '').trim();
  if (/^yarim\s*(mln|million)$/.test(text)) return '500000';
  const match = text.match(/^([0-9]+(?:[ ,.][0-9]+)*)\s*(k|min|ming|mln|million)?$/);
  if (!match) return value;
  let number = match[1].replace(/\s/g, '');
  // Commas in 500,000 are grouping; 1,5 mln is a decimal fraction.
  if (/^\d{1,3}(,\d{3})+$/.test(number)) number = number.replace(/,/g, '');
  else number = number.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(number)) return value;
  const [whole, fraction = ''] = number.split('.');
  const scale = match[2] ? (/^(mln|million)$/.test(match[2]) ? 6 : 3) : 0;
  const digits = (whole + fraction).replace(/^0+(?=\d)/, '');
  const places = fraction.length - scale;
  if (places <= 0) return digits + '0'.repeat(-places);
  const padded = digits.padStart(places + 1, '0');
  return `${padded.slice(0, -places)}.${padded.slice(-places)}`;
}

export function resolveDateKey(value: string, timezone: string, now = new Date()): string | null {
  const text = value.trim().toLowerCase();
  const relative: Record<string, number> = { bugun: 0, bugunga: 0, hozir: 0, hozr: 0, today: 0, сегодня: 0, kecha: -1, kechagi: -1, yesterday: -1, вчера: -1, ertaga: 1, tomorrow: 1, завтра: 1 };
  let key = text;
  if (Object.prototype.hasOwnProperty.call(relative, text)) {
    const date = new Date(`${dateKeyInTimezone(now, timezone)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + relative[text]);
    key = date.toISOString().slice(0, 10);
  } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    const [day, month, year] = text.split('.'); key = `${year}-${month}-${day}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  assertDateKey(key);
  return key;
}

export function normalizeToolInput(tool: string, input: Record<string, unknown>, timezone = 'Asia/Tashkent', now = new Date()): Record<string, unknown> {
  const normalized = { ...input };
  // Optional null values from model function calls must be omitted before DTO conversion.
  for (const key of Object.keys(normalized)) if (normalized[key] === null) delete normalized[key];
  if (tool === 'create_finance_transaction' || tool === 'update_finance_transaction') {
    if (normalized.amount !== undefined) normalized.amount = normalizeAmount(normalized.amount);
    const types: Record<string, string> = { daromad: 'INCOME', kirim: 'INCOME', prihod: 'INCOME', income: 'INCOME', xarajat: 'EXPENSE', chiqim: 'EXPENSE', rashod: 'EXPENSE', expense: 'EXPENSE' };
    if (typeof normalized.type === 'string') normalized.type = types[normalized.type.toLowerCase()] ?? normalized.type.toUpperCase();
    if (typeof normalized.currency === 'string') {
      const currency = normalized.currency.toUpperCase().replace(/[‘’'ʻ]/g, '');
      normalized.currency = ['SOM', 'SOМ', 'SUM', 'СУМ'].includes(currency) ? 'UZS' : currency;
    }
    if (normalized.date !== undefined && normalized.transactionDate === undefined) { normalized.transactionDate = normalized.date; delete normalized.date; }
    if (normalized.transactionDate === undefined && tool === 'create_finance_transaction') normalized.transactionDate = now.toISOString();
    else if (typeof normalized.transactionDate === 'string') {
      const key = resolveDateKey(normalized.transactionDate, timezone, now);
      if (key) normalized.transactionDate = zonedDayRange(key, timezone).start.toISOString();
    }
  }
  if (typeof normalized.date === 'string') normalized.date = resolveDateKey(normalized.date, timezone, now) ?? normalized.date;
  if (['get_finance_summary', 'compare_finance_periods'].includes(tool)) {
    for (const field of ['from', 'to', 'currentFrom', 'currentTo', 'previousFrom', 'previousTo']) {
      if (typeof normalized[field] !== 'string') continue;
      const key = resolveDateKey(normalized[field] as string, timezone, now);
      if (key) { const range = zonedDayRange(key, timezone); normalized[field] = (field.toLowerCase().endsWith('to') ? range.end : range.start).toISOString(); }
    }
  }
  return normalized;
}

/** Only constrain finance READ tools, based on an explicit latest-message period. */
export function financeReadOverride(tool: string, input: Record<string, unknown>, message: string): { tool: string; input: Record<string, unknown> } {
  const text = message.normalize('NFKC').toLowerCase();
  const allTime = /(?:^|\s)(?:umumiy|obshi|obshe|jami|hammasi|all[ -]?time)(?:\s|[?!. ,]|$)|barcha\s+(?:vaqt|davr|sana)|за\s+вс[её]\s+время|общий|общая|итого/u.test(text);
  const explicitPeriod = /bugun|kecha|ertaga|shu\s+(?:oy|hafta|yil)|o[‘’']?tgan\s+(?:oy|hafta|yil)|\d{4}-\d{2}-\d{2}|\d{1,2}[.\/]\d{1,2}|yanvar|fevral|mart|aprel|may\b|iyun|iyul|avgust|sent[ya]*br|oktabr|noyabr|dekabr|сегодня|вчера|месяц|недел|\bгод/u.test(text);
  if (allTime && !explicitPeriod && ['get_today_finance', 'get_finance_summary', 'get_all_time_finance'].includes(tool)) {
    return { tool: 'get_all_time_finance', input: input.currency ? { currency: input.currency } : {} };
  }
  return { tool, input };
}

/** High-confidence read guard; ordinary advice and requests to write are left to the model. */
export function allTimeFinanceQuestion(message: string): boolean {
  const text = message.toLowerCase();
  return /daromad|kirim|xarajat|chiqim|foyda|zarar|доход|расход|прибыл/u.test(text)
    && /qancha|qanca|qanch|nech|сколько|jami|итого/u.test(text)
    && !/qo[‘’']?sh|qush|yarat|kirit|yoz|o[‘’']?chir|yubor|создай|добавь|удали/u.test(text)
    && financeReadOverride('get_today_finance', {}, text).tool === 'get_all_time_finance';
}

/** Exact standalone replies only: “ha, lekin 600 ming” is a correction, never approval. */
export function confirmationReply(text: string): boolean | null {
  const value = text.normalize('NFKC').toLowerCase().replace(/[‘’ʻ`]/g, "'").trim().replace(/[.!?,]+$/g, '').trim();
  if (/^(ha+|xa+|xo'p|xop|ho'p|hop|mayli|bo'pti|bopti|qil|qilaver|bajar|bajaraver|yubor|yuboraver|tasdiq|tasdiqlayman|ha tasdiqlayman|ha, tasdiqlayman|davay|ok|okay|yes|confirm|да|подтверждаю|отправь)$/.test(value)) return true;
  if (/^(yo'q|yoq|yuq|bekor|bekor qil|bekor qilish|qilma|yuborma|no|cancel|нет|отмена|отмени)$/.test(value)) return false;
  return null;
}
