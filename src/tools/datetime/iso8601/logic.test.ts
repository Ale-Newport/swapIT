import { describe, it, expect } from 'vitest';
import {
  applyDuration,
  describeDuration,
  durationSeconds,
  formatIso,
  formatIsoDuration,
  formatOrdinalDate,
  formatWeekDate,
  fromOrdinalDate,
  fromWeekDate,
  isoWeekOf,
  ordinalOf,
  parseIso,
  parseIsoDateTime,
  parseIsoDuration,
  parseIsoInterval,
  weeksInIsoYear,
} from './logic';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): Date =>
  new Date(y, mo - 1, d, h, mi, s, ms);

describe('parseIsoDuration', () => {
  it('reads the full form', () => {
    expect(parseIsoDuration('P1Y2M3DT4H5M6S')).toEqual({
      negative: false,
      years: 1,
      months: 2,
      weeks: 0,
      days: 3,
      hours: 4,
      minutes: 5,
      seconds: 6,
    });
  });

  it('reads partial forms', () => {
    expect(parseIsoDuration('PT45M')).toMatchObject({ minutes: 45, hours: 0 });
    expect(parseIsoDuration('P3W')).toMatchObject({ weeks: 3 });
    expect(parseIsoDuration('P30D')).toMatchObject({ days: 30 });
    expect(parseIsoDuration('PT0S')).toMatchObject({ seconds: 0 });
    expect(parseIsoDuration('-P1D')).toMatchObject({ negative: true, days: 1 });
  });

  it('tells months from minutes by where they sit', () => {
    expect(parseIsoDuration('P1M')).toMatchObject({ months: 1, minutes: 0 });
    expect(parseIsoDuration('PT1M')).toMatchObject({ months: 0, minutes: 1 });
  });

  it('accepts a decimal component with either separator', () => {
    expect(parseIsoDuration('PT1.5H')).toMatchObject({ hours: 1.5 });
    expect(parseIsoDuration('PT1,5H')).toMatchObject({ hours: 1.5 });
    expect(parseIsoDuration('PT0.25S')).toMatchObject({ seconds: 0.25 });
  });

  it('is case-insensitive', () => {
    expect(parseIsoDuration('p1dt2h')).toMatchObject({ days: 1, hours: 2 });
  });

  it('rejects nonsense', () => {
    expect(() => parseIsoDuration('P')).toThrow();
    expect(() => parseIsoDuration('PT')).toThrow();
    expect(() => parseIsoDuration('1Y')).toThrow();
    expect(() => parseIsoDuration('P1H')).toThrow(); // hours belong after T
    expect(() => parseIsoDuration('P1Y2M3DT4H5M6S7X')).toThrow();
  });
});

describe('formatIsoDuration', () => {
  it('round-trips every shape', () => {
    for (const text of ['P1Y2M3DT4H5M6S', 'PT45M', 'P3W', 'P30D', 'PT0S', '-P1DT2H']) {
      expect(formatIsoDuration(parseIsoDuration(text))).toBe(text);
    }
  });

  it('collapses a zero duration to PT0S', () => {
    expect(formatIsoDuration(parseIsoDuration('P0D'))).toBe('PT0S');
  });

  it('keeps decimals', () => {
    expect(formatIsoDuration(parseIsoDuration('PT1,5H'))).toBe('PT1.5H');
  });
});

describe('durationSeconds', () => {
  it('is exact without years or months', () => {
    expect(durationSeconds(parseIsoDuration('PT1H30M'))).toEqual({ seconds: 5400, approximate: false });
    expect(durationSeconds(parseIsoDuration('P1W'))).toEqual({ seconds: 604_800, approximate: false });
    expect(durationSeconds(parseIsoDuration('-PT1M'))).toEqual({ seconds: -60, approximate: false });
  });

  it('flags years and months as approximate', () => {
    const result = durationSeconds(parseIsoDuration('P1Y'));
    expect(result.approximate).toBe(true);
    expect(Math.round(result.seconds)).toBe(Math.round(365.2425 * 86_400));
  });
});

describe('describeDuration', () => {
  it('writes it in words', () => {
    expect(describeDuration(parseIsoDuration('P1Y2M3DT4H5M6S'))).toBe(
      '1 year, 2 months, 3 days, 4 hours, 5 minutes, 6 seconds',
    );
    expect(describeDuration(parseIsoDuration('PT0S'))).toBe('zero');
    expect(describeDuration(parseIsoDuration('-P1D'))).toBe('minus 1 day');
  });
});

describe('applyDuration', () => {
  it('adds calendar months with clamping', () => {
    expect(applyDuration(at(2024, 1, 31), parseIsoDuration('P1M'))).toEqual(at(2024, 2, 29));
    expect(applyDuration(at(2023, 1, 31), parseIsoDuration('P1M'))).toEqual(at(2023, 2, 28));
  });

  it('adds days and clock time', () => {
    expect(applyDuration(at(2024, 3, 1, 10), parseIsoDuration('P1DT2H30M'))).toEqual(at(2024, 3, 2, 12, 30));
    expect(applyDuration(at(2024, 3, 1), parseIsoDuration('P2W'))).toEqual(at(2024, 3, 15));
  });

  it('runs backwards for a negative duration or a negative sign', () => {
    expect(applyDuration(at(2024, 3, 10), parseIsoDuration('-P1D'))).toEqual(at(2024, 3, 9));
    expect(applyDuration(at(2024, 3, 10), parseIsoDuration('P1D'), -1)).toEqual(at(2024, 3, 9));
    expect(applyDuration(at(2024, 3, 10), parseIsoDuration('-P1D'), -1)).toEqual(at(2024, 3, 11));
  });

  it('refuses a fractional month, which has no fixed length', () => {
    expect(() => applyDuration(at(2024, 1, 1), parseIsoDuration('P0.5M'))).toThrow(/fractional/i);
  });
});

describe('week dates', () => {
  it('numbers weeks the ISO way', () => {
    expect(isoWeekOf(at(2024, 1, 4))).toEqual({ year: 2024, week: 1, weekday: 4 });
    expect(isoWeekOf(at(2024, 1, 1))).toEqual({ year: 2024, week: 1, weekday: 1 });
    expect(isoWeekOf(at(2021, 1, 1))).toEqual({ year: 2020, week: 53, weekday: 5 });
    expect(isoWeekOf(at(2024, 12, 30))).toEqual({ year: 2025, week: 1, weekday: 1 });
  });

  it('knows which years have 53 weeks', () => {
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2024)).toBe(52);
    expect(weeksInIsoYear(2026)).toBe(53);
  });

  it('round-trips through fromWeekDate', () => {
    for (const date of [at(2024, 1, 4), at(2021, 1, 1), at(2024, 12, 30), at(2000, 6, 15)]) {
      const { year, week, weekday } = isoWeekOf(date);
      expect(fromWeekDate(year, week, weekday)).toEqual(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    }
  });

  it('rejects a week that does not exist', () => {
    expect(() => fromWeekDate(2024, 53, 1)).toThrow(/52 ISO weeks/);
    expect(() => fromWeekDate(2024, 1, 8)).toThrow(/Monday/);
  });

  it('writes both formats', () => {
    expect(formatWeekDate(at(2024, 1, 15))).toBe('2024-W03-1');
    expect(formatWeekDate(at(2024, 1, 15), true)).toBe('2024W031');
  });
});

describe('ordinal dates', () => {
  it('counts the day of the year', () => {
    expect(ordinalOf(at(2024, 2, 14))).toEqual({ year: 2024, day: 45 });
    expect(ordinalOf(at(2024, 12, 31))).toEqual({ year: 2024, day: 366 });
    expect(ordinalOf(at(2023, 12, 31))).toEqual({ year: 2023, day: 365 });
  });

  it('round-trips', () => {
    expect(fromOrdinalDate(2024, 45)).toEqual(at(2024, 2, 14));
    expect(formatOrdinalDate(at(2024, 2, 14))).toBe('2024-045');
    expect(formatOrdinalDate(at(2024, 2, 14), true)).toBe('2024045');
  });

  it('rejects day 366 in a common year', () => {
    expect(() => fromOrdinalDate(2023, 366)).toThrow(/365 days/);
    expect(fromOrdinalDate(2024, 366)).toEqual(at(2024, 12, 31));
  });
});

describe('parseIsoDateTime', () => {
  it('reads an extended date and time in UTC', () => {
    const result = parseIsoDateTime('2024-04-15T09:30:00Z');
    expect(result.date.getTime()).toBe(Date.UTC(2024, 3, 15, 9, 30, 0));
    expect(result.form).toContain('Calendar date and time');
    expect(result.form).toContain('extended');
  });

  it('reads the basic format', () => {
    const result = parseIsoDateTime('20240415T093000Z');
    expect(result.date.getTime()).toBe(Date.UTC(2024, 3, 15, 9, 30, 0));
    expect(result.form).toContain('basic');
  });

  it('applies an offset', () => {
    expect(parseIsoDateTime('2024-04-15T09:30:00+02:00').date.getTime()).toBe(Date.UTC(2024, 3, 15, 7, 30));
    expect(parseIsoDateTime('2024-04-15T09:30:00-0530').date.getTime()).toBe(Date.UTC(2024, 3, 15, 15, 0));
  });

  it('treats a string with no designator as local time', () => {
    expect(parseIsoDateTime('2024-04-15T09:30:00')).toMatchObject({ date: at(2024, 4, 15, 9, 30) });
  });

  it('keeps millisecond precision', () => {
    expect(parseIsoDateTime('2024-04-15T09:30:00.250Z').date.getUTCMilliseconds()).toBe(250);
    expect(parseIsoDateTime('2024-04-15T09:30:00.123456Z').date.getUTCMilliseconds()).toBe(123);
  });

  it('fills in the parts a reduced string leaves out', () => {
    expect(parseIsoDateTime('2024-04')).toMatchObject({ date: at(2024, 4, 1) });
    expect(parseIsoDateTime('2024')).toMatchObject({ date: at(2024, 1, 1) });
    expect(parseIsoDateTime('2024-04-15')).toMatchObject({ date: at(2024, 4, 15) });
  });

  it('reads week dates and ordinal dates', () => {
    expect(parseIsoDateTime('2024-W03-1').date).toEqual(at(2024, 1, 15));
    expect(parseIsoDateTime('2024W031').date).toEqual(at(2024, 1, 15));
    expect(parseIsoDateTime('2024-W03').date).toEqual(at(2024, 1, 15));
    expect(parseIsoDateTime('2024-045').date).toEqual(at(2024, 2, 14));
    expect(parseIsoDateTime('2024045').date).toEqual(at(2024, 2, 14));
  });

  it('treats hour 24 as midnight ending the day', () => {
    expect(parseIsoDateTime('2024-04-15T24:00:00').date).toEqual(at(2024, 4, 16, 0, 0, 0));
    expect(() => parseIsoDateTime('2024-04-15T24:30:00')).toThrow(/24/);
  });

  it('explains what it read', () => {
    const labels = parseIsoDateTime('2024-04-15T09:30:00Z').components.map((c) => c.label);
    expect(labels).toContain('Year');
    expect(labels).toContain('Month');
    expect(labels).toContain('Zone');
  });

  it('rejects impossible dates with a readable message', () => {
    expect(() => parseIsoDateTime('2023-02-29')).toThrow(/28 days/);
    expect(() => parseIsoDateTime('2024-13-01')).toThrow(/month/);
    expect(() => parseIsoDateTime('15/04/2024')).toThrow();
  });
});

describe('parseIsoInterval', () => {
  it('reads a start and an end', () => {
    const result = parseIsoInterval('2024-04-15T00:00:00Z/2024-04-20T00:00:00Z');
    expect(result.start?.getTime()).toBe(Date.UTC(2024, 3, 15));
    expect(result.end?.getTime()).toBe(Date.UTC(2024, 3, 20));
    expect(result.duration).toBeNull();
  });

  it('works out the end from a duration', () => {
    const result = parseIsoInterval('2024-04-15T00:00:00Z/P5D');
    expect(result.end?.getTime()).toBe(Date.UTC(2024, 3, 20));
    expect(result.form).toContain('duration');
  });

  it('works out the start from a duration', () => {
    const result = parseIsoInterval('P5D/2024-04-20T00:00:00Z');
    expect(result.start?.getTime()).toBe(Date.UTC(2024, 3, 15));
  });

  it('reads a repeat count', () => {
    expect(parseIsoInterval('R5/2024-04-15T00:00:00Z/P1D').repeats).toBe(5);
    expect(parseIsoInterval('R/2024-04-15T00:00:00Z/P1D').repeats).toBe(-1);
  });

  it('refuses two durations', () => {
    expect(() => parseIsoInterval('P1D/P2D')).toThrow(/at least one date/);
  });

  it('shows the instant a derived side stands for, not the duration text', () => {
    const fromStart = parseIsoInterval('2024-04-15T00:00:00Z/P5D');
    const end = fromStart.components.find((component) => component.label === 'End');
    expect(end?.value).toBe(new Date(Date.UTC(2024, 3, 20)).toISOString());
    expect(end?.note).toContain('P5D');

    const fromEnd = parseIsoInterval('P5D/2024-04-20T00:00:00Z');
    const start = fromEnd.components.find((component) => component.label === 'Start');
    expect(start?.value).toBe(new Date(Date.UTC(2024, 3, 15)).toISOString());
    expect(start?.note).toContain('P5D');
  });

  it('echoes a side that was written out in full', () => {
    const result = parseIsoInterval('2024-04-15T00:00:00Z/2024-04-20T00:00:00Z');
    expect(result.components.find((component) => component.label === 'Start')?.value).toBe('2024-04-15T00:00:00Z');
    expect(result.components.find((component) => component.label === 'End')?.note).toBeUndefined();
  });
});

describe('parseIso — dispatch', () => {
  it('sends each shape to the right reader', () => {
    expect(parseIso('P1D').kind).toBe('duration');
    expect(parseIso('2024-04-15').kind).toBe('datetime');
    expect(parseIso('2024-04-15/2024-04-20').kind).toBe('interval');
    expect(parseIso('2024-W03-1').kind).toBe('datetime');
  });

  it('complains about an empty string', () => {
    expect(() => parseIso('   ')).toThrow(/Paste an ISO 8601 string/);
  });

  it('marks a duration total as approximate only when years or months appear', () => {
    const withMonths = parseIso('P1M');
    const withDays = parseIso('P30D');
    if (withMonths.kind !== 'duration' || withDays.kind !== 'duration') throw new Error('wrong kind');
    expect(withMonths.components.at(-1)?.note).toMatch(/approximate/);
    expect(withDays.components.at(-1)?.note).toMatch(/exact/);
  });
});

describe('formatIso', () => {
  const date = new Date(Date.UTC(2024, 3, 15, 9, 30, 15, 250));

  it('writes UTC with a Z', () => {
    expect(formatIso(date, { zone: 'utc', precision: 'seconds', basic: false })).toBe('2024-04-15T09:30:15Z');
    expect(formatIso(date, { zone: 'utc', precision: 'milliseconds', basic: false })).toBe('2024-04-15T09:30:15.250Z');
    expect(formatIso(date, { zone: 'utc', precision: 'minutes', basic: false })).toBe('2024-04-15T09:30Z');
  });

  it('writes the basic format without separators', () => {
    expect(formatIso(date, { zone: 'utc', precision: 'seconds', basic: true })).toBe('20240415T093015Z');
  });

  it('writes local time with an offset that matches the machine', () => {
    const written = formatIso(date, { zone: 'offset', precision: 'seconds', basic: false });
    expect(written).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(parseIsoDateTime(written).date.getTime()).toBe(date.getTime() - date.getMilliseconds());
  });

  it('writes a zone-less string when asked', () => {
    expect(formatIso(date, { zone: 'none', precision: 'seconds', basic: false })).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    );
  });
});
