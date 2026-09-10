/**
 * ISO 8601 reading and writing.
 *
 * The standard covers four things this tool cares about: calendar date-times
 * (2024-04-15T09:30:00Z), week dates (2024-W03-1), ordinal dates (2024-045) and
 * durations (P1Y2M3DT4H5M6S) — plus intervals, which glue two of those together
 * with a slash. Each parser returns the parsed value *and* a list of components
 * so the tool can explain what every piece of the string meant.
 */

export interface IsoComponent {
  label: string;
  value: string;
  note?: string;
}

export interface IsoDuration {
  negative: boolean;
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const ZERO_DURATION: IsoDuration = {
  negative: false,
  years: 0,
  months: 0,
  weeks: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
};

export interface IsoDateTimeResult {
  kind: 'datetime';
  date: Date;
  form: string;
  components: IsoComponent[];
}

export interface IsoDurationResult {
  kind: 'duration';
  duration: IsoDuration;
  form: string;
  components: IsoComponent[];
}

export interface IsoIntervalResult {
  kind: 'interval';
  form: string;
  components: IsoComponent[];
  start: Date | null;
  end: Date | null;
  duration: IsoDuration | null;
  /** -1 means "repeat forever" (a bare R), null means the string was not repeating. */
  repeats: number | null;
}

export type IsoResult = IsoDateTimeResult | IsoDurationResult | IsoIntervalResult;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ------------------------------------------------------------------ helpers

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, '0');
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

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

// ------------------------------------------------------------------ week and ordinal dates

export function isoWeekOf(date: Date): { year: number; week: number; weekday: number } {
  const anchor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = ((anchor.getDay() + 6) % 7) + 1; // 1 = Monday … 7 = Sunday
  anchor.setDate(anchor.getDate() + 4 - weekday);
  const year = anchor.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.round((anchor.getTime() - jan1.getTime()) / 86_400_000);
  return { year, week: Math.floor(days / 7) + 1, weekday };
}

export function weeksInIsoYear(year: number): number {
  return isoWeekOf(new Date(year, 11, 28)).week;
}

export function fromWeekDate(year: number, week: number, weekday: number): Date {
  const total = weeksInIsoYear(year);
  if (week < 1 || week > total) {
    throw new Error(`${year} has ${total} ISO weeks, so W${pad(week)} does not exist.`);
  }
  if (weekday < 1 || weekday > 7) {
    throw new Error('The day of an ISO week runs from 1 (Monday) to 7 (Sunday).');
  }
  const jan4 = new Date(year, 0, 4);
  const jan4Weekday = ((jan4.getDay() + 6) % 7) + 1;
  const week1Monday = new Date(year, 0, 4 - (jan4Weekday - 1));
  return addDays(week1Monday, (week - 1) * 7 + (weekday - 1));
}

export function ordinalOf(date: Date): { year: number; day: number } {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return { year: date.getFullYear(), day: Math.round((today.getTime() - jan1.getTime()) / 86_400_000) + 1 };
}

export function fromOrdinalDate(year: number, day: number): Date {
  const length = isLeapYear(year) ? 366 : 365;
  if (day < 1 || day > length) {
    throw new Error(`${year} has ${length} days, so day ${day} does not exist.`);
  }
  return new Date(year, 0, day);
}

// ------------------------------------------------------------------ durations

const DURATION_RE =
  /^([+-])?P(?!$)(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?!$)(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i;

function decimal(raw: string | undefined): number {
  if (raw === undefined) return 0;
  return Number(raw.replace(',', '.'));
}

export function looksLikeDuration(text: string): boolean {
  return /^[+-]?P/i.test(text.trim());
}

export function parseIsoDuration(text: string): IsoDuration {
  const trimmed = text.trim();
  const match = DURATION_RE.exec(trimmed);
  if (!match) {
    throw new Error(
      'A duration is written P then the date parts and, after a T, the time parts — for example P1Y2M3DT4H5M6S or PT45M.',
    );
  }
  return {
    negative: match[1] === '-',
    years: decimal(match[2]),
    months: decimal(match[3]),
    weeks: decimal(match[4]),
    days: decimal(match[5]),
    hours: decimal(match[6]),
    minutes: decimal(match[7]),
    seconds: decimal(match[8]),
  };
}

export function formatIsoDuration(duration: IsoDuration): string {
  const trim = (value: number, suffix: string) => (value === 0 ? '' : `${value}${suffix}`);
  const datePart = `${trim(duration.years, 'Y')}${trim(duration.months, 'M')}${trim(duration.weeks, 'W')}${trim(
    duration.days,
    'D',
  )}`;
  const timePart = `${trim(duration.hours, 'H')}${trim(duration.minutes, 'M')}${trim(duration.seconds, 'S')}`;
  if (!datePart && !timePart) return 'PT0S';
  return `${duration.negative ? '-' : ''}P${datePart}${timePart ? `T${timePart}` : ''}`;
}

const DAYS_PER_YEAR = 365.2425;
const DAYS_PER_MONTH = 30.436875;

/**
 * Seconds in a duration. Years and months have no fixed length, so a duration
 * that uses them can only be approximated — the flag says so out loud.
 */
export function durationSeconds(duration: IsoDuration): { seconds: number; approximate: boolean } {
  const approximate = duration.years !== 0 || duration.months !== 0;
  const days = duration.years * DAYS_PER_YEAR + duration.months * DAYS_PER_MONTH + duration.weeks * 7 + duration.days;
  const seconds = days * 86_400 + duration.hours * 3600 + duration.minutes * 60 + duration.seconds;
  return { seconds: duration.negative ? -seconds : seconds, approximate };
}

export function describeDuration(duration: IsoDuration): string {
  const parts: string[] = [];
  const push = (value: number, singular: string) => {
    if (value !== 0) parts.push(`${value} ${singular}${value === 1 ? '' : 's'}`);
  };
  push(duration.years, 'year');
  push(duration.months, 'month');
  push(duration.weeks, 'week');
  push(duration.days, 'day');
  push(duration.hours, 'hour');
  push(duration.minutes, 'minute');
  push(duration.seconds, 'second');
  if (parts.length === 0) return 'zero';
  return `${duration.negative ? 'minus ' : ''}${parts.join(', ')}`;
}

/** Apply a duration to a date. Fractional years and months have no fixed size. */
export function applyDuration(date: Date, duration: IsoDuration, sign: 1 | -1 = 1): Date {
  const direction = duration.negative ? -sign : sign;
  if (!Number.isInteger(duration.years) || !Number.isInteger(duration.months)) {
    throw new Error(
      'A fractional number of years or months has no fixed length, so it cannot be added to a date. Use days instead.',
    );
  }
  let out = new Date(date.getTime());
  const months = direction * (duration.years * 12 + duration.months);
  if (months !== 0) out = addMonths(out, months);
  const days = duration.weeks * 7 + duration.days;
  if (days !== 0) {
    if (Number.isInteger(days)) out = addDays(out, direction * days);
    else out = new Date(out.getTime() + direction * days * 86_400_000);
  }
  const seconds = duration.hours * 3600 + duration.minutes * 60 + duration.seconds;
  if (seconds !== 0) out = new Date(out.getTime() + direction * seconds * 1000);
  return out;
}

// ------------------------------------------------------------------ date-time parsing

const WEEK_DATE_RE = /^(\d{4})-?W(\d{2})(?:-?([1-7]))?$/i;
const ORDINAL_DATE_RE = /^(\d{4})-?(\d{3})$/;
const CALENDAR_DATE_RE = /^(\d{4})(?:(-)?(\d{2})(?:\2?(\d{2}))?)?$/;
const TIME_RE = /^(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d{1,9}))?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

interface DatePartResult {
  year: number;
  month: number;
  day: number;
  form: string;
  extended: boolean;
  components: IsoComponent[];
  /** Precision the string actually carried. */
  precision: 'year' | 'month' | 'day';
}

function parseDatePart(text: string): DatePartResult {
  const week = WEEK_DATE_RE.exec(text);
  if (week) {
    const year = Number(week[1]);
    const weekNumber = Number(week[2]);
    const weekday = week[3] ? Number(week[3]) : 1;
    const date = fromWeekDate(year, weekNumber, weekday);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      form: 'Week date',
      extended: text.includes('-'),
      precision: 'day',
      components: [
        { label: 'ISO week year', value: String(year), note: 'the year the week belongs to, which can differ from the calendar year' },
        { label: 'Week', value: `W${pad(weekNumber)}`, note: `${year} has ${weeksInIsoYear(year)} ISO weeks` },
        {
          label: 'Day of week',
          value: String(weekday),
          note: week[3] ? WEEKDAY_NAMES[weekday - 1] : `not given, so Monday is assumed`,
        },
      ],
    };
  }

  const ordinal = ORDINAL_DATE_RE.exec(text);
  if (ordinal) {
    const year = Number(ordinal[1]);
    const dayOfYear = Number(ordinal[2]);
    const date = fromOrdinalDate(year, dayOfYear);
    return {
      year,
      month: date.getMonth() + 1,
      day: date.getDate(),
      form: 'Ordinal date',
      extended: text.includes('-'),
      precision: 'day',
      components: [
        { label: 'Year', value: String(year), note: isLeapYear(year) ? 'a leap year, 366 days' : '365 days' },
        {
          label: 'Day of year',
          value: pad(dayOfYear, 3),
          note: `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`,
        },
      ],
    };
  }

  const calendar = CALENDAR_DATE_RE.exec(text);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = calendar[3] ? Number(calendar[3]) : 1;
    const day = calendar[4] ? Number(calendar[4]) : 1;
    if (month < 1 || month > 12) throw new Error(`There is no month ${month}. Months run from 01 to 12.`);
    if (day < 1 || day > daysInMonth(year, month - 1)) {
      throw new Error(`${MONTH_NAMES[month - 1]} ${year} has ${daysInMonth(year, month - 1)} days, so ${day} is not one of them.`);
    }
    const components: IsoComponent[] = [
      { label: 'Year', value: pad(year, 4), note: isLeapYear(year) ? 'a leap year' : undefined },
    ];
    if (calendar[3]) components.push({ label: 'Month', value: pad(month), note: MONTH_NAMES[month - 1] });
    else components.push({ label: 'Month', value: '—', note: 'not given, so January is assumed' });
    if (calendar[4]) components.push({ label: 'Day', value: pad(day), note: WEEKDAY_NAMES[((new Date(year, month - 1, day).getDay() + 6) % 7)] });
    else components.push({ label: 'Day', value: '—', note: 'not given, so the 1st is assumed' });
    return {
      year,
      month,
      day,
      form: 'Calendar date',
      extended: Boolean(calendar[2]),
      precision: calendar[4] ? 'day' : calendar[3] ? 'month' : 'year',
      components,
    };
  }

  throw new Error(
    `"${text}" is not an ISO 8601 date. Try 2024-04-15, 20240415, 2024-W03-1 for a week date or 2024-045 for an ordinal date.`,
  );
}

interface TimePartResult {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  offsetMinutes: number | null;
  designator: string | null;
  extended: boolean;
  components: IsoComponent[];
}

function parseTimePart(text: string): TimePartResult {
  const match = TIME_RE.exec(text);
  if (!match) {
    throw new Error(`"${text}" is not an ISO 8601 time. Try 09:30, 09:30:15, 093015 or 09:30:15.250Z.`);
  }
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const second = match[3] ? Number(match[3]) : 0;
  const fraction = match[4] ?? '';
  const millisecond = fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0;
  if (hour > 24) throw new Error('Hours run from 00 to 24, where 24 only ever means midnight at the end of a day.');
  if (hour === 24 && (minute !== 0 || second !== 0 || millisecond !== 0)) {
    throw new Error('Hour 24 only means midnight ending the day, so 24:00:00 is the only time it can carry.');
  }
  if (minute > 59) throw new Error('Minutes run from 00 to 59.');
  if (second > 60) throw new Error('Seconds run from 00 to 60, where 60 is a leap second.');

  const designator = match[5] ?? null;
  let offsetMinutes: number | null = null;
  if (designator) {
    if (/^z$/i.test(designator)) offsetMinutes = 0;
    else {
      const sign = designator.startsWith('-') ? -1 : 1;
      const digits = designator.slice(1).replace(':', '');
      offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || '0'));
    }
  }

  const components: IsoComponent[] = [
    { label: 'Hour', value: pad(hour), note: hour === 24 ? 'midnight ending the day' : undefined },
    { label: 'Minute', value: match[2] ? pad(minute) : '—', note: match[2] ? undefined : 'not given, so 00' },
    { label: 'Second', value: match[3] ? pad(second) : '—', note: match[3] ? undefined : 'not given, so 00' },
  ];
  if (fraction) {
    components.push({
      label: 'Fraction',
      value: `.${fraction}`,
      note: `${millisecond} ms — this app keeps millisecond precision`,
    });
  }
  components.push({
    label: 'Zone',
    value: designator ?? '—',
    note:
      offsetMinutes === null
        ? 'no designator, so the string means local time wherever it is read'
        : offsetMinutes === 0
          ? /^z$/i.test(designator ?? '')
            ? 'Z means UTC, sometimes read aloud as "Zulu"'
            : 'exactly UTC'
          : `${offsetMinutes > 0 ? 'ahead of' : 'behind'} UTC by ${Math.abs(offsetMinutes) / 60} hours`,
  });

  return {
    hour,
    minute,
    second,
    millisecond,
    offsetMinutes,
    designator,
    extended: text.includes(':'),
    components,
  };
}

function buildDate(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number; second: number; millisecond: number; offsetMinutes: number | null } | null,
): Date {
  const hour = time?.hour ?? 0;
  // 24:00 is the midnight that ends a day, which is the same instant as 00:00
  // on the next one — expressing it that way keeps the arithmetic honest.
  const rollover = hour === 24;
  const day = date.day + (rollover ? 1 : 0);
  if (time && time.offsetMinutes !== null) {
    const utc = new Date(0);
    utc.setUTCFullYear(date.year, date.month - 1, day);
    utc.setUTCHours(rollover ? 0 : hour, time.minute, time.second, time.millisecond);
    return new Date(utc.getTime() - time.offsetMinutes * 60_000);
  }
  return new Date(
    date.year,
    date.month - 1,
    day,
    rollover ? 0 : hour,
    time?.minute ?? 0,
    time?.second ?? 0,
    time?.millisecond ?? 0,
  );
}

function splitDateTime(input: string): { datePart: string; timePart: string | null } {
  const index = input.search(/[T ]/);
  if (index < 0) return { datePart: input, timePart: null };
  return { datePart: input.slice(0, index), timePart: input.slice(index + 1) };
}

export function parseIsoDateTime(input: string): IsoDateTimeResult {
  const trimmed = input.trim();
  const { datePart, timePart } = splitDateTime(trimmed);

  if (!datePart) {
    if (!timePart) throw new Error('There is nothing to read here.');
    const time = parseTimePart(timePart);
    const today = new Date();
    const date = buildDate(
      { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() },
      time,
    );
    return {
      kind: 'datetime',
      date,
      form: `Time of day only, ${time.extended ? 'extended' : 'basic'} format`,
      components: [
        { label: 'Date', value: '—', note: 'the string carries no date, so today is used' },
        ...time.components,
      ],
    };
  }

  const parsedDate = parseDatePart(datePart);
  const time = timePart ? parseTimePart(timePart) : null;
  const date = buildDate(parsedDate, time);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Those components do not make a date this app can represent.');
  }

  const extended = timePart ? parsedDate.extended || time!.extended : parsedDate.extended;
  const form = `${parsedDate.form}${timePart ? ' and time' : ''}, ${extended ? 'extended' : 'basic'} format`;

  return {
    kind: 'datetime',
    date,
    form,
    components: [
      ...parsedDate.components,
      ...(time ? time.components : [{ label: 'Time', value: '—', note: 'no time given, so midnight is used' }]),
    ],
  };
}

// ------------------------------------------------------------------ intervals

function parseIntervalPart(part: string): { date: Date | null; duration: IsoDuration | null } {
  if (looksLikeDuration(part)) return { date: null, duration: parseIsoDuration(part) };
  return { date: parseIsoDateTime(part).date, duration: null };
}

export function parseIsoInterval(input: string): IsoIntervalResult {
  const pieces = input.trim().split('/');
  let repeats: number | null = null;
  if (/^R\d*$/i.test(pieces[0])) {
    const digits = pieces[0].slice(1);
    repeats = digits ? Number(digits) : -1;
    pieces.shift();
  }
  if (pieces.length !== 2) {
    throw new Error(
      'An interval is two values separated by a slash: start/end, start/duration, duration/end, or R5/start/duration to repeat it.',
    );
  }

  const left = parseIntervalPart(pieces[0]);
  const right = parseIntervalPart(pieces[1]);

  let start: Date | null = null;
  let end: Date | null = null;
  let duration: IsoDuration | null = null;
  let form = '';

  if (left.date && right.date) {
    start = left.date;
    end = right.date;
    form = 'Interval, start and end';
  } else if (left.date && right.duration) {
    start = left.date;
    duration = right.duration;
    end = applyDuration(left.date, right.duration, 1);
    form = 'Interval, start and duration';
  } else if (left.duration && right.date) {
    end = right.date;
    duration = left.duration;
    start = applyDuration(right.date, left.duration, -1);
    form = 'Interval, duration and end';
  } else {
    throw new Error('An interval needs at least one date — two durations do not describe a period in time.');
  }

  // A side written as a duration is not itself the instant, so show the instant
  // that was worked out from the other side rather than echoing the duration.
  const components: IsoComponent[] = [
    {
      label: 'Start',
      value: left.duration && start ? start.toISOString() : pieces[0],
      note: left.duration ? `worked out from the end and the duration ${pieces[0]}` : undefined,
    },
    {
      label: 'End',
      value: right.duration && end ? end.toISOString() : pieces[1],
      note: right.duration ? `worked out from the start and the duration ${pieces[1]}` : undefined,
    },
  ];
  if (duration) {
    components.push({ label: 'Duration', value: formatIsoDuration(duration), note: describeDuration(duration) });
  } else if (start && end) {
    components.push({
      label: 'Length',
      value: `${Math.abs(Math.round((end.getTime() - start.getTime()) / 1000)).toLocaleString()} s`,
      note: 'exact elapsed time between the two instants',
    });
  }
  if (repeats !== null) {
    components.push({
      label: 'Repeats',
      value: repeats === -1 ? 'R' : `R${repeats}`,
      note: repeats === -1 ? 'repeats without a stated end' : `runs ${repeats} more time${repeats === 1 ? '' : 's'}`,
    });
  }

  return { kind: 'interval', form, components, start, end, duration, repeats };
}

// ------------------------------------------------------------------ front door

export function parseIso(input: string): IsoResult {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Paste an ISO 8601 string to see what each part of it means.');
  if (trimmed.includes('/')) return parseIsoInterval(trimmed);
  if (looksLikeDuration(trimmed)) {
    const duration = parseIsoDuration(trimmed);
    const { seconds, approximate } = durationSeconds(duration);
    const components: IsoComponent[] = [];
    const push = (label: string, value: number, note?: string) => {
      if (value !== 0) components.push({ label, value: String(value), note });
    };
    push('Years', duration.years, 'calendar years, so length varies');
    push('Months', duration.months, 'calendar months, so length varies');
    push('Weeks', duration.weeks, '7 days each');
    push('Days', duration.days);
    push('Hours', duration.hours);
    push('Minutes', duration.minutes);
    push('Seconds', duration.seconds);
    if (components.length === 0) components.push({ label: 'Length', value: '0', note: 'a zero duration' });
    components.push({
      label: 'Total',
      value: `${Math.round(seconds).toLocaleString()} s`,
      note: approximate
        ? 'approximate — years count as 365.2425 days and months as 30.436875'
        : 'exact, because no years or months are involved',
    });
    if (duration.negative) components.push({ label: 'Sign', value: '-', note: 'a negative duration runs backwards' });
    return { kind: 'duration', duration, form: 'Duration', components };
  }
  return parseIsoDateTime(trimmed);
}

// ------------------------------------------------------------------ writing

export interface IsoFormatOptions {
  /** utc appends Z, offset appends the local offset, none leaves the string zone-less. */
  zone: 'utc' | 'offset' | 'none';
  precision: 'minutes' | 'seconds' | 'milliseconds';
  basic: boolean;
}

export function formatIso(date: Date, options: IsoFormatOptions): string {
  const utc = options.zone === 'utc';
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = utc ? date.getUTCDate() : date.getDate();
  const hour = utc ? date.getUTCHours() : date.getHours();
  const minute = utc ? date.getUTCMinutes() : date.getMinutes();
  const second = utc ? date.getUTCSeconds() : date.getSeconds();
  const millisecond = utc ? date.getUTCMilliseconds() : date.getMilliseconds();

  const dateSep = options.basic ? '' : '-';
  const timeSep = options.basic ? '' : ':';

  let time = `${pad(hour)}${timeSep}${pad(minute)}`;
  if (options.precision !== 'minutes') time += `${timeSep}${pad(second)}`;
  if (options.precision === 'milliseconds') time += `.${pad(millisecond, 3)}`;

  let suffix = '';
  if (options.zone === 'utc') {
    suffix = 'Z';
  } else if (options.zone === 'offset') {
    const minutes = -date.getTimezoneOffset();
    suffix = `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}${timeSep}${pad(
      Math.abs(minutes) % 60,
    )}`;
  }

  return `${pad(year, 4)}${dateSep}${pad(month)}${dateSep}${pad(day)}T${time}${suffix}`;
}

export function formatWeekDate(date: Date, basic = false): string {
  const { year, week, weekday } = isoWeekOf(date);
  return basic ? `${pad(year, 4)}W${pad(week)}${weekday}` : `${pad(year, 4)}-W${pad(week)}-${weekday}`;
}

export function formatOrdinalDate(date: Date, basic = false): string {
  const { year, day } = ordinalOf(date);
  return basic ? `${pad(year, 4)}${pad(day, 3)}` : `${pad(year, 4)}-${pad(day, 3)}`;
}

export function toLocalInput(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
