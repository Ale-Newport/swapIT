/**
 * Signed calendar arithmetic for the Add or Subtract Time tool.
 *
 * Months and years move by the calendar and clamp to the end of a shorter
 * month, so 31 January plus one month is 28 or 29 February. Weeks, days, hours,
 * minutes and seconds move by local wall-clock steps, which keeps the time of
 * day stable across a daylight-saving change.
 *
 * In business-day mode the same delta is read in working days: a week counts as
 * five of them, so nothing a user typed is ever quietly dropped.
 */

export interface DeltaParts {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const EMPTY_DELTA: DeltaParts = {
  years: 0,
  months: 0,
  weeks: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
};

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Add months keeping the time of day, clamping to the end of a shorter month. */
export function addMonths(date: Date, months: number): Date {
  const absolute = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(absolute / 12);
  const month = ((absolute % 12) + 12) % 12;
  const day = Math.min(date.getDate(), daysInMonth(year, month));
  const out = new Date(date.getTime());
  out.setFullYear(year, month, day);
  return out;
}

export function addDays(date: Date, days: number): Date {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

export function isoDateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Move `days` working days forwards or backwards, skipping Saturdays, Sundays
 * and any listed holiday. The starting date itself is never counted, so
 * "Friday plus one business day" is the following Monday.
 */
export function addBusinessDays(start: Date, days: number, holidays: string[] = []): Date {
  if (!Number.isFinite(days) || days === 0) return new Date(start.getTime());
  const skip = new Set(holidays);
  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(days));
  if (remaining > 200_000) {
    throw new Error('That is more business days than this tool will walk. Try 200,000 or fewer.');
  }
  let cursor = new Date(start.getTime());
  while (remaining > 0) {
    cursor = addDays(cursor, step);
    if (isWeekend(cursor)) continue;
    if (skip.has(isoDateKey(cursor))) continue;
    remaining -= 1;
  }
  return cursor;
}

/**
 * Apply a signed delta. `sign` is +1 to add and -1 to subtract; individual
 * fields may also be negative, which simply reverses that one unit.
 */
export function shiftDate(start: Date, delta: DeltaParts, sign: 1 | -1 = 1): Date {
  let out = new Date(start.getTime());
  const months = sign * (delta.years * 12 + delta.months);
  if (months !== 0) out = addMonths(out, months);
  const days = sign * (delta.weeks * 7 + delta.days);
  if (days !== 0) out = addDays(out, days);
  const seconds = sign * (delta.hours * 3600 + delta.minutes * 60 + delta.seconds);
  if (seconds !== 0) out = new Date(out.getTime() + seconds * 1000);
  return out;
}

/** How many working days a week is worth in business-day mode. */
export const WORKING_WEEK_DAYS = 5;

/**
 * The business-days variant: years and months move by the calendar, the week
 * and day amounts are counted together in working days (a week is five of
 * them), and the clock units are applied last.
 */
export function shiftDateBusiness(
  start: Date,
  delta: DeltaParts,
  sign: 1 | -1,
  holidays: string[] = [],
): Date {
  let out = new Date(start.getTime());
  const months = sign * (delta.years * 12 + delta.months);
  if (months !== 0) out = addMonths(out, months);
  const workingDays = sign * (delta.weeks * WORKING_WEEK_DAYS + delta.days);
  if (workingDays !== 0) out = addBusinessDays(out, workingDays, holidays);
  const seconds = sign * (delta.hours * 3600 + delta.minutes * 60 + delta.seconds);
  if (seconds !== 0) out = new Date(out.getTime() + seconds * 1000);
  return out;
}

export function isEmptyDelta(delta: DeltaParts): boolean {
  const fields: Array<keyof DeltaParts> = [
    'years',
    'months',
    'weeks',
    'days',
    'hours',
    'minutes',
    'seconds',
  ];
  return fields.every((key) => delta[key] === 0);
}

/** "1 year, 2 months and 3 days" — the sentence shown above the result. */
export function describeDelta(delta: DeltaParts, sign: 1 | -1, businessMode: boolean): string {
  const parts: string[] = [];
  const push = (value: number, singular: string) => {
    if (value === 0) return;
    const magnitude = Math.abs(value);
    const word = `${magnitude} ${singular}${magnitude === 1 ? '' : 's'}`;
    parts.push(value < 0 ? `minus ${word}` : word);
  };
  push(delta.years, 'year');
  push(delta.months, 'month');
  push(delta.weeks, businessMode ? 'working week' : 'week');
  push(delta.days, businessMode ? 'business day' : 'day');
  push(delta.hours, 'hour');
  push(delta.minutes, 'minute');
  push(delta.seconds, 'second');
  if (parts.length === 0) return 'nothing at all';
  const last = parts.pop() as string;
  const list = parts.length ? `${parts.join(', ')} and ${last}` : last;
  return `${sign === 1 ? 'plus' : 'minus'} ${list}`;
}

/** True when the day of the month had to be pulled back to fit a shorter month. */
export function wasClamped(start: Date, result: Date, delta: DeltaParts): boolean {
  if (delta.years === 0 && delta.months === 0) return false;
  if (delta.weeks !== 0 || delta.days !== 0) return false;
  if (delta.hours !== 0 || delta.minutes !== 0 || delta.seconds !== 0) return false;
  return result.getDate() !== start.getDate();
}

// ------------------------------------------------------------------ formatting

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, '0');
}

export function offsetLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/** ISO 8601 in local time with the real offset, e.g. 2026-09-10T14:03:22+02:00. */
export function toIsoWithOffset(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}${offsetLabel(date)}`;
}

export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

export function fromLocalInput(value: string): Date | null {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? '0'),
    0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Reuses the holiday format of the Date Difference tool. */
export function parseHolidayList(text: string): { dates: string[]; invalid: string[] } {
  const dates = new Set<string>();
  const invalid: string[] = [];
  for (const rawEntry of text.split(/[\n;,]/)) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d-/.])/.exec(entry);
    if (!match) {
      invalid.push(entry);
      continue;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) {
      invalid.push(entry);
      continue;
    }
    dates.add(`${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return { dates: [...dates].sort(), invalid };
}
