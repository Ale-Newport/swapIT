import { describe, it, expect } from 'vitest';
import { isValidColor, sheetLayout } from './logic';

describe('isValidColor', () => {
  it('accepts every notation the backend parses', () => {
    expect(isValidColor('#fff')).toBe(true);
    expect(isValidColor('ffffff')).toBe(true);
    expect(isValidColor('#ff000080')).toBe(true);
    expect(isValidColor('#FFF0')).toBe(true);
  });

  it('rejects half-typed and nonsense values', () => {
    expect(isValidColor('#ff')).toBe(false);
    expect(isValidColor('#fffff')).toBe(false);
    expect(isValidColor('white')).toBe(false);
    expect(isValidColor('')).toBe(false);
  });
});

describe('sheetLayout', () => {
  it('matches the backend geometry for a full grid', () => {
    const layout = sheetLayout({ count: 8, columns: 4, thumbSize: 320, gap: 12, labels: false });
    expect(layout.rows).toBe(2);
    // 4*320 + 5*12
    expect(layout.width).toBe(1340);
    // 2*320 + 3*12
    expect(layout.height).toBe(676);
  });

  it('rounds a partial last row up', () => {
    expect(sheetLayout({ count: 9, columns: 4, thumbSize: 100, gap: 0, labels: false }).rows).toBe(3);
    expect(sheetLayout({ count: 1, columns: 4, thumbSize: 100, gap: 0, labels: false }).rows).toBe(1);
  });

  it('adds the label strip the backend reserves under each thumbnail', () => {
    const withLabels = sheetLayout({ count: 4, columns: 4, thumbSize: 320, gap: 12, labels: true });
    expect(withLabels.labelHeight).toBe(26); // floor(320 / 12)
    expect(withLabels.height).toBe(1 * (320 + 26) + 2 * 12);
  });

  it('never lets the label strip fall below 12 px', () => {
    expect(sheetLayout({ count: 1, columns: 1, thumbSize: 48, gap: 0, labels: true }).labelHeight).toBe(12);
  });

  it('applies the same clamps as the backend', () => {
    const layout = sheetLayout({ count: 4, columns: 99, thumbSize: 4000, gap: 999, labels: false });
    expect(layout.columns).toBe(20);
    expect(layout.thumbSize).toBe(1024);
    expect(layout.gap).toBe(200);

    const small = sheetLayout({ count: 4, columns: 0, thumbSize: 1, gap: -5, labels: false });
    expect(small.columns).toBe(1);
    expect(small.thumbSize).toBe(48);
    expect(small.gap).toBe(0);
  });

  it('stays valid with no files selected', () => {
    const empty = sheetLayout({ count: 0, columns: 4, thumbSize: 320, gap: 12, labels: false });
    expect(empty.rows).toBe(0);
    expect(empty.height).toBe(12);
    expect(empty.width).toBeGreaterThan(0);
  });

  it('tolerates a half-typed number field', () => {
    const layout = sheetLayout({ count: 4, columns: Number.NaN, thumbSize: Number.NaN, gap: Number.NaN, labels: false });
    expect(layout.columns).toBe(1);
    expect(layout.thumbSize).toBe(48);
    expect(layout.gap).toBe(0);
  });
});
