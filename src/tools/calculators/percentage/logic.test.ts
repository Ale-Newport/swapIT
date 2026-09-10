import { describe, it, expect } from 'vitest';
import {
  applyPercent,
  formatNumber,
  formatSigned,
  normalizeDecimal,
  parseNumber,
  percentChange,
  percentOf,
  reversePercent,
  whatPercent,
} from './logic';

describe('parseNumber', () => {
  it('reads plain numbers, signs and exponents', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber(' -3.5 ')).toBe(-3.5);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('1e3')).toBe(1000);
  });

  it('accepts a trailing percent sign and grouping characters', () => {
    expect(parseNumber('15%')).toBe(15);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('1 234')).toBe(1234);
  });

  it('treats a lone comma as a decimal separator', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(normalizeDecimal('1,234')).toBe('1234');
    expect(normalizeDecimal('1,23')).toBe('1.23');
  });

  it('rejects empty and malformed input', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1.2.3')).toBeNull();
    expect(parseNumber('-')).toBeNull();
  });
});

describe('formatNumber', () => {
  it('groups thousands and trims trailing zeros', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatNumber(1234.5678)).toBe('1,234.57');
    expect(formatNumber(0.5)).toBe('0.5');
  });

  it('honours a fixed decimal count', () => {
    expect(formatNumber(12.3, 2)).toBe('12.30');
    expect(formatNumber(12.345, 0)).toBe('12');
    expect(formatNumber(-1000.5, 1)).toBe('-1,000.5');
  });

  it('never renders negative zero', () => {
    expect(formatNumber(-0.0001, 2)).toBe('0.00');
  });

  it('falls back to exponential for extremes', () => {
    expect(formatNumber(1e-9)).toBe('1.000e-9');
    expect(formatNumber(1e20)).toContain('e+20');
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});

describe('formatSigned', () => {
  it('always shows the direction', () => {
    expect(formatSigned(12.5)).toBe('+12.5');
    expect(formatSigned(-12.5)).toBe('-12.5');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(null)).toBe('—');
  });
});

describe('percentOf', () => {
  it('takes a share of a value', () => {
    expect(percentOf(15, 200)).toBe(30);
    expect(percentOf(0, 200)).toBe(0);
    expect(percentOf(150, 40)).toBe(60);
    expect(percentOf(-10, 50)).toBe(-5);
  });
});

describe('whatPercent', () => {
  it('expresses a part as a share of the whole', () => {
    expect(whatPercent(30, 200)).toBe(15);
    expect(whatPercent(200, 200)).toBe(100);
    expect(whatPercent(250, 200)).toBe(125);
  });

  it('is undefined against a zero whole', () => {
    expect(whatPercent(5, 0)).toBeNull();
  });
});

describe('percentChange', () => {
  it('measures increases and decreases', () => {
    expect(percentChange(100, 150)).toBe(50);
    expect(percentChange(150, 100)).toBeCloseTo(-33.3333, 4);
    expect(percentChange(80, 80)).toBe(0);
  });

  it('handles crossing zero and a zero start', () => {
    expect(percentChange(-50, 50)).toBe(-200);
    expect(percentChange(0, 10)).toBeNull();
  });
});

describe('applyPercent', () => {
  it('adds and subtracts a share of the value itself', () => {
    expect(applyPercent(200, 15, 'add')).toBe(230);
    expect(applyPercent(200, 15, 'subtract')).toBe(170);
    expect(applyPercent(100, 100, 'subtract')).toBe(0);
  });

  it('round-trips against percentChange', () => {
    const raised = applyPercent(80, 25, 'add');
    expect(percentChange(80, raised)).toBeCloseTo(25, 10);
  });
});

describe('reversePercent', () => {
  it('recovers the original whole', () => {
    expect(reversePercent(30, 15)).toBe(200);
    expect(reversePercent(121, 121)).toBe(100);
    expect(reversePercent(50, 200)).toBe(25);
  });

  it('is undefined for zero percent', () => {
    expect(reversePercent(30, 0)).toBeNull();
  });

  it('inverts percentOf', () => {
    expect(reversePercent(percentOf(37.5, 640), 37.5)).toBeCloseTo(640, 9);
  });
});
