/**
 * Cron parsing, plain-English description and next-run calculation.
 *
 * Supports the classic 5-field form and the 6-field form with leading seconds,
 * plus `*`, `?`, ranges, lists, steps, three-letter names and the `@daily`
 * family. Everything is computed in the machine's local time zone, which is
 * what a person reading "next run" expects to see.
 */

export interface FieldSpec {
  key: FieldKey;
  name: string;
  min: number;
  max: number;
  names?: string[];
}

export type FieldKey = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export interface CronField {
  spec: FieldSpec;
  raw: string;
  /** Every matching value, ascending. */
  values: number[];
  /** The raw text was `*` or `?`. */
  isWildcard: boolean;
  /** Set when the field is a bare step such as every 5th value; holds the 5. */
  step: number | null;
}

export interface ParsedCron {
  seconds: CronField | null;
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
  /** The expression after shorthand expansion, normalised to single spaces. */
  expression: string;
  /** True when the input was `@daily` and friends. */
  shorthand: string | null;
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SECOND: FieldSpec = { key: 'second', name: 'seconds', min: 0, max: 59 };
const MINUTE: FieldSpec = { key: 'minute', name: 'minute', min: 0, max: 59 };
const HOUR: FieldSpec = { key: 'hour', name: 'hour', min: 0, max: 23 };
const DOM: FieldSpec = { key: 'dayOfMonth', name: 'day-of-month', min: 1, max: 31 };
const MONTH: FieldSpec = { key: 'month', name: 'month', min: 1, max: 12, names: MONTH_NAMES };
const DOW: FieldSpec = { key: 'dayOfWeek', name: 'day-of-week', min: 0, max: 6, names: DAY_NAMES };

export const SHORTHANDS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

// ------------------------------------------------------------------ parsing

function parseValue(token: string, spec: FieldSpec): number {
  const text = token.trim();
  if (!text) throw new Error(`The ${spec.name} field has an empty value — remove the stray comma or dash.`);

  if (spec.names) {
    const index = spec.names.indexOf(text.toUpperCase().slice(0, 3));
    if (index >= 0 && /^[a-z]+$/i.test(text)) return spec.min + index;
  }

  if (!/^\d+$/.test(text)) {
    if (/#/.test(text) || /^\d*[lw]$/i.test(text)) {
      throw new Error(
        `"${text}" uses an extended cron symbol (L, W or #) in the ${spec.name} field, which this tool does not support. Use explicit values instead.`,
      );
    }
    const nameHint = spec.names ? ` or a name like ${spec.names[0]}` : '';
    throw new Error(`"${text}" is not a valid ${spec.name}. Use a number from ${spec.min} to ${spec.max}${nameHint}.`);
  }

  const value = Number(text);
  // Both 0 and 7 are Sunday in every cron implementation.
  if (spec.key === 'dayOfWeek' && value === 7) return 0;
  if (value < spec.min || value > spec.max) {
    throw new Error(`The ${spec.name} must be between ${spec.min} and ${spec.max} — got ${value}.`);
  }
  return value;
}

function parseFieldPart(part: string, spec: FieldSpec, out: Set<number>): void {
  const chunks = part.split('/');
  if (chunks.length > 2) {
    throw new Error(`"${part}" has more than one "/" in the ${spec.name} field. Write a single step, like */5.`);
  }
  const [rangeText, stepText] = chunks;

  let step = 1;
  if (stepText !== undefined) {
    const trimmed = stepText.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`The step after "/" in "${part}" must be a whole number, like */5.`);
    }
    step = Number(trimmed);
    if (step === 0) throw new Error(`A step of 0 in "${part}" would never run. Use 1 or more.`);
  }

  const range = rangeText.trim();
  let start: number;
  let end: number;

  if (range === '*' || range === '?') {
    start = spec.min;
    end = spec.max;
  } else if (range.includes('-')) {
    const bounds = range.split('-');
    if (bounds.length !== 2) {
      throw new Error(`"${range}" is not a valid range in the ${spec.name} field. Write it as 1-5.`);
    }
    start = parseValue(bounds[0], spec);
    end = parseValue(bounds[1], spec);
  } else {
    start = parseValue(range, spec);
    // "5/15" means "from 5 to the end of the field, every 15".
    end = stepText !== undefined ? spec.max : start;
  }

  if (start <= end) {
    for (let v = start; v <= end; v += step) out.add(v);
  } else {
    // A wrapping range such as 22-2 (hours) or FRI-MON (days).
    const span = spec.max - spec.min + 1;
    for (let i = 0; i <= (end + span - start) % span; i += step) {
      out.add(spec.min + ((start - spec.min + i) % span));
    }
  }
}

export function parseField(raw: string, spec: FieldSpec): CronField {
  const text = raw.trim();
  if (!text) throw new Error(`The ${spec.name} field is empty.`);

  const values = new Set<number>();
  for (const part of text.split(',')) {
    if (!part.trim()) throw new Error(`The ${spec.name} field has an empty item — check the commas in "${text}".`);
    parseFieldPart(part, spec, values);
  }

  const stepMatch = /^\*\/(\d+)$/.exec(text);
  return {
    spec,
    raw: text,
    values: [...values].sort((a, b) => a - b),
    isWildcard: text === '*' || text === '?',
    step: stepMatch ? Number(stepMatch[1]) : null,
  };
}

export function parseCron(expression: string): ParsedCron {
  const input = expression.trim();
  if (!input) throw new Error('Type a cron expression, for example "30 2 * * *".');

  let shorthand: string | null = null;
  let body = input;

  if (input.startsWith('@')) {
    const key = input.toLowerCase();
    if (key === '@reboot') {
      throw new Error('"@reboot" runs once when the machine starts, so it has no schedule to preview.');
    }
    const expanded = SHORTHANDS[key];
    if (!expanded) {
      throw new Error(`"${input}" is not a cron shorthand. Try ${Object.keys(SHORTHANDS).slice(0, 5).join(', ')}.`);
    }
    shorthand = key;
    body = expanded;
  }

  const fields = body.split(/\s+/).filter(Boolean);
  if (fields.length !== 5 && fields.length !== 6) {
    throw new Error(
      `A cron expression needs 5 fields (minute hour day-of-month month day-of-week), or 6 when it starts with seconds — this has ${fields.length}.`,
    );
  }

  const withSeconds = fields.length === 6;
  const secondText = withSeconds ? fields[0] : null;
  const [minuteText, hourText, domText, monthText, dowText] = withSeconds ? fields.slice(1) : fields;

  return {
    seconds: secondText === null ? null : parseField(secondText, SECOND),
    minute: parseField(minuteText, MINUTE),
    hour: parseField(hourText, HOUR),
    dayOfMonth: parseField(domText, DOM),
    month: parseField(monthText, MONTH),
    dayOfWeek: parseField(dowText, DOW),
    expression: fields.join(' '),
    shorthand,
  };
}

// ------------------------------------------------------------------ describe

const pad = (n: number): string => String(n).padStart(2, '0');

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

type Kind = 'every' | 'step' | 'single' | 'list';

function kindOf(field: CronField): Kind {
  if (field.isWildcard) return 'every';
  if (field.step !== null) return 'step';
  if (field.values.length === 1) return 'single';
  return 'list';
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function unitClause(field: CronField, unit: string): string {
  switch (kindOf(field)) {
    case 'every':
      return `every ${unit}`;
    case 'step':
      return `every ${ordinal(field.step as number)} ${unit}`;
    case 'single':
      return `${unit} ${field.values[0]}`;
    default:
      return `${unit}s ${joinList(field.values.map(String))}`;
  }
}

function timePhrase(parsed: ParsedCron): string {
  const { minute, hour, seconds } = parsed;
  const minuteKind = kindOf(minute);
  const hourKind = kindOf(hour);
  const secondKind = seconds ? kindOf(seconds) : null;

  if (seconds && secondKind === 'single' && minuteKind === 'single' && hourKind === 'single') {
    return `At ${pad(hour.values[0])}:${pad(minute.values[0])}:${pad(seconds.values[0])}`;
  }
  if (seconds && minuteKind === 'every' && hourKind === 'every') {
    if (secondKind === 'every') return 'Every second';
    if (secondKind === 'step') return `Every ${seconds.step} seconds`;
  }

  let base: string;
  if (minuteKind === 'every') {
    base = hourKind === 'every' ? 'Every minute' : `Every minute of ${unitClause(hour, 'hour')}`;
  } else if (minuteKind === 'step' && hourKind === 'every') {
    base = `Every ${minute.step} minutes`;
  } else if (minuteKind === 'single' && hourKind === 'single') {
    base = `At ${pad(hour.values[0])}:${pad(minute.values[0])}`;
  } else if (minuteKind === 'single' && hourKind === 'list' && hour.values.length <= 6) {
    base = `At ${joinList(hour.values.map((h) => `${pad(h)}:${pad(minute.values[0])}`))}`;
  } else {
    base = `At ${unitClause(minute, 'minute')} past ${unitClause(hour, 'hour')}`;
  }

  if (seconds && secondKind !== null && !(secondKind === 'single' && seconds.values[0] === 0)) {
    base += `, at ${unitClause(seconds, 'second')}`;
  }
  return base;
}

function dayPhrase(parsed: ParsedCron): string {
  const { dayOfMonth, dayOfWeek } = parsed;
  const domRestricted = !dayOfMonth.isWildcard;
  const dowRestricted = !dayOfWeek.isWildcard;

  const domClause = (): string => {
    if (dayOfMonth.step !== null) return `every ${ordinal(dayOfMonth.step)} day-of-month`;
    return `day-of-month ${joinList(dayOfMonth.values.map(String))}`;
  };
  const dowClause = (): string => {
    if (dayOfWeek.step !== null) return `every ${ordinal(dayOfWeek.step)} day-of-week`;
    return joinList(dayOfWeek.values.map((d) => DAY_LABELS[d]));
  };

  if (domRestricted && dowRestricted) return `on ${domClause()} or on ${dowClause()}`;
  if (domRestricted) return `on ${domClause()}`;
  if (dowRestricted) return `on ${dowClause()}`;
  return 'on every day-of-month';
}

function monthPhrase(parsed: ParsedCron): string {
  const { month } = parsed;
  if (month.isWildcard) return '';
  if (month.step !== null) return `, in every ${ordinal(month.step)} month`;
  return `, only in ${joinList(month.values.map((m) => MONTH_LABELS[m - 1]))}`;
}

/** "At 02:30 on every day-of-month, only in January" */
export function describeCron(parsed: ParsedCron): string {
  return `${timePhrase(parsed)} ${dayPhrase(parsed)}${monthPhrase(parsed)}`;
}

/** A compact "0, 15, 30 and 45" style summary for the field table. */
export function fieldSummary(field: CronField): string {
  if (field.isWildcard) return `every ${field.spec.name}`;
  if (field.values.length > 12) return `${field.values.length} values: ${field.values.slice(0, 12).join(', ')}…`;
  if (field.spec.key === 'month') return joinList(field.values.map((m) => MONTH_LABELS[m - 1]));
  if (field.spec.key === 'dayOfWeek') return joinList(field.values.map((d) => DAY_LABELS[d]));
  return joinList(field.values.map(String));
}

// ------------------------------------------------------------------ next runs

function dayMatches(parsed: ParsedCron, date: Date, dom: Set<number>, dow: Set<number>): boolean {
  const domRestricted = !parsed.dayOfMonth.isWildcard;
  const dowRestricted = !parsed.dayOfWeek.isWildcard;
  const domOk = dom.has(date.getDate());
  const dowOk = dow.has(date.getDay());
  // The classic rule: when both are restricted the schedule fires on either.
  if (domRestricted && dowRestricted) return domOk || dowOk;
  if (domRestricted) return domOk;
  if (dowRestricted) return dowOk;
  return true;
}

export const SEARCH_YEARS = 50;

/**
 * The next `count` fire times at or after `from`, in local time. Returns fewer
 * (or none) when the expression cannot match inside the search window — a
 * schedule like "30 February" is legal to write but never runs.
 */
export function nextRuns(parsed: ParsedCron, from: Date = new Date(), count = 10): Date[] {
  const hasSeconds = parsed.seconds !== null;
  const seconds = new Set(parsed.seconds?.values ?? [0]);
  const minutes = new Set(parsed.minute.values);
  const hours = new Set(parsed.hour.values);
  const months = new Set(parsed.month.values);
  const dom = new Set(parsed.dayOfMonth.values);
  const dow = new Set(parsed.dayOfWeek.values);

  const stepMs = hasSeconds ? 1000 : 60_000;
  const cursor = new Date(from.getTime());
  cursor.setMilliseconds(0);
  if (hasSeconds) {
    cursor.setSeconds(cursor.getSeconds() + 1);
  } else {
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  const limit = new Date(from.getTime());
  limit.setFullYear(limit.getFullYear() + SEARCH_YEARS);

  const out: Date[] = [];
  let guard = 0;

  while (out.length < count && cursor.getTime() <= limit.getTime()) {
    if (guard++ > 2_000_000) break;
    const before = cursor.getTime();

    if (!months.has(cursor.getMonth() + 1)) {
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      cursor.setMonth(cursor.getMonth() + 1);
    } else if (!dayMatches(parsed, cursor, dom, dow)) {
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() + 1);
    } else if (!hours.has(cursor.getHours())) {
      cursor.setMinutes(0, 0, 0);
      cursor.setHours(cursor.getHours() + 1);
    } else if (!minutes.has(cursor.getMinutes())) {
      cursor.setSeconds(0, 0);
      cursor.setMinutes(cursor.getMinutes() + 1);
    } else if (hasSeconds && !seconds.has(cursor.getSeconds())) {
      cursor.setMilliseconds(0);
      cursor.setSeconds(cursor.getSeconds() + 1);
    } else {
      out.push(new Date(cursor.getTime()));
      if (hasSeconds) {
        cursor.setSeconds(cursor.getSeconds() + 1);
      } else {
        cursor.setSeconds(0, 0);
        cursor.setMinutes(cursor.getMinutes() + 1);
      }
    }

    // A DST fold can push a wall-clock advance backwards; never lose ground.
    if (cursor.getTime() <= before) cursor.setTime(before + stepMs);
  }

  return out;
}

/** Milliseconds until the next run, or null when there is none. */
export function timeUntil(parsed: ParsedCron, from: Date = new Date()): number | null {
  const [next] = nextRuns(parsed, from, 1);
  return next ? next.getTime() - from.getTime() : null;
}
