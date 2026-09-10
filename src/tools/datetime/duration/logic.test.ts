import { describe, it, expect } from 'vitest';
import {
  breakdown,
  equivalents,
  formatClock,
  formatCompact,
  formatLong,
  fromSeconds,
  parseHumanDuration,
  toIsoDuration,
  toSeconds,
} from './logic';

describe('unit conversion', () => {
  it('converts each unit to seconds', () => {
    expect(toSeconds(1, 'ms')).toBe(0.001);
    expect(toSeconds(1, 's')).toBe(1);
    expect(toSeconds(1, 'min')).toBe(60);
    expect(toSeconds(1, 'h')).toBe(3600);
    expect(toSeconds(1, 'd')).toBe(86_400);
    expect(toSeconds(1, 'w')).toBe(604_800);
  });

  it('converts back', () => {
    expect(fromSeconds(5400, 'h')).toBe(1.5);
    expect(fromSeconds(86_400, 'd')).toBe(1);
  });
});

describe('breakdown', () => {
  it('splits the example from the tool description', () => {
    // 10 days, 17 hours, 12 minutes, 54 seconds
    const seconds = 10 * 86_400 + 17 * 3600 + 12 * 60 + 54;
    expect(breakdown(seconds)).toMatchObject({ years: 0, days: 10, hours: 17, minutes: 12, seconds: 54 });
    expect(formatLong(seconds)).toBe('10 days, 17 hours, 12 minutes, 54 seconds');
  });

  it('pulls out whole years first', () => {
    expect(breakdown(31_536_000 + 86_400)).toMatchObject({ years: 1, days: 1, hours: 0 });
  });

  it('keeps milliseconds and the sign', () => {
    expect(breakdown(1.25)).toMatchObject({ seconds: 1, milliseconds: 250, negative: false });
    expect(breakdown(-90)).toMatchObject({ minutes: 1, seconds: 30, negative: true });
  });

  it('keeps a duration shorter than a second', () => {
    expect(breakdown(0.5)).toMatchObject({ seconds: 0, milliseconds: 500 });
    expect(breakdown(0.001)).toMatchObject({ seconds: 0, milliseconds: 1 });
  });

  it('carries a rounding edge into the next second instead of reporting 1000 ms', () => {
    expect(breakdown(0.9999)).toMatchObject({ seconds: 1, milliseconds: 0 });
  });
});

describe('formatLong', () => {
  it('writes the long form', () => {
    expect(formatLong(10 * 86_400 + 17 * 3600 + 12 * 60 + 54)).toBe('10 days, 17 hours, 12 minutes, 54 seconds');
    expect(formatLong(90)).toBe('1 minute, 30 seconds');
    expect(formatLong(0)).toBe('0 seconds');
    expect(formatLong(-90)).toBe('-1 minute, 30 seconds');
  });

  it('reports a sub-second duration in milliseconds rather than as zero', () => {
    expect(formatLong(0.5)).toBe('500 milliseconds');
    expect(formatLong(0.001)).toBe('1 millisecond');
    expect(formatLong(0.25)).toBe('250 milliseconds');
    expect(formatLong(1.5)).toBe('1 second, 500 milliseconds');
  });
});

describe('formatCompact', () => {
  it('writes the short form', () => {
    expect(formatCompact(10 * 86_400 + 17 * 3600 + 12 * 60 + 54)).toBe('10d 17h 12m 54s');
    expect(formatCompact(90)).toBe('1m 30s');
    expect(formatCompact(3600)).toBe('1h');
    expect(formatCompact(0)).toBe('0s');
  });

  it('skips units that are zero in the middle', () => {
    expect(formatCompact(86_400 + 30)).toBe('1d 30s');
  });

  it('marks a negative duration', () => {
    expect(formatCompact(-90)).toBe('-1m 30s');
  });

  it('keeps a duration shorter than a second', () => {
    expect(formatCompact(0.5)).toBe('500ms');
    expect(formatCompact(0.001)).toBe('1ms');
    expect(formatCompact(1.5)).toBe('1s 500ms');
    expect(formatCompact(-0.5)).toBe('-500ms');
  });

  it('round-trips a sub-second duration through the reader', () => {
    for (const seconds of [0.001, 0.25, 0.5, 1.5]) {
      expect(parseHumanDuration(formatCompact(seconds))).toBeCloseTo(seconds, 6);
    }
  });
});

describe('formatClock', () => {
  it('counts past 24 hours instead of wrapping', () => {
    expect(formatClock(90)).toBe('00:01:30');
    expect(formatClock(3661)).toBe('01:01:01');
    expect(formatClock(90_061)).toBe('25:01:01');
    expect(formatClock(10 * 86_400)).toBe('240:00:00');
  });

  it('adds milliseconds when asked', () => {
    expect(formatClock(1.25, true)).toBe('00:00:01.250');
  });

  it('marks a negative duration', () => {
    expect(formatClock(-90)).toBe('-00:01:30');
  });
});

describe('toIsoDuration', () => {
  it('writes an exact duration in days and below', () => {
    expect(toIsoDuration(0)).toBe('PT0S');
    expect(toIsoDuration(90)).toBe('PT1M30S');
    expect(toIsoDuration(86_400)).toBe('P1D');
    expect(toIsoDuration(90_061)).toBe('P1DT1H1M1S');
    expect(toIsoDuration(-90)).toBe('-PT1M30S');
  });

  it('keeps fractional seconds to the millisecond', () => {
    expect(toIsoDuration(1.25)).toBe('PT1.25S');
  });
});

describe('parseHumanDuration', () => {
  it('reads the compact form', () => {
    expect(parseHumanDuration('2h 30m')).toBe(9000);
    expect(parseHumanDuration('1d 4h')).toBe(100_800);
    expect(parseHumanDuration('500ms')).toBe(0.5);
    expect(parseHumanDuration('1w')).toBe(604_800);
    expect(parseHumanDuration('2h30m')).toBe(9000);
  });

  it('reads long unit names, in any case, with filler words', () => {
    expect(parseHumanDuration('2 hours 30 minutes')).toBe(9000);
    expect(parseHumanDuration('1 Day and 4 Hours')).toBe(100_800);
    expect(parseHumanDuration('3 SECS')).toBe(3);
  });

  it('reads the clock form, including more than 24 hours', () => {
    expect(parseHumanDuration('01:30:00')).toBe(5400);
    expect(parseHumanDuration('1:30')).toBe(90);
    expect(parseHumanDuration('25:01:01')).toBe(90_061);
  });

  it('reads a bare number as seconds', () => {
    expect(parseHumanDuration('90')).toBe(90);
    expect(parseHumanDuration('1.5')).toBe(1.5);
  });

  it('handles a leading minus across the whole expression', () => {
    expect(parseHumanDuration('-2h 30m')).toBe(-9000);
    expect(parseHumanDuration('-90')).toBe(-90);
    expect(parseHumanDuration('-01:30:00')).toBe(-5400);
  });

  it('tells minutes from milliseconds', () => {
    expect(parseHumanDuration('30m')).toBe(1800);
    expect(parseHumanDuration('30ms')).toBe(0.03);
  });

  it('round-trips through the compact form', () => {
    for (const seconds of [0, 59, 90, 3600, 90_061, 10 * 86_400 + 17 * 3600 + 12 * 60 + 54]) {
      expect(parseHumanDuration(formatCompact(seconds))).toBe(seconds);
    }
  });

  it('refuses what it cannot read', () => {
    expect(() => parseHumanDuration('')).toThrow(/Type a duration/);
    expect(() => parseHumanDuration('a while')).toThrow();
    expect(() => parseHumanDuration('2 fortnights')).toThrow(/not a unit/);
    expect(() => parseHumanDuration('2h banana')).toThrow();
  });
});

describe('equivalents', () => {
  it('states the same duration in every unit', () => {
    const rows = equivalents(90);
    expect(rows.find((row) => row.label === 'Minutes')?.value).toBe('1.5');
    expect(rows.find((row) => row.label === 'Seconds')?.value).toBe('90');
    expect(rows.find((row) => row.label === 'Milliseconds')?.value).toBe((90_000).toLocaleString());
  });
});
