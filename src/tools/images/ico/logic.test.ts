import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIZES,
  ICO_SIZES,
  fitLabel,
  frameSummary,
  isSquare,
  normalizeSizes,
  squareSourceSize,
  toggleSize,
} from './logic';

describe('normalizeSizes', () => {
  it('sorts, de-duplicates and drops out-of-range frames', () => {
    expect(normalizeSizes([256, 32, 32, 512, 0, -8, 16])).toEqual([16, 32, 256]);
  });

  it('rounds fractional sizes', () => {
    expect(normalizeSizes([31.6])).toEqual([32]);
  });

  it('ignores values that are not numbers', () => {
    expect(normalizeSizes([Number.NaN, Number.POSITIVE_INFINITY, 48])).toEqual([48]);
  });

  it('leaves the offered sizes untouched', () => {
    expect(normalizeSizes(ICO_SIZES)).toEqual(ICO_SIZES);
    expect(normalizeSizes(DEFAULT_SIZES)).toEqual(DEFAULT_SIZES);
  });
});

describe('toggleSize', () => {
  it('adds a missing size in the right position', () => {
    expect(toggleSize([16, 48], 32)).toEqual([16, 32, 48]);
  });

  it('removes a size that is already selected', () => {
    expect(toggleSize([16, 32, 48], 32)).toEqual([16, 48]);
  });

  it('can empty the selection', () => {
    expect(toggleSize([16], 16)).toEqual([]);
  });
});

describe('squareSourceSize', () => {
  it('uses the shorter edge so nothing is upscaled', () => {
    expect(squareSourceSize(4000, 1000)).toBe(1000);
    expect(squareSourceSize(120, 400)).toBe(120);
  });

  it('caps enormous sources', () => {
    expect(squareSourceSize(9000, 8000)).toBe(2048);
  });

  it('never drops below a usable frame', () => {
    expect(squareSourceSize(8, 4)).toBe(16);
  });
});

describe('isSquare', () => {
  it('needs both edges to match and be real', () => {
    expect(isSquare(512, 512)).toBe(true);
    expect(isSquare(512, 511)).toBe(false);
    expect(isSquare(0, 0)).toBe(false);
  });
});

describe('labels', () => {
  it('counts the frames', () => {
    expect(frameSummary([32, 16, 16])).toBe('2 frames · 16, 32 px');
    expect(frameSummary([64])).toBe('1 frame · 64 px');
    expect(frameSummary([])).toBe('No frames selected');
  });

  it('describes what will happen to a non-square source', () => {
    expect(fitLabel(false, false)).toContain('stretched');
    expect(fitLabel(true, false)).toContain('cropped');
    expect(fitLabel(false, true)).toContain('exact square');
  });
});
