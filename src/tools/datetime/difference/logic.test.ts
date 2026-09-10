import { describe, it, expect } from 'vitest';
import {
  addMonths,
  businessDayReport,
  calendarDayCount,
  calendarDiff,
  countWeekendDays,
  diffTotals,
  formatCalendarDiff,
  fromLocalInput,
  parseHolidayList,
  toLocalInput,
} from './logic';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date =>
  new Date(y, mo - 1, d, h, mi, s, 0);

describe('addMonths — month-end clamping', () => {
  it('clamps 31 January to the end of February', () => {
    expect(addMonths(at(2023, 1, 31), 1)).toEqual(at(2023, 2, 28));
    expect(addMonths(at(2024, 1, 31), 1)).toEqual(at(2024, 2, 29));
  });

  it('clamps backwards too', () => {
    expect(addMonths(at(2023, 3, 31), -1)).toEqual(at(2023, 2, 28));
    expect(addMonths(at(2023, 5, 31), -1)).toEqual(at(2023, 4, 30));
  });

  it('keeps the time of day and crosses year boundaries', () => {
    expect(addMonths(at(2023, 11, 30, 13, 45, 9), 3)).toEqual(at(2024, 2, 29, 13, 45, 9));
    expect(addMonths(at(2023, 2, 15), -14)).toEqual(at(2021, 12, 15));
  });

  it('stays monotonic across a clamped month', () => {
    const start = at(2023, 1, 31);
    expect(addMonths(start, 1).getTime()).toBeLessThanOrEqual(addMonths(start, 2).getTime());
    expect(addMonths(start, 2)).toEqual(at(2023, 3, 31));
  });
});

describe('calendarDiff', () => {
  it('reports whole months across a short February', () => {
    expect(calendarDiff(at(2023, 1, 31), at(2023, 2, 28))).toMatchObject({
      years: 0,
      months: 1,
      days: 0,
      hours: 0,
    });
    expect(calendarDiff(at(2024, 1, 31), at(2024, 2, 29))).toMatchObject({ months: 1, days: 0 });
  });

  it('spills into days once February is passed', () => {
    expect(calendarDiff(at(2023, 1, 31), at(2023, 3, 1))).toMatchObject({ months: 1, days: 1 });
    expect(calendarDiff(at(2023, 1, 31), at(2023, 3, 31))).toMatchObject({ months: 2, days: 0 });
  });

  it('handles 29 February anniversaries', () => {
    expect(calendarDiff(at(2024, 2, 29), at(2025, 2, 28))).toMatchObject({
      years: 1,
      months: 0,
      days: 0,
    });
    expect(calendarDiff(at(2024, 2, 29), at(2025, 3, 1))).toMatchObject({ years: 1, days: 1 });
    expect(calendarDiff(at(2024, 2, 29), at(2028, 2, 29))).toMatchObject({ years: 4, months: 0, days: 0 });
  });

  it('borrows time correctly when the end time of day is earlier', () => {
    expect(calendarDiff(at(2023, 1, 31, 10, 0, 0), at(2023, 2, 28, 9, 0, 0))).toMatchObject({
      months: 0,
      days: 27,
      hours: 23,
      minutes: 0,
    });
  });

  it('counts a single second across a year boundary', () => {
    expect(calendarDiff(at(2023, 12, 31, 23, 59, 59), at(2024, 1, 1, 0, 0, 0))).toMatchObject({
      years: 0,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it('is symmetric apart from the negative flag', () => {
    const forward = calendarDiff(at(2020, 5, 4, 8), at(2023, 9, 17, 19, 30));
    const backward = calendarDiff(at(2023, 9, 17, 19, 30), at(2020, 5, 4, 8));
    expect(forward.negative).toBe(false);
    expect(backward.negative).toBe(true);
    expect({ ...backward, negative: false }).toEqual({ ...forward, negative: false });
  });

  it('reports nothing for two identical instants', () => {
    const diff = calendarDiff(at(2024, 6, 1, 12), at(2024, 6, 1, 12));
    expect(formatCalendarDiff(diff)).toBe('No difference at all');
  });

  it('writes a readable sentence', () => {
    expect(formatCalendarDiff(calendarDiff(at(2024, 1, 1), at(2025, 3, 2, 4, 5, 6)))).toBe(
      '1 year, 2 months, 1 day, 4 hours, 5 minutes, 6 seconds',
    );
  });
});

describe('diffTotals', () => {
  it('counts 366 days across a leap year', () => {
    expect(diffTotals(at(2024, 1, 1), at(2025, 1, 1)).days).toBe(366);
    expect(diffTotals(at(2023, 1, 1), at(2024, 1, 1)).days).toBe(365);
  });

  it('derives every unit from the same elapsed time', () => {
    const totals = diffTotals(at(2024, 3, 1, 0, 0, 0), at(2024, 3, 8, 12, 30, 0));
    expect(totals.days).toBe(7);
    expect(totals.weeks).toBe(1);
    expect(totals.hours).toBe(7 * 24 + 12);
    expect(totals.minutes).toBe((7 * 24 + 12) * 60 + 30);
    expect(totals.seconds).toBe(totals.minutes * 60);
  });

  it('counts whole calendar months, never days divided by 30', () => {
    expect(diffTotals(at(2023, 1, 31), at(2023, 2, 28)).months).toBe(1);
    expect(diffTotals(at(2024, 1, 1), at(2025, 1, 1)).months).toBe(12);
  });
});

describe('calendarDayCount', () => {
  it('excludes or includes the end date', () => {
    expect(calendarDayCount(at(2024, 3, 1), at(2024, 3, 3), false)).toBe(2);
    expect(calendarDayCount(at(2024, 3, 1), at(2024, 3, 3), true)).toBe(3);
    expect(calendarDayCount(at(2024, 3, 1), at(2024, 3, 1), false)).toBe(0);
    expect(calendarDayCount(at(2024, 3, 1), at(2024, 3, 1), true)).toBe(1);
  });

  it('ignores the time of day', () => {
    expect(calendarDayCount(at(2024, 3, 1, 23, 59), at(2024, 3, 2, 0, 1), false)).toBe(1);
  });
});

describe('countWeekendDays', () => {
  it('counts two per whole week', () => {
    // 1 January 2024 is a Monday.
    expect(countWeekendDays(at(2024, 1, 1), 7)).toBe(2);
    expect(countWeekendDays(at(2024, 1, 1), 14)).toBe(4);
  });

  it('handles a partial week from any weekday', () => {
    expect(countWeekendDays(at(2024, 1, 1), 5)).toBe(0);
    expect(countWeekendDays(at(2024, 1, 6), 2)).toBe(2); // Saturday and Sunday
    expect(countWeekendDays(at(2024, 1, 5), 3)).toBe(2); // Fri, Sat, Sun
    expect(countWeekendDays(at(2024, 1, 1), 0)).toBe(0);
  });
});

describe('businessDayReport', () => {
  it('excludes weekends', () => {
    // Monday 1 January to Friday 5 January 2024, end included.
    const report = businessDayReport(at(2024, 1, 1), at(2024, 1, 5), [], true);
    expect(report.totalDays).toBe(5);
    expect(report.weekendDays).toBe(0);
    expect(report.businessDays).toBe(5);
  });

  it('subtracts holidays that land on a weekday', () => {
    const report = businessDayReport(at(2024, 1, 1), at(2024, 1, 5), ['2024-01-01', '2024-01-06'], true);
    expect(report.observed).toEqual(['2024-01-01']);
    expect(report.holidayDays).toBe(1);
    expect(report.businessDays).toBe(4);
  });

  it('never double-counts a holiday that falls on a weekend', () => {
    const report = businessDayReport(at(2024, 1, 1), at(2024, 1, 7), ['2024-01-06'], true);
    expect(report.totalDays).toBe(7);
    expect(report.weekendDays).toBe(2);
    expect(report.holidayDays).toBe(0);
    expect(report.businessDays).toBe(5);
  });

  it('agrees with a day-by-day walk over a long, leap-year range', () => {
    const start = at(2024, 1, 1);
    const end = at(2025, 6, 30);
    const report = businessDayReport(start, end, [], true);
    let manual = 0;
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) manual += 1;
    }
    expect(report.businessDays).toBe(manual);
  });

  it('returns zero for an empty range', () => {
    expect(businessDayReport(at(2024, 1, 1), at(2024, 1, 1), [], false).businessDays).toBe(0);
  });
});

describe('parseHolidayList', () => {
  it('reads one date per line with an optional name', () => {
    const parsed = parseHolidayList('2024-12-25 Christmas\n2024-01-01\n2024/07/04\n2024.11.28');
    expect(parsed.dates).toEqual(['2024-01-01', '2024-07-04', '2024-11-28', '2024-12-25']);
    expect(parsed.invalid).toEqual([]);
  });

  it('pads single-digit months and days and removes duplicates', () => {
    const parsed = parseHolidayList('2024-1-1\n2024-01-01');
    expect(parsed.dates).toEqual(['2024-01-01']);
  });

  it('flags entries it cannot read', () => {
    const parsed = parseHolidayList('2024-13-01\nnot a date\n2024-02-30\n2024-02-29');
    expect(parsed.dates).toEqual(['2024-02-29']);
    expect(parsed.invalid).toEqual(['2024-13-01', 'not a date', '2024-02-30']);
  });

  it('ignores blank lines', () => {
    expect(parseHolidayList('\n\n  \n').dates).toEqual([]);
    expect(parseHolidayList('\n\n  \n').invalid).toEqual([]);
  });
});

describe('local input round trip', () => {
  it('survives a round trip', () => {
    const date = at(2024, 2, 29, 7, 5, 3);
    expect(toLocalInput(date)).toBe('2024-02-29T07:05:03');
    expect(fromLocalInput(toLocalInput(date))).toEqual(date);
  });

  it('accepts a value without seconds', () => {
    expect(fromLocalInput('2024-02-29T07:05')).toEqual(at(2024, 2, 29, 7, 5, 0));
  });

  it('rejects nonsense', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('yesterday')).toBeNull();
  });
});
