/**
 * Calendar-correct date arithmetic for the Date Difference tool.
 *
 * Everything is computed in the machine's local time zone, because that is the
 * frame a person means when they type "5 March, 09:00". Two ideas matter here:
 *
 *  - the *calendar* breakdown (2 months and 3 days) walks months and days the
 *    way a calendar does, so February is 28 or 29 days and never 30.4;
 *  - the *totals* (total hours, total minutes …) are exact elapsed time taken
 *    straight from the two instants, so a daylight-saving jump is included.
 */

export interface CalendarDiff {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True when the start is later than the end — the magnitudes stay positive. */
  negative: boolean;
}

export interface DiffTotals {
  milliseconds: number;
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
  weeks: number;
  /** Whole calendar months, not days ÷ 30. */
  months: number;
}

export interface BusinessDayReport {
  /** Calendar dates counted, after the include-end-date choice. */
  totalDays: number;
  weekendDays: number;
  holidayDays: number;
  businessDays: number;
  /** Holidays that actually fall inside the range on a weekday, ascending. */
  observed: string[];
}

export interface HolidayParse {
  /** Unique YYYY-MM-DD keys, ascending. */
  dates: string[];
  /** Lines that could not be read as a date. */
  invalid: string[];
}

const MS_PER_DAY = 86_400_000;

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

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Local YYYY-MM-DD, the key holidays are matched on. */
export function isoDateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * The difference as a calendar reads it. Whole months are counted first (so
 * 31 January to 28 February is exactly one month), then whole days, then the
 * leftover time.
 */
export function calendarDiff(a: Date, b: Date): CalendarDiff {
  const negative = a.getTime() > b.getTime();
  const start = negative ? b : a;
  const end = negative ? a : b;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (months > 0 && addMonths(start, months).getTime() > end.getTime()) months -= 1;
  if (months < 0) months = 0;
  const monthAnchor = addMonths(start, months);

  let days = 0;
  // At most one month of days can remain, so this loop is bounded in practice;
  // the cap only guards against a pathological clock.
  while (days < 40 && addDays(monthAnchor, days + 1).getTime() <= end.getTime()) days += 1;
  const dayAnchor = addDays(monthAnchor, days);

  const rest = Math.max(0, Math.floor((end.getTime() - dayAnchor.getTime()) / 1000));
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days,
    hours: Math.floor(rest / 3600),
    minutes: Math.floor((rest % 3600) / 60),
    seconds: rest % 60,
    negative,
  };
}

export function formatCalendarDiff(diff: CalendarDiff): string {
  const parts: string[] = [];
  const push = (value: number, name: string) => {
    if (value !== 0) parts.push(`${value} ${name}${value === 1 ? '' : 's'}`);
  };
  push(diff.years, 'year');
  push(diff.months, 'month');
  push(diff.days, 'day');
  push(diff.hours, 'hour');
  push(diff.minutes, 'minute');
  push(diff.seconds, 'second');
  if (parts.length === 0) return 'No difference at all';
  return parts.join(', ');
}

export function diffTotals(a: Date, b: Date): DiffTotals {
  const ms = Math.abs(b.getTime() - a.getTime());
  const diff = calendarDiff(a, b);
  return {
    milliseconds: ms,
    seconds: Math.floor(ms / 1000),
    minutes: Math.floor(ms / 60_000),
    hours: Math.floor(ms / 3_600_000),
    days: Math.floor(ms / MS_PER_DAY),
    weeks: Math.floor(ms / (MS_PER_DAY * 7)),
    months: diff.years * 12 + diff.months,
  };
}

/**
 * Calendar dates spanned. `includeEnd` is the classic "count the last day too"
 * option: 1 to 3 March is 2 days without it and 3 days with it.
 */
export function calendarDayCount(a: Date, b: Date, includeEnd: boolean): number {
  const first = startOfDay(a.getTime() <= b.getTime() ? a : b);
  const last = startOfDay(a.getTime() <= b.getTime() ? b : a);
  const whole = Math.round((last.getTime() - first.getTime()) / MS_PER_DAY);
  return Math.max(0, whole + (includeEnd ? 1 : 0));
}

/** Saturdays and Sundays inside `dayCount` dates starting at `firstDate`. */
export function countWeekendDays(firstDate: Date, dayCount: number): number {
  if (dayCount <= 0) return 0;
  const weekday = firstDate.getDay();
  let weekend = Math.floor(dayCount / 7) * 2;
  for (let i = 0; i < dayCount % 7; i += 1) {
    const day = (weekday + i) % 7;
    if (day === 0 || day === 6) weekend += 1;
  }
  return weekend;
}

export function businessDayReport(
  a: Date,
  b: Date,
  holidays: string[],
  includeEnd: boolean,
): BusinessDayReport {
  const first = startOfDay(a.getTime() <= b.getTime() ? a : b);
  const totalDays = calendarDayCount(a, b, includeEnd);
  const weekendDays = countWeekendDays(first, totalDays);

  const observed: string[] = [];
  for (const key of new Set(holidays)) {
    const date = dateFromKey(key);
    if (!date) continue;
    const index = Math.round((date.getTime() - first.getTime()) / MS_PER_DAY);
    if (index < 0 || index >= totalDays) continue;
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue;
    observed.push(key);
  }
  observed.sort();

  return {
    totalDays,
    weekendDays,
    holidayDays: observed.length,
    businessDays: Math.max(0, totalDays - weekendDays - observed.length),
    observed,
  };
}

/** Local midnight for a YYYY-MM-DD key, or null when the key is not a real date. */
export function dateFromKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month - 1)) return null;
  return new Date(year, month - 1, day);
}

/**
 * Read a pasted holiday list. One date per line (or separated by commas or
 * semicolons), written year-first: 2026-12-25, 2026/12/25 or 2026.12.25. Any
 * text after the date on the same line is treated as its name and ignored.
 */
export function parseHolidayList(text: string): HolidayParse {
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
    const key = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    if (!dateFromKey(key)) {
      invalid.push(entry);
      continue;
    }
    dates.add(key);
  }
  return { dates: [...dates].sort(), invalid };
}

/** `YYYY-MM-DDTHH:mm:ss` for an `<input type="datetime-local">`. */
export function toLocalInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(
    date.getMinutes(),
  )}:${p(date.getSeconds())}`;
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
