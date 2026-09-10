import { describe, it, expect } from 'vitest';
import {
  ALL_UNITS,
  ambiguity,
  bestUnit,
  formatQuantity,
  fromBytes,
  parseAmount,
  toBytes,
  unitById,
} from './logic';

describe('unit table', () => {
  it('has unique ids and matching tiers in both systems', () => {
    const ids = ALL_UNITS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let tier = 0; tier <= 5; tier++) {
      const decimal = ALL_UNITS.find((u) => u.system === 'decimal' && u.tier === tier);
      const binary = ALL_UNITS.find((u) => u.system === 'binary' && u.tier === tier);
      expect(decimal).toBeTruthy();
      expect(binary).toBeTruthy();
      expect(decimal!.factor).toBe(1000 ** tier);
      expect(binary!.factor).toBe(1024 ** tier);
    }
  });
});

describe('toBytes / fromBytes', () => {
  it('converts the decimal units', () => {
    expect(toBytes(1, 'kB')).toBe(1000);
    expect(toBytes(1, 'MB')).toBe(1_000_000);
    expect(toBytes(2.5, 'GB')).toBe(2_500_000_000);
  });

  it('converts the binary units', () => {
    expect(toBytes(1, 'KiB')).toBe(1024);
    expect(toBytes(1, 'MiB')).toBe(1_048_576);
    expect(toBytes(1, 'GiB')).toBe(1_073_741_824);
    expect(toBytes(1, 'TiB')).toBe(1_099_511_627_776);
  });

  it('round-trips through every unit', () => {
    for (const unit of ALL_UNITS) {
      const bytes = toBytes(3.25, unit.id)!;
      expect(fromBytes(bytes, unit.id)).toBeCloseTo(3.25, 9);
    }
  });

  it('rejects unknown units and negative sizes', () => {
    expect(toBytes(1, 'ZB')).toBeNull();
    expect(toBytes(-1, 'MB')).toBeNull();
    expect(fromBytes(-1, 'MB')).toBeNull();
    expect(unitById('nope')).toBeUndefined();
  });

  it('shows the classic 1 GB vs 1 GiB gap', () => {
    expect(toBytes(1, 'GiB')! - toBytes(1, 'GB')!).toBe(73_741_824);
  });
});

describe('bestUnit', () => {
  it('picks a readable unit in each system', () => {
    expect(bestUnit(999, 'decimal').id).toBe('B');
    expect(bestUnit(1000, 'decimal').id).toBe('kB');
    expect(bestUnit(1023, 'binary').id).toBe('B2');
    expect(bestUnit(1024, 'binary').id).toBe('KiB');
    expect(bestUnit(5_000_000_000, 'decimal').id).toBe('GB');
    expect(bestUnit(0, 'decimal').id).toBe('B');
  });
});

describe('ambiguity', () => {
  it('quantifies the gap at each tier', () => {
    const gb = ambiguity(4, 3)!;
    expect(gb.decimalBytes).toBe(4_000_000_000);
    expect(gb.binaryBytes).toBe(4_294_967_296);
    expect(gb.differenceBytes).toBe(294_967_296);
    expect(gb.differencePercent).toBeCloseTo(7.374, 3);

    expect(ambiguity(1, 1)!.differencePercent).toBeCloseTo(2.4, 6);
    expect(ambiguity(1, 2)!.differencePercent).toBeCloseTo(4.8576, 4);
    expect(ambiguity(1, 4)!.differencePercent).toBeCloseTo(9.9512, 4);
  });

  it('has nothing to say about plain bytes', () => {
    expect(ambiguity(500, 0)).toBeNull();
    expect(ambiguity(-1, 3)).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('groups and trims', () => {
    expect(formatQuantity(1024)).toBe('1,024');
    expect(formatQuantity(1_073_741_824)).toBe('1,073,741,824');
    expect(formatQuantity(0.9765625)).toBe('0.9765625');
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(null)).toBe('—');
  });

  it('keeps small fractions readable and huge numbers short', () => {
    expect(formatQuantity(1 / 1024)).toBe('0.0009765625');
    expect(formatQuantity(1e20)).toContain('e+20');
  });
});

describe('parseAmount', () => {
  it('accepts what people type', () => {
    expect(parseAmount('4')).toBe(4);
    expect(parseAmount('4.7')).toBe(4.7);
    expect(parseAmount('1,024')).toBe(1024);
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount('1e6')).toBe(1_000_000);
  });

  it('rejects negatives and junk', () => {
    expect(parseAmount('-4')).toBeNull();
    expect(parseAmount('big')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});
