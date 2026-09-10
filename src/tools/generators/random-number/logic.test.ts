import { describe, expect, it } from 'vitest';
import {
  MAX_DICE,
  diceRange,
  distinctValues,
  formatNumber,
  generateNumbers,
  gridFor,
  parseDice,
  randomInt,
  rollDice,
  type NumberOptions,
  type Rng,
} from './logic';

/** Always picks the top of the range, so every die shows its maximum face. */
const highest: Rng = (max) => max - 1;
/** Always picks the bottom. */
const lowest: Rng = () => 0;

const base: NumberOptions = {
  min: 1,
  max: 100,
  precision: 0,
  count: 10,
  allowDuplicates: true,
  sort: 'none',
};

describe('parseDice', () => {
  it('reads the classic NdM+K form', () => {
    const n = parseDice('3d6+2');
    expect(n.terms).toEqual([{ count: 3, sides: 6, sign: 1 }]);
    expect(n.modifier).toBe(2);
    expect(n.totalDice).toBe(3);
  });

  it('treats a bare d20 as one die', () => {
    expect(parseDice('d20').terms).toEqual([{ count: 1, sides: 20, sign: 1 }]);
  });

  it('handles several dice groups, negatives and spaces', () => {
    const n = parseDice(' 2d6 + 1d4 - 1 ');
    expect(n.terms).toEqual([
      { count: 2, sides: 6, sign: 1 },
      { count: 1, sides: 4, sign: 1 },
    ]);
    expect(n.modifier).toBe(-1);
    expect(n.canonical).toBe('2d6 + 1d4 − 1');
  });

  it('subtracts a dice group', () => {
    const n = parseDice('4d8-1d6');
    expect(n.terms[1]).toEqual({ count: 1, sides: 6, sign: -1 });
    expect(n.modifier).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(parseDice('2D10').terms[0].sides).toBe(10);
  });

  it('rejects anything that is not dice notation', () => {
    expect(() => parseDice('abc')).toThrow(/not dice notation/i);
    expect(() => parseDice('3d6xyz')).toThrow(/not dice notation/i);
    expect(() => parseDice('')).toThrow(/3d6/);
    expect(() => parseDice('7')).toThrow(/no dice/i);
  });

  it('rejects impossible dice', () => {
    expect(() => parseDice('0d6')).toThrow(/at least one die/i);
    expect(() => parseDice('2d1')).toThrow(/two sides/i);
    expect(() => parseDice('1d5000')).toThrow(/limit/i);
    expect(() => parseDice(`${MAX_DICE + 1}d6`)).toThrow(/limit/i);
  });
});

describe('rollDice', () => {
  it('keeps every die inside its own face range', () => {
    const notation = parseDice('50d6+3');
    const result = rollDice(notation);
    expect(result.rolls[0].values).toHaveLength(50);
    for (const value of result.rolls[0].values) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
    expect(result.total).toBe(result.rolls[0].subtotal + 3);
  });

  it('adds the modifier once, not once per die', () => {
    const result = rollDice(parseDice('3d6+2'), highest);
    expect(result.rolls[0].values).toEqual([6, 6, 6]);
    expect(result.total).toBe(20);
  });

  it('subtracts a negative group from the total', () => {
    const result = rollDice(parseDice('2d6-1d4'), highest);
    expect(result.rolls[1].subtotal).toBe(-4);
    expect(result.total).toBe(8);
  });

  it('hits the documented floor and ceiling at the extremes', () => {
    const notation = parseDice('3d6+2');
    const range = diceRange(notation);
    expect(range).toEqual({ min: 5, max: 20 });
    expect(rollDice(notation, lowest).total).toBe(range.min);
    expect(rollDice(notation, highest).total).toBe(range.max);
  });

  it('ranges correctly when a group is subtracted', () => {
    expect(diceRange(parseDice('2d6-1d4'))).toEqual({ min: -2, max: 11 });
  });
});

describe('generateNumbers', () => {
  it('stays inside the range', () => {
    const values = generateNumbers({ ...base, count: 500 });
    expect(values).toHaveLength(500);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('never repeats a value when duplicates are off', () => {
    const values = generateNumbers({ ...base, min: 1, max: 50, count: 50, allowDuplicates: false });
    expect(new Set(values).size).toBe(50);
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('caps the count at the size of the range instead of looping forever', () => {
    const values = generateNumbers({ ...base, min: 1, max: 6, count: 100, allowDuplicates: false });
    expect(values).toHaveLength(6);
  });

  it('samples without replacement from a wide range too', () => {
    const values = generateNumbers({ ...base, min: 0, max: 1_000_000, count: 300, allowDuplicates: false });
    expect(new Set(values).size).toBe(300);
  });

  it('handles a reversed range by swapping the ends', () => {
    const values = generateNumbers({ ...base, min: 90, max: 10, count: 100 });
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(90);
    }
  });

  it('produces decimals on an exact grid', () => {
    const values = generateNumbers({ ...base, min: 0, max: 1, precision: 2, count: 200 });
    for (const v of values) {
      expect(Math.round(v * 100)).toBeCloseTo(v * 100, 6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('counts decimal grid points when duplicates are off', () => {
    expect(distinctValues(0, 1, 2)).toBe(101);
    expect(distinctValues(1, 6, 0)).toBe(6);
    const values = generateNumbers({ ...base, min: 0, max: 0.4, precision: 1, count: 99, allowDuplicates: false });
    expect(values).toHaveLength(5);
    expect([...values].sort((a, b) => a - b).map((v) => formatNumber(v, 1))).toEqual([
      '0.0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
    ]);
  });

  it('sorts when asked and leaves the draw order alone otherwise', () => {
    const asc = generateNumbers({ ...base, count: 40, sort: 'asc' });
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = generateNumbers({ ...base, count: 40, sort: 'desc' });
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it('rejects a range that cannot be represented', () => {
    expect(() => gridFor(Number.NaN, 10, 0)).toThrow(/real numbers/i);
    expect(() => gridFor(0, 1e15, 6)).toThrow(/too wide/i);
  });

  it('always returns at least one number', () => {
    expect(generateNumbers({ ...base, count: 0 })).toHaveLength(1);
  });
});

describe('randomInt', () => {
  it('covers a small range uniformly enough to see every face', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 6000; i += 1) {
      const n = randomInt(6);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const value of counts.values()) expect(value).toBeGreaterThan(700);
  });
});
