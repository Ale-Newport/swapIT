/**
 * Unix timestamp conversion.
 *
 * The only genuinely tricky part is guessing the unit: 1 700 000 000 is a
 * plausible second count and an implausible millisecond count, so magnitude is
 * a reliable signal as long as the boundaries are stated out loud.
 */

export type TsUnit = 's' | 'ms' | 'us' | 'ns';

export const UNITS: Array<{ id: TsUnit; label: string; short: string; perMs: number }> = [
  { id: 's', label: 'Seconds', short: 's', perMs: 1 / 1000 },
  { id: 'ms', label: 'Milliseconds', short: 'ms', perMs: 1 },
  { id: 'us', label: 'Microseconds', short: 'µs', perMs: 1000 },
  { id: 'ns', label: 'Nanoseconds', short: 'ns', perMs: 1_000_000 },
];

const BY_ID = new Map(UNITS.map((u) => [u.id, u]));

export function unitLabel(unit: TsUnit): string {
  return BY_ID.get(unit)?.label ?? unit;
}

export function unitShort(unit: TsUnit): string {
  return BY_ID.get(unit)?.short ?? unit;
}

/**
 * Guess the unit from magnitude. The thresholds are the points where the next
 * unit stops producing a believable date:
 *   |v| < 1e11   seconds       (up to the year 5138)
 *   |v| < 1e14   milliseconds  (up to the year 5138)
 *   |v| < 1e17   microseconds
 *   otherwise    nanoseconds
 */
export function detectUnit(value: number): TsUnit {
  const magnitude = Math.abs(value);
  if (magnitude < 1e11) return 's';
  if (magnitude < 1e14) return 'ms';
  if (magnitude < 1e17) return 'us';
  return 'ns';
}

export function unitToMs(value: number, unit: TsUnit): number {
  switch (unit) {
    case 's':
      return value * 1000;
    case 'ms':
      return value;
    case 'us':
      return value / 1000;
    case 'ns':
      return value / 1_000_000;
  }
}

export function msToUnit(ms: number, unit: TsUnit): number {
  switch (unit) {
    case 's':
      return Math.floor(ms / 1000);
    case 'ms':
      return Math.round(ms);
    case 'us':
      return Math.round(ms * 1000);
    case 'ns':
      return Math.round(ms * 1_000_000);
  }
}

/** Accepts digits with optional sign, spaces, underscores and thousands separators. */
export function parseTimestampInput(text: string): number | null {
  const cleaned = text.trim().replace(/[\s_,]/g, '');
  if (!cleaned) return null;
  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** The widest instant a JavaScript Date can hold. */
export const MAX_DATE_MS = 8.64e15;

export function isRepresentable(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS;
}

// ------------------------------------------------------------------ formatting

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, '0');
}

export function offsetLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}${pad(Math.abs(minutes) % 60)}`;
}

/** RFC 2822, the format used in email headers: Wed, 10 Sep 2026 14:03:22 +0200 */
export function toRfc2822(date: Date): string {
  return (
    `${DAY_NAMES[date.getDay()]}, ${pad(date.getDate())} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${offsetLabel(date)}`
  );
}

export function toIsoWithOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const offset = `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}${offset}`;
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

/** "3 hours ago", "in 2 days", "just now". */
export function relativePhrase(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (Math.abs(diff) < 1000) return 'right now';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(diff) >= size || unit === 'second') return rtf.format(Math.round(diff / size), unit);
  }
  return '';
}

export const INT32_MAX_SECONDS = 2_147_483_647; // 2038-01-19T03:14:07Z
export const INT32_MIN_SECONDS = -2_147_483_648; // 1901-12-13T20:45:52Z

export interface EpochNote {
  tone: 'info' | 'warn' | 'danger';
  title: string;
  body: string;
}

/** Warnings worth showing beside a value: 32-bit range and the pre-1970 case. */
export function epochNotes(seconds: number): EpochNote[] {
  const notes: EpochNote[] = [];
  if (seconds > INT32_MAX_SECONDS) {
    notes.push({
      tone: 'danger',
      title: 'Past the 32-bit limit',
      body: `This is beyond ${INT32_MAX_SECONDS.toLocaleString()} seconds — 19 January 2038, 03:14:07 UTC. A signed 32-bit time_t cannot hold it and would wrap around to 1901. Systems still using one need a 64-bit value here.`,
    });
  } else if (seconds > INT32_MAX_SECONDS - 31_536_000) {
    notes.push({
      tone: 'warn',
      title: 'Close to the 2038 boundary',
      body: `A signed 32-bit timestamp runs out at ${INT32_MAX_SECONDS.toLocaleString()} seconds — 19 January 2038, 03:14:07 UTC. This value is within a year of it.`,
    });
  }
  if (seconds < 0) {
    notes.push({
      tone: 'info',
      title: 'Before 1970',
      body: 'Negative timestamps count backwards from the Unix epoch. They are valid, but some libraries and databases reject them or read them as unsigned.',
    });
  }
  if (seconds < INT32_MIN_SECONDS) {
    notes.push({
      tone: 'warn',
      title: 'Below the 32-bit floor',
      body: `A signed 32-bit timestamp stops at ${INT32_MIN_SECONDS.toLocaleString()} seconds — 13 December 1901, 20:45:52 UTC.`,
    });
  }
  return notes;
}

export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** ISO week number, used in the summary line. */
export function isoWeek(date: Date): { year: number; week: number } {
  const anchor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = ((anchor.getDay() + 6) % 7) + 1;
  anchor.setDate(anchor.getDate() + 4 - weekday);
  const year = anchor.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.round((anchor.getTime() - jan1.getTime()) / 86_400_000);
  return { year, week: Math.floor(days / 7) + 1 };
}
