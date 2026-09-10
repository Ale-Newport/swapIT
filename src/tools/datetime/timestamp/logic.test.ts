import { describe, it, expect } from 'vitest';
import {
  INT32_MAX_SECONDS,
  INT32_MIN_SECONDS,
  dayOfYear,
  detectUnit,
  epochNotes,
  isRepresentable,
  isoWeek,
  msToUnit,
  parseTimestampInput,
  relativePhrase,
  toRfc2822,
  unitToMs,
} from './logic';

describe('detectUnit', () => {
  it('reads a plausible second count as seconds', () => {
    expect(detectUnit(0)).toBe('s');
    expect(detectUnit(1)).toBe('s');
    expect(detectUnit(1_700_000_000)).toBe('s');
    expect(detectUnit(INT32_MAX_SECONDS)).toBe('s');
  });

  it('reads a 13-digit value as milliseconds', () => {
    expect(detectUnit(1_700_000_000_000)).toBe('ms');
    expect(detectUnit(Date.UTC(2024, 0, 1))).toBe('ms');
  });

  it('reads 16- and 19-digit values as micro- and nanoseconds', () => {
    expect(detectUnit(1_700_000_000_000_000)).toBe('us');
    expect(detectUnit(1.7e18)).toBe('ns');
  });

  it('uses magnitude, so negative values detect the same way', () => {
    expect(detectUnit(-1_700_000_000)).toBe('s');
    expect(detectUnit(-1_700_000_000_000)).toBe('ms');
  });

  it('switches unit exactly at the documented boundaries', () => {
    expect(detectUnit(1e11 - 1)).toBe('s');
    expect(detectUnit(1e11)).toBe('ms');
    expect(detectUnit(1e14 - 1)).toBe('ms');
    expect(detectUnit(1e14)).toBe('us');
    expect(detectUnit(9.9e16)).toBe('us');
    expect(detectUnit(1e17)).toBe('ns');
  });
});

describe('unit conversion', () => {
  it('round-trips through milliseconds', () => {
    expect(unitToMs(1_700_000_000, 's')).toBe(1_700_000_000_000);
    expect(unitToMs(1_700_000_000_000, 'ms')).toBe(1_700_000_000_000);
    expect(unitToMs(1_700_000_000_000_000, 'us')).toBe(1_700_000_000_000);
    expect(unitToMs(1.7e18, 'ns')).toBe(1_700_000_000_000);
  });

  it('converts back to each unit', () => {
    const ms = 1_700_000_000_000;
    expect(msToUnit(ms, 's')).toBe(1_700_000_000);
    expect(msToUnit(ms, 'ms')).toBe(ms);
    expect(msToUnit(ms, 'us')).toBe(1_700_000_000_000_000);
    expect(msToUnit(ms, 'ns')).toBe(1.7e18);
  });

  it('floors seconds rather than rounding, so the date never jumps forward', () => {
    expect(msToUnit(1500, 's')).toBe(1);
    expect(msToUnit(-1500, 's')).toBe(-2);
  });
});

describe('parseTimestampInput', () => {
  it('accepts plain digits, signs and separators', () => {
    expect(parseTimestampInput('1700000000')).toBe(1_700_000_000);
    expect(parseTimestampInput(' 1 700 000 000 ')).toBe(1_700_000_000);
    expect(parseTimestampInput('1,700,000,000')).toBe(1_700_000_000);
    expect(parseTimestampInput('1_700_000_000')).toBe(1_700_000_000);
    expect(parseTimestampInput('-86400')).toBe(-86_400);
    expect(parseTimestampInput('1700000000.5')).toBe(1_700_000_000.5);
  });

  it('rejects anything that is not a number', () => {
    expect(parseTimestampInput('')).toBeNull();
    expect(parseTimestampInput('   ')).toBeNull();
    expect(parseTimestampInput('0x1f')).toBeNull();
    expect(parseTimestampInput('2024-01-01')).toBeNull();
    expect(parseTimestampInput('1e10')).toBeNull();
  });
});

describe('representable range', () => {
  it('accepts the extremes a Date can hold and refuses beyond them', () => {
    expect(isRepresentable(8.64e15)).toBe(true);
    expect(isRepresentable(-8.64e15)).toBe(true);
    expect(isRepresentable(8.64e15 + 1)).toBe(false);
    expect(isRepresentable(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('toRfc2822', () => {
  it('writes the email header form for a known local instant', () => {
    const date = new Date(2026, 8, 10, 14, 3, 22);
    const minutes = -date.getTimezoneOffset();
    const sign = minutes < 0 ? '-' : '+';
    const offset = `${sign}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}${String(
      Math.abs(minutes) % 60,
    ).padStart(2, '0')}`;
    expect(toRfc2822(date)).toBe(`Thu, 10 Sep 2026 14:03:22 ${offset}`);
  });

  it('pads single-digit days and times', () => {
    expect(toRfc2822(new Date(2024, 0, 1, 5, 6, 7)).startsWith('Mon, 01 Jan 2024 05:06:07 ')).toBe(true);
  });
});

describe('relativePhrase', () => {
  const now = Date.UTC(2024, 5, 15, 12, 0, 0);

  it('describes the recent past and near future', () => {
    expect(relativePhrase(now, now)).toBe('right now');
    expect(relativePhrase(now - 3 * 3_600_000, now)).toMatch(/3 hour/);
    expect(relativePhrase(now + 2 * 86_400_000, now)).toMatch(/2 day/);
    expect(relativePhrase(now - 400 * 86_400_000, now)).toMatch(/year/);
  });
});

describe('epochNotes', () => {
  it('says nothing about an ordinary modern timestamp', () => {
    expect(epochNotes(1_700_000_000)).toEqual([]);
  });

  it('warns as 2038 approaches and after it passes', () => {
    expect(epochNotes(INT32_MAX_SECONDS - 1000)[0].tone).toBe('warn');
    expect(epochNotes(INT32_MAX_SECONDS + 1)[0].tone).toBe('danger');
    expect(epochNotes(INT32_MAX_SECONDS + 1)[0].body).toContain('2038');
  });

  it('explains negative values and the 32-bit floor', () => {
    const negative = epochNotes(-86_400);
    expect(negative.some((note) => note.title === 'Before 1970')).toBe(true);
    const ancient = epochNotes(INT32_MIN_SECONDS - 1);
    expect(ancient.some((note) => note.title === 'Below the 32-bit floor')).toBe(true);
  });
});

describe('calendar helpers', () => {
  it('numbers the day of the year, leap years included', () => {
    expect(dayOfYear(new Date(2024, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2024, 11, 31))).toBe(366);
    expect(dayOfYear(new Date(2023, 11, 31))).toBe(365);
  });

  it('numbers ISO weeks across year boundaries', () => {
    expect(isoWeek(new Date(2024, 0, 4))).toEqual({ year: 2024, week: 1 });
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
    expect(isoWeek(new Date(2021, 0, 1))).toEqual({ year: 2020, week: 53 });
  });
});
