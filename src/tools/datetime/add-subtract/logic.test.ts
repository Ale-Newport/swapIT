import { describe, it, expect } from 'vitest';
import {
  EMPTY_DELTA,
  addBusinessDays,
  addMonths,
  describeDelta,
  fromLocalInput,
  isEmptyDelta,
  offsetLabel,
  parseHolidayList,
  shiftDate,
  shiftDateBusiness,
  toIsoWithOffset,
  wasClamped,
} from './logic';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date =>
  new Date(y, mo - 1, d, h, mi, s, 0);

const delta = (patch: Partial<typeof EMPTY_DELTA>) => ({ ...EMPTY_DELTA, ...patch });

describe('addMonths — clamping', () => {
  it('pulls 31 January back to the end of February', () => {
    expect(addMonths(at(2023, 1, 31), 1)).toEqual(at(2023, 2, 28));
    expect(addMonths(at(2024, 1, 31), 1)).toEqual(at(2024, 2, 29));
  });

  it('clamps in both directions and across years', () => {
    expect(addMonths(at(2024, 3, 31), -1)).toEqual(at(2024, 2, 29));
    expect(addMonths(at(2023, 8, 31), 6)).toEqual(at(2024, 2, 29));
    expect(addMonths(at(2023, 8, 31), 18)).toEqual(at(2025, 2, 28));
  });

  it('leaves a day that fits alone', () => {
    expect(addMonths(at(2024, 1, 15, 6, 30), 1)).toEqual(at(2024, 2, 15, 6, 30));
  });
});

describe('shiftDate', () => {
  it('applies every unit at once', () => {
    const result = shiftDate(at(2024, 1, 1, 0, 0, 0), delta({ years: 1, months: 2, weeks: 1, days: 3, hours: 4, minutes: 5, seconds: 6 }), 1);
    // 2024-01-01 +14 months = 2025-03-01, +10 days = 2025-03-11, +04:05:06
    expect(result).toEqual(at(2025, 3, 11, 4, 5, 6));
  });

  it('subtracts when the sign is -1', () => {
    expect(shiftDate(at(2024, 3, 31), delta({ months: 1 }), -1)).toEqual(at(2024, 2, 29));
    expect(shiftDate(at(2024, 1, 1), delta({ days: 1 }), -1)).toEqual(at(2023, 12, 31));
  });

  it('honours a negative field even when adding', () => {
    expect(shiftDate(at(2024, 6, 15), delta({ months: 1, days: -15 }), 1)).toEqual(at(2024, 6, 30));
  });

  it('adds years to 29 February by clamping to the 28th', () => {
    expect(shiftDate(at(2024, 2, 29), delta({ years: 1 }), 1)).toEqual(at(2025, 2, 28));
    expect(shiftDate(at(2024, 2, 29), delta({ years: 4 }), 1)).toEqual(at(2028, 2, 29));
  });

  it('returns the same instant for an empty delta', () => {
    const start = at(2024, 5, 5, 5, 5, 5);
    expect(shiftDate(start, EMPTY_DELTA, 1)).toEqual(start);
  });
});

describe('addBusinessDays', () => {
  it('skips the weekend', () => {
    // 5 January 2024 is a Friday.
    expect(addBusinessDays(at(2024, 1, 5), 1)).toEqual(at(2024, 1, 8));
    expect(addBusinessDays(at(2024, 1, 5), 3)).toEqual(at(2024, 1, 10));
    expect(addBusinessDays(at(2024, 1, 5), 5)).toEqual(at(2024, 1, 12));
  });

  it('walks backwards', () => {
    // 8 January 2024 is a Monday.
    expect(addBusinessDays(at(2024, 1, 8), -1)).toEqual(at(2024, 1, 5));
    expect(addBusinessDays(at(2024, 1, 8), -5)).toEqual(at(2024, 1, 1));
    expect(addBusinessDays(at(2024, 1, 8), -6)).toEqual(at(2023, 12, 29));
  });

  it('skips listed holidays as well', () => {
    expect(addBusinessDays(at(2024, 1, 5), 1, ['2024-01-08'])).toEqual(at(2024, 1, 9));
    expect(addBusinessDays(at(2024, 1, 5), 2, ['2024-01-08', '2024-01-09'])).toEqual(at(2024, 1, 11));
  });

  it('keeps the time of day', () => {
    expect(addBusinessDays(at(2024, 1, 5, 16, 45, 30), 1)).toEqual(at(2024, 1, 8, 16, 45, 30));
  });

  it('does nothing for zero, even from a Saturday', () => {
    expect(addBusinessDays(at(2024, 1, 6), 0)).toEqual(at(2024, 1, 6));
  });

  it('refuses an absurd amount rather than freezing', () => {
    expect(() => addBusinessDays(at(2024, 1, 1), 500_000)).toThrow(/business days/i);
  });
});

describe('shiftDateBusiness', () => {
  it('applies months by the calendar and days as working days', () => {
    // 2024-01-31 +1 month = 2024-02-29 (Thursday), +1 business day = 2024-03-01 (Friday)
    expect(shiftDateBusiness(at(2024, 1, 31), delta({ months: 1, days: 1 }), 1)).toEqual(at(2024, 3, 1));
  });

  it('applies the clock units after the working days', () => {
    expect(shiftDateBusiness(at(2024, 1, 5, 9, 0), delta({ days: 1, hours: 2 }), 1)).toEqual(at(2024, 1, 8, 11, 0));
  });

  it('counts a week as five working days instead of dropping it', () => {
    // 1 January 2024 is a Monday; five working days later is Monday the 8th.
    expect(shiftDateBusiness(at(2024, 1, 1, 12), delta({ weeks: 1 }), 1)).toEqual(at(2024, 1, 8, 12));
    expect(shiftDateBusiness(at(2024, 1, 1, 12), delta({ weeks: 2 }), 1)).toEqual(at(2024, 1, 15, 12));
    // Weeks and days are walked together, so 1 week + 1 day is six working days.
    expect(shiftDateBusiness(at(2024, 1, 1, 12), delta({ weeks: 1, days: 1 }), 1)).toEqual(at(2024, 1, 9, 12));
  });

  it('walks weeks backwards and steps over holidays', () => {
    expect(shiftDateBusiness(at(2024, 1, 15, 12), delta({ weeks: 1 }), -1)).toEqual(at(2024, 1, 8, 12));
    expect(shiftDateBusiness(at(2024, 1, 1, 12), delta({ weeks: 1 }), 1, ['2024-01-03'])).toEqual(at(2024, 1, 9, 12));
  });
});

describe('descriptions and clamping detection', () => {
  it('writes a readable sentence', () => {
    expect(describeDelta(delta({ years: 1, months: 2, days: 3 }), 1, false)).toBe('plus 1 year, 2 months and 3 days');
    expect(describeDelta(delta({ days: 1 }), -1, true)).toBe('minus 1 business day');
    expect(describeDelta(EMPTY_DELTA, 1, false)).toBe('nothing at all');
  });

  it('calls a week a working week in business mode', () => {
    expect(describeDelta(delta({ weeks: 2 }), 1, true)).toBe('plus 2 working weeks');
    expect(describeDelta(delta({ weeks: 1, days: 1 }), 1, true)).toBe('plus 1 working week and 1 business day');
    expect(describeDelta(delta({ weeks: 1 }), 1, false)).toBe('plus 1 week');
  });

  it('notices when the day of the month was pulled back', () => {
    expect(wasClamped(at(2024, 1, 31), at(2024, 2, 29), delta({ months: 1 }))).toBe(true);
    expect(wasClamped(at(2024, 1, 15), at(2024, 2, 15), delta({ months: 1 }))).toBe(false);
    // A day amount moves the date on purpose, so it is not clamping.
    expect(wasClamped(at(2024, 1, 31), at(2024, 3, 1), delta({ months: 1, days: 1 }))).toBe(false);
    expect(wasClamped(at(2024, 1, 31), at(2024, 3, 7), delta({ months: 1, weeks: 1 }))).toBe(false);
  });

  it('knows when nothing was entered', () => {
    expect(isEmptyDelta(EMPTY_DELTA)).toBe(true);
    expect(isEmptyDelta(delta({ weeks: 1 }))).toBe(false);
  });
});

describe('formatting', () => {
  it('writes an offset that matches the local zone', () => {
    const date = at(2024, 6, 1, 12);
    const minutes = -date.getTimezoneOffset();
    const sign = minutes < 0 ? '-' : '+';
    const expected = `${sign}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(
      Math.abs(minutes) % 60,
    ).padStart(2, '0')}`;
    expect(offsetLabel(date)).toBe(expected);
  });

  it('writes ISO 8601 with the local offset appended', () => {
    const date = at(2024, 6, 1, 12, 34, 56);
    expect(toIsoWithOffset(date)).toBe(`2024-06-01T12:34:56${offsetLabel(date)}`);
  });

  it('round-trips a datetime-local value', () => {
    expect(fromLocalInput('2024-02-29T07:05:03')).toEqual(at(2024, 2, 29, 7, 5, 3));
    expect(fromLocalInput('nope')).toBeNull();
  });
});

describe('parseHolidayList', () => {
  it('reads dates and reports the rest', () => {
    const parsed = parseHolidayList('2024-12-25 Christmas\nrubbish\n2024-2-30');
    expect(parsed.dates).toEqual(['2024-12-25']);
    expect(parsed.invalid).toEqual(['rubbish', '2024-2-30']);
  });
});
