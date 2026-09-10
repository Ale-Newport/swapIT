import { describe, it, expect } from 'vitest';
import { describeCron, fieldSummary, nextRuns, parseCron, timeUntil } from './logic';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date => new Date(y, mo - 1, d, h, mi, s, 0);

describe('parseCron — field syntax', () => {
  it('reads a wildcard', () => {
    const parsed = parseCron('* * * * *');
    expect(parsed.minute.values).toHaveLength(60);
    expect(parsed.hour.values).toHaveLength(24);
    expect(parsed.dayOfMonth.values[0]).toBe(1);
    expect(parsed.month.values).toHaveLength(12);
    expect(parsed.dayOfWeek.values).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parsed.minute.isWildcard).toBe(true);
  });

  it('reads steps', () => {
    expect(parseCron('*/5 * * * *').minute.values).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(parseCron('0 */6 * * *').hour.values).toEqual([0, 6, 12, 18]);
    expect(parseCron('0 9-17/4 * * *').hour.values).toEqual([9, 13, 17]);
    // "5/15" means from 5 to the end of the field.
    expect(parseCron('5/15 * * * *').minute.values).toEqual([5, 20, 35, 50]);
  });

  it('reads ranges and lists', () => {
    expect(parseCron('0 0 * * 1-5').dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron('1,3,5 * * * *').minute.values).toEqual([1, 3, 5]);
    expect(parseCron('0 0 1,15 * *').dayOfMonth.values).toEqual([1, 15]);
    expect(parseCron('0 9-11,14 * * *').hour.values).toEqual([9, 10, 11, 14]);
  });

  it('wraps a backwards range', () => {
    expect(parseCron('0 22-2 * * *').hour.values).toEqual([0, 1, 2, 22, 23]);
    expect(parseCron('0 0 * * FRI-MON').dayOfWeek.values).toEqual([0, 1, 5, 6]);
  });

  it('reads three-letter names in either case', () => {
    expect(parseCron('0 0 1 JAN *').month.values).toEqual([1]);
    expect(parseCron('0 0 1 jan-mar *').month.values).toEqual([1, 2, 3]);
    expect(parseCron('0 9 * * MON,fri').dayOfWeek.values).toEqual([1, 5]);
  });

  it('treats both 0 and 7 as Sunday and ? as a wildcard', () => {
    expect(parseCron('0 0 * * 7').dayOfWeek.values).toEqual([0]);
    expect(parseCron('0 0 ? * MON').dayOfMonth.isWildcard).toBe(true);
  });

  it('reads the 6-field form with seconds', () => {
    const parsed = parseCron('*/30 0 12 * * *');
    expect(parsed.seconds?.values).toEqual([0, 30]);
    expect(parsed.hour.values).toEqual([12]);
  });

  it('expands the shorthands', () => {
    expect(parseCron('@daily').expression).toBe('0 0 * * *');
    expect(parseCron('@hourly').expression).toBe('0 * * * *');
    expect(parseCron('@weekly').dayOfWeek.values).toEqual([0]);
    expect(parseCron('@monthly').dayOfMonth.values).toEqual([1]);
    expect(parseCron('@YEARLY').month.values).toEqual([1]);
    expect(parseCron('@annually').shorthand).toBe('@annually');
  });
});

describe('parseCron — errors', () => {
  it('counts the fields', () => {
    expect(() => parseCron('* * * *')).toThrow(/this has 4/);
    expect(() => parseCron('* * * * * * *')).toThrow(/this has 7/);
    expect(() => parseCron('   ')).toThrow('Type a cron expression, for example "30 2 * * *".');
  });

  it('bounds each field', () => {
    expect(() => parseCron('75 * * * *')).toThrow('The minute must be between 0 and 59 — got 75.');
    expect(() => parseCron('0 24 * * *')).toThrow('The hour must be between 0 and 23 — got 24.');
    expect(() => parseCron('0 0 32 * *')).toThrow('The day-of-month must be between 1 and 31 — got 32.');
    expect(() => parseCron('0 0 1 13 *')).toThrow('The month must be between 1 and 12 — got 13.');
    expect(() => parseCron('0 0 * * 8')).toThrow('The day-of-week must be between 0 and 6 — got 8.');
  });

  it('rejects nonsense tokens', () => {
    expect(() => parseCron('abc * * * *')).toThrow('"abc" is not a valid minute. Use a number from 0 to 59.');
    expect(() => parseCron('0 0 * XYZ *')).toThrow(/not a valid month/);
    expect(() => parseCron('*/0 * * * *')).toThrow('A step of 0 in "*/0" would never run. Use 1 or more.');
    expect(() => parseCron('*/a * * * *')).toThrow('The step after "/" in "*/a" must be a whole number, like */5.');
    expect(() => parseCron('1-2-3 * * * *')).toThrow(/not a valid range/);
    expect(() => parseCron('1,,2 * * * *')).toThrow(/empty item/);
  });

  it('says the extended symbols are unsupported rather than pretending', () => {
    expect(() => parseCron('0 0 L * *')).toThrow(/extended cron symbol/);
    expect(() => parseCron('0 0 * * 5#3')).toThrow(/extended cron symbol/);
    expect(() => parseCron('@reboot')).toThrow(/no schedule to preview/);
    expect(() => parseCron('@sometimes')).toThrow(/not a cron shorthand/);
  });
});

describe('describeCron', () => {
  const say = (expr: string): string => describeCron(parseCron(expr));

  it('describes a fixed time', () => {
    expect(say('30 2 * * *')).toBe('At 02:30 on every day-of-month');
    expect(say('30 2 * 1 *')).toBe('At 02:30 on every day-of-month, only in January');
    expect(say('0 0 1 * *')).toBe('At 00:00 on day-of-month 1');
  });

  it('describes intervals', () => {
    expect(say('* * * * *')).toBe('Every minute on every day-of-month');
    expect(say('*/5 * * * *')).toBe('Every 5 minutes on every day-of-month');
    expect(say('0 */3 * * *')).toBe('At minute 0 past every 3rd hour on every day-of-month');
    expect(say('* 9 * * *')).toBe('Every minute of hour 9 on every day-of-month');
  });

  it('describes days and months', () => {
    expect(say('0 9 * * 1-5')).toBe('At 09:00 on Monday, Tuesday, Wednesday, Thursday and Friday');
    expect(say('0 9 1 * 1')).toBe('At 09:00 on day-of-month 1 or on Monday');
    expect(say('0 0 1 1,7 *')).toBe('At 00:00 on day-of-month 1, only in January and July');
  });

  it('lists several times when the minute is fixed', () => {
    expect(say('30 9,12,17 * * *')).toBe('At 09:30, 12:30 and 17:30 on every day-of-month');
  });

  it('describes seconds', () => {
    expect(say('0 30 2 * * *')).toBe('At 02:30:00 on every day-of-month');
    expect(say('*/15 * * * * *')).toBe('Every 15 seconds on every day-of-month');
    expect(say('* * * * * *')).toBe('Every second on every day-of-month');
  });
});

describe('nextRuns', () => {
  it('lands on the next matching minute', () => {
    const runs = nextRuns(parseCron('*/15 * * * *'), at(2024, 3, 14, 10, 7, 30), 4);
    expect(runs.map((d) => `${d.getHours()}:${d.getMinutes()}`)).toEqual(['10:15', '10:30', '10:45', '11:0']);
    expect(runs.every((d) => d.getSeconds() === 0)).toBe(true);
  });

  it('never returns a time in the past', () => {
    const from = at(2024, 3, 14, 10, 7, 30);
    for (const run of nextRuns(parseCron('0 0 * * *'), from, 3)) {
      expect(run.getTime()).toBeGreaterThan(from.getTime());
    }
  });

  it('walks day by day for a daily schedule', () => {
    const runs = nextRuns(parseCron('@daily'), at(2024, 3, 14, 10, 0), 3);
    expect(runs.map((d) => d.getDate())).toEqual([15, 16, 17]);
    expect(runs.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBe(true);
  });

  it('honours a weekday schedule', () => {
    const runs = nextRuns(parseCron('0 9 * * 1'), at(2024, 3, 14, 10, 0), 3);
    expect(runs.every((d) => d.getDay() === 1 && d.getHours() === 9)).toBe(true);
    expect(runs[0].getDate()).toBe(18); // the Monday after Thursday 14 March 2024
  });

  it('applies the day-of-month OR day-of-week rule', () => {
    const runs = nextRuns(parseCron('0 0 1 * 1'), at(2024, 3, 14, 12, 0), 6);
    for (const run of runs) {
      expect(run.getDate() === 1 || run.getDay() === 1).toBe(true);
    }
    // 18 March is a Monday and 1 April is the first of the month — both appear.
    expect(runs.some((d) => d.getDate() === 18)).toBe(true);
    expect(runs.some((d) => d.getMonth() === 3 && d.getDate() === 1)).toBe(true);
  });

  it('respects a month restriction', () => {
    const runs = nextRuns(parseCron('0 0 1 1 *'), at(2024, 3, 14), 3);
    expect(runs.map((d) => [d.getFullYear(), d.getMonth(), d.getDate()])).toEqual([
      [2025, 0, 1],
      [2026, 0, 1],
      [2027, 0, 1],
    ]);
  });

  it('finds leap days and gives up on impossible dates', () => {
    const leap = nextRuns(parseCron('0 12 29 2 *'), at(2024, 3, 1), 2);
    expect(leap.map((d) => d.getFullYear())).toEqual([2028, 2032]);
    expect(nextRuns(parseCron('0 0 30 2 *'), at(2024, 3, 1), 1)).toEqual([]);
  });

  it('steps through seconds when the expression has them', () => {
    const runs = nextRuns(parseCron('*/20 * * * * *'), at(2024, 3, 14, 10, 0, 5), 3);
    expect(runs.map((d) => d.getSeconds())).toEqual([20, 40, 0]);
  });

  it('reports the wait until the next run', () => {
    const from = at(2024, 3, 14, 10, 0, 0);
    expect(timeUntil(parseCron('30 10 * * *'), from)).toBe(30 * 60 * 1000);
    expect(timeUntil(parseCron('0 0 30 2 *'), from)).toBeNull();
  });
});

describe('fieldSummary', () => {
  it('names months and weekdays', () => {
    const parsed = parseCron('0 0 1 3 5');
    expect(fieldSummary(parsed.month)).toBe('March');
    expect(fieldSummary(parsed.dayOfWeek)).toBe('Friday');
    expect(fieldSummary(parsed.hour)).toBe('0');
    expect(fieldSummary(parseCron('* * * * *').minute)).toBe('every minute');
    expect(fieldSummary(parseCron('*/2 * * * *').minute)).toMatch(/^30 values: /);
  });
});
