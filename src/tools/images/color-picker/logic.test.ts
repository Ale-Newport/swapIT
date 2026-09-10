import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  formatHsl,
  formatRgb,
  hexToRgb,
  pushRecent,
  readableInk,
  relativeLuminance,
  rgbToHsl,
  toHex,
} from './logic';

describe('toHex', () => {
  it('pads single-digit channels', () => {
    expect(toHex({ r: 0, g: 8, b: 16 })).toBe('#000810');
  });

  it('clamps values that fall outside a byte', () => {
    expect(toHex({ r: 300, g: -20, b: 127.6 })).toBe('#FF0080');
  });
});

describe('hexToRgb', () => {
  it('expands the three-digit form', () => {
    expect(hexToRgb('#0af')).toEqual({ r: 0, g: 170, b: 255 });
  });

  it('accepts a missing hash and mixed case', () => {
    expect(hexToRgb('AaBbCc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('rejects anything that is not a colour', () => {
    expect(hexToRgb('#12345')).toBeNull();
    expect(hexToRgb('rebeccapurple')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('rgbToHsl', () => {
  it('keeps hue at zero for greys', () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, l: (128 / 255) * 100 });
  });

  it('places the primaries 120 degrees apart', () => {
    expect(formatHsl(rgbToHsl({ r: 255, g: 0, b: 0 }))).toBe('hsl(0, 100%, 50%)');
    expect(formatHsl(rgbToHsl({ r: 0, g: 255, b: 0 }))).toBe('hsl(120, 100%, 50%)');
    expect(formatHsl(rgbToHsl({ r: 0, g: 0, b: 255 }))).toBe('hsl(240, 100%, 50%)');
  });

  it('wraps magenta hues into the positive range', () => {
    const hsl = rgbToHsl({ r: 255, g: 0, b: 128 });
    expect(hsl.h).toBeGreaterThan(300);
    expect(hsl.h).toBeLessThan(340);
  });

  it('round-trips a mid-tone through hex', () => {
    const rgb = hexToRgb('#3B82F6')!;
    expect(formatHsl(rgbToHsl(rgb))).toBe('hsl(217, 91%, 60%)');
  });
});

describe('formatRgb', () => {
  it('renders CSS-ready values', () => {
    expect(formatRgb({ r: 12, g: 34, b: 56 })).toBe('rgb(12, 34, 56)');
  });
});

describe('contrast', () => {
  it('rates black against white at 21:1', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
  });

  it('is symmetric', () => {
    const a = { r: 200, g: 30, b: 90 };
    const b = { r: 10, g: 90, b: 200 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('ranks green as brighter than blue', () => {
    expect(relativeLuminance({ r: 0, g: 255, b: 0 })).toBeGreaterThan(
      relativeLuminance({ r: 0, g: 0, b: 255 }),
    );
  });

  it('picks ink that stays readable', () => {
    expect(readableInk({ r: 255, g: 255, b: 255 })).toBe('#000000');
    expect(readableInk({ r: 0, g: 0, b: 0 })).toBe('#FFFFFF');
    expect(readableInk({ r: 255, g: 214, b: 10 })).toBe('#000000');
  });
});

describe('pushRecent', () => {
  it('puts the newest sample first', () => {
    const list = pushRecent(pushRecent([], { r: 1, g: 1, b: 1 }), { r: 2, g: 2, b: 2 });
    expect(list.map(toHex)).toEqual(['#020202', '#010101']);
  });

  it('moves a repeated colour back to the front instead of duplicating it', () => {
    let list = pushRecent([], { r: 1, g: 1, b: 1 });
    list = pushRecent(list, { r: 2, g: 2, b: 2 });
    list = pushRecent(list, { r: 1, g: 1, b: 1 });
    expect(list.map(toHex)).toEqual(['#010101', '#020202']);
  });

  it('never grows past the limit', () => {
    let list: Array<{ r: number; g: number; b: number }> = [];
    for (let i = 0; i < 30; i += 1) list = pushRecent(list, { r: i, g: 0, b: 0 });
    expect(list).toHaveLength(12);
    expect(toHex(list[0])).toBe('#1D0000');
  });
});
