import { describe, it, expect } from 'vitest';
import {
  dpiFor,
  fmt,
  fromInches,
  inchesToPixels,
  parsePositive,
  pixelsToInches,
  printQuality,
  screenReport,
  toInches,
} from './logic';

describe('unit conversion', () => {
  it('round-trips every unit', () => {
    for (const unit of ['in', 'cm', 'mm'] as const) {
      expect(fromInches(toInches(7.5, unit), unit)).toBeCloseTo(7.5, 10);
    }
  });

  it('uses the exact inch definition', () => {
    expect(toInches(25.4, 'mm')).toBe(1);
    expect(toInches(2.54, 'cm')).toBeCloseTo(1, 12);
    expect(fromInches(1, 'mm')).toBe(25.4);
    expect(fromInches(1, 'cm')).toBeCloseTo(2.54, 12);
  });
});

describe('pixels and physical size', () => {
  it('converts at a given resolution', () => {
    expect(pixelsToInches(3000, 300)).toBe(10);
    expect(inchesToPixels(10, 300)).toBe(3000);
    expect(pixelsToInches(1920, 72)).toBeCloseTo(26.6667, 4);
  });

  it('refuses a zero or negative resolution', () => {
    expect(pixelsToInches(3000, 0)).toBeNull();
    expect(inchesToPixels(10, -300)).toBeNull();
    expect(pixelsToInches(-1, 300)).toBeNull();
  });

  it('inverts itself', () => {
    const inches = pixelsToInches(4032, 240)!;
    expect(inchesToPixels(inches, 240)).toBeCloseTo(4032, 9);
  });
});

describe('dpiFor', () => {
  it('reports the resolution a print actually achieves', () => {
    expect(dpiFor(3000, 10)).toBe(300);
    expect(dpiFor(4032, 20)).toBeCloseTo(201.6, 6);
  });

  it('is undefined for a zero-sized print', () => {
    expect(dpiFor(3000, 0)).toBeNull();
    expect(dpiFor(0, 10)).toBeNull();
  });
});

describe('screenReport', () => {
  it('matches a 27-inch 4K display', () => {
    const r = screenReport(27, 3840, 2160)!;
    expect(r.ppi).toBeCloseTo(163.18, 2);
    expect(r.widthInches).toBeCloseTo(23.53, 2);
    expect(r.heightInches).toBeCloseTo(13.24, 2);
    expect(r.dotPitchMm).toBeCloseTo(0.1557, 4);
  });

  it('matches a 1080p 24-inch monitor', () => {
    expect(screenReport(24, 1920, 1080)!.ppi).toBeCloseTo(91.79, 2);
  });

  it('keeps the diagonal consistent', () => {
    const r = screenReport(13.3, 2560, 1600)!;
    expect(Math.hypot(r.widthInches, r.heightInches)).toBeCloseTo(13.3, 9);
  });

  it('rejects impossible input', () => {
    expect(screenReport(0, 1920, 1080)).toBeNull();
    expect(screenReport(24, 0, 1080)).toBeNull();
  });
});

describe('printQuality', () => {
  it('splits on the boundaries the print world uses', () => {
    expect(printQuality(300).label).toBe('Photo quality');
    expect(printQuality(299.9).label).toBe('Good');
    expect(printQuality(200).label).toBe('Good');
    expect(printQuality(199).label).toBe('Acceptable');
    expect(printQuality(150).label).toBe('Acceptable');
    expect(printQuality(149).label).toBe('Low');
    expect(printQuality(71).label).toBe('Too low');
    expect(printQuality(0).tone).toBe('danger');
  });
});

describe('parsePositive / fmt', () => {
  it('parses sizes people type', () => {
    expect(parsePositive('300')).toBe(300);
    expect(parsePositive('8.5')).toBe(8.5);
    expect(parsePositive('1,920')).toBe(1920);
    expect(parsePositive('0')).toBeNull();
    expect(parsePositive('')).toBeNull();
    expect(parsePositive('three')).toBeNull();
  });

  it('formats without locale surprises', () => {
    expect(fmt(1234.5)).toBe('1,234.5');
    expect(fmt(10, 2)).toBe('10');
    expect(fmt(0.15567, 4)).toBe('0.1557');
    expect(fmt(null)).toBe('—');
  });
});
