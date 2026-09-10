/**
 * Duration conversion in both directions: a number of seconds into readable
 * text, and readable text back into a number.
 *
 * The clock form reuses `formatTimecode` from `@/core/format`, so a duration
 * reads the same here as it does everywhere else in the app. The word forms are
 * local because this tool has to keep durations shorter than a second — the
 * app-wide `formatLongDuration` floors to whole seconds and would report
 * "500ms" as zero.
 */

import { formatTimecode, parseTimecode } from '@/core/format';

export type DurationUnit = 'ms' | 's' | 'min' | 'h' | 'd' | 'w';

export const UNIT_SECONDS: Record<DurationUnit, number> = {
  ms: 0.001,
  s: 1,
  min: 60,
  h: 3600,
  d: 86_400,
  w: 604_800,
};

export const UNIT_LABELS: Record<DurationUnit, string> = {
  ms: 'Milliseconds',
  s: 'Seconds',
  min: 'Minutes',
  h: 'Hours',
  d: 'Days',
  w: 'Weeks',
};

export function toSeconds(value: number, unit: DurationUnit): number {
  return value * UNIT_SECONDS[unit];
}

export function fromSeconds(seconds: number, unit: DurationUnit): number {
  return seconds / UNIT_SECONDS[unit];
}

export interface DurationBreakdown {
  years: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  negative: boolean;
}

const YEAR_SECONDS = 31_536_000; // 365 days, matching formatLongDuration
const YEAR_MS = YEAR_SECONDS * 1000;

/**
 * Split a duration into whole units. The maths runs in whole milliseconds so a
 * value like 0.5 keeps its 500 ms instead of being floored away, and so a
 * rounding edge such as 0.9999 s cannot produce "1000 ms".
 */
export function breakdown(totalSeconds: number): DurationBreakdown {
  const negative = totalSeconds < 0;
  if (!Number.isFinite(totalSeconds)) {
    return { years: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0, negative };
  }
  let rest = Math.round(Math.abs(totalSeconds) * 1000);
  const years = Math.floor(rest / YEAR_MS);
  rest -= years * YEAR_MS;
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1000);
  rest -= seconds * 1000;
  return { years, days, hours, minutes, seconds, milliseconds: rest, negative };
}

interface UnitCount {
  value: number;
  short: string;
  long: string;
}

function unitCounts(parts: DurationBreakdown): UnitCount[] {
  return [
    { value: parts.years, short: 'y', long: 'year' },
    { value: parts.days, short: 'd', long: 'day' },
    { value: parts.hours, short: 'h', long: 'hour' },
    { value: parts.minutes, short: 'm', long: 'minute' },
    { value: parts.seconds, short: 's', long: 'second' },
    { value: parts.milliseconds, short: 'ms', long: 'millisecond' },
  ].filter((unit) => unit.value > 0);
}

/** "10d 17h 12m 54s", and "500ms" for anything shorter than a second. */
export function formatCompact(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const parts = breakdown(totalSeconds);
  const pieces = unitCounts(parts).map((unit) => `${unit.value}${unit.short}`);
  if (pieces.length === 0) return '0s';
  return `${parts.negative ? '-' : ''}${pieces.join(' ')}`;
}

/**
 * "10 days, 17 hours, 12 minutes, 54 seconds". Unlike `formatLongDuration` in
 * `@/core/format`, which floors to whole seconds, this keeps the millisecond
 * remainder — half a second reads as "500 milliseconds", not "0 seconds".
 */
export function formatLong(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const parts = breakdown(totalSeconds);
  const pieces = unitCounts(parts).map(
    (unit) => `${unit.value} ${unit.long}${unit.value === 1 ? '' : 's'}`,
  );
  if (pieces.length === 0) return '0 seconds';
  return `${parts.negative ? '-' : ''}${pieces.join(', ')}`;
}

/** HH:MM:SS, where the hours field keeps counting past 24. */
export function formatClock(totalSeconds: number, withMillis = false): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const negative = totalSeconds < 0;
  return `${negative ? '-' : ''}${formatTimecode(Math.abs(totalSeconds), withMillis)}`;
}

/** An exact ISO 8601 duration — days and below, since months have no fixed length. */
export function toIsoDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return 'PT0S';
  const negative = totalSeconds < 0;
  let rest = Math.abs(totalSeconds);
  const days = Math.floor(rest / 86_400);
  rest -= days * 86_400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  rest -= minutes * 60;
  const seconds = Math.round(rest * 1000) / 1000;

  const datePart = days ? `${days}D` : '';
  const timePart = `${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${seconds ? `${seconds}S` : ''}`;
  if (!datePart && !timePart) return 'PT0S';
  return `${negative ? '-' : ''}P${datePart}${timePart ? `T${timePart}` : ''}`;
}

const TOKEN_UNITS: Array<[RegExp, number]> = [
  [/^(?:ms|msecs?|millisecs?|milliseconds?)$/i, 0.001],
  [/^(?:s|secs?|seconds?)$/i, 1],
  [/^(?:m|mins?|minutes?)$/i, 60],
  [/^(?:h|hrs?|hours?)$/i, 3600],
  [/^(?:d|days?)$/i, 86_400],
  [/^(?:w|wks?|weeks?)$/i, 604_800],
  [/^(?:y|yrs?|years?)$/i, YEAR_SECONDS],
];

function unitSeconds(token: string): number {
  for (const [pattern, size] of TOKEN_UNITS) {
    if (pattern.test(token)) return size;
  }
  return 0;
}

/**
 * Read "2h 30m", "01:30:00", "1 day 4 hours", "500ms" or a bare number of
 * seconds. Throws a sentence explaining the problem when it cannot.
 */
export function parseHumanDuration(input: string): number {
  const raw = input.trim();
  if (!raw) throw new Error('Type a duration such as "2h 30m", "01:30:00" or "5400".');

  const negative = raw.startsWith('-');
  const body = (negative ? raw.slice(1) : raw).trim();

  // Clock form: 1:30, 01:30:00, 25:00:00, 00:00:01.250
  if (/^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(body)) {
    const value = parseTimecode(body);
    if (value === null) throw new Error(`"${raw}" is not a clock value this tool can read.`);
    return negative ? -value : value;
  }

  // A bare number means seconds.
  if (/^\d+(?:[.,]\d+)?$/.test(body)) {
    const value = Number(body.replace(',', '.'));
    return negative ? -value : value;
  }

  const token = /(-?\d+(?:[.,]\d+)?)\s*([a-z]+)/gi;
  let total = 0;
  let matched = 0;
  for (const match of body.matchAll(token)) {
    const size = unitSeconds(match[2]);
    if (size === 0) {
      throw new Error(
        `"${match[2]}" is not a unit this tool knows. Use ms, s, m, h, d, w or y — for example "2h 30m".`,
      );
    }
    total += Number(match[1].replace(',', '.')) * size;
    matched += 1;
  }

  if (matched === 0) {
    throw new Error(`"${raw}" is not a duration. Try "2h 30m", "01:30:00", "1 day" or a plain number of seconds.`);
  }

  const leftover = body
    .replace(token, ' ')
    .replace(/\band\b/gi, ' ')
    .replace(/[\s,+]/g, '');
  if (leftover) {
    throw new Error(`"${leftover}" was left over and could not be read as part of a duration.`);
  }

  return negative ? -total : total;
}

export interface Equivalent {
  label: string;
  value: string;
}

function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return value.toLocaleString();
  const rounded = Math.abs(value) >= 1 ? value.toFixed(3) : value.toPrecision(4);
  return Number(rounded).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/** The same duration counted in each unit, for the equivalents grid. */
export function equivalents(totalSeconds: number): Equivalent[] {
  return [
    { label: 'Weeks', value: trimNumber(totalSeconds / 604_800) },
    { label: 'Days', value: trimNumber(totalSeconds / 86_400) },
    { label: 'Hours', value: trimNumber(totalSeconds / 3600) },
    { label: 'Minutes', value: trimNumber(totalSeconds / 60) },
    { label: 'Seconds', value: trimNumber(totalSeconds) },
    { label: 'Milliseconds', value: trimNumber(totalSeconds * 1000) },
  ];
}
