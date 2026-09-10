import { describe, it, expect } from 'vitest';
import {
  cmykToRgb,
  contrastRatio,
  contrastReport,
  formatCmyk,
  formatHsl,
  hslToRgb,
  hsvToRgb,
  mix,
  nearestNamed,
  parseColor,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  shades,
  tints,
  toHex,
  toHexAlpha,
  wcag,
} from './logic';

describe('parseColor', () => {
  it('reads hex in every length', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('3b82f6')).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    expect(parseColor('#ff000080').a).toBeCloseTo(0.502, 2);
    expect(parseColor('#f00f').a).toBe(1);
  });

  it('reads rgb in comma and space syntax', () => {
    expect(parseColor('rgb(59, 130, 246)')).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    expect(parseColor('rgb(59 130 246)')).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    expect(parseColor('rgba(59, 130, 246, 0.5)').a).toBe(0.5);
    expect(parseColor('rgb(59 130 246 / 50%)').a).toBe(0.5);
    expect(parseColor('rgb(100%, 0%, 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('reads hsl, hsv and cmyk', () => {
    expect(parseColor('hsl(210, 50%, 40%)')).toEqual({ r: 51, g: 102, b: 153, a: 1 });
    expect(parseColor('hsl(210deg 50% 40% / 0.25)').a).toBe(0.25);
    expect(parseColor('hsv(0, 100%, 100%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('cmyk(0%, 100%, 100%, 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('reads CSS names', () => {
    expect(toHex(parseColor('rebeccapurple'))).toBe('#663399');
    expect(toHex(parseColor('SteelBlue'))).toBe('#4682b4');
  });

  it('explains what went wrong', () => {
    expect(() => parseColor('')).toThrow(/Type a colour/);
    expect(() => parseColor('#12345')).toThrow('A hex colour needs 3, 4, 6 or 8 digits — "#12345" has 5.');
    expect(() => parseColor('bluish')).toThrow(/not a CSS colour name/);
    expect(() => parseColor('lab(50% 20 30)')).toThrow(/not a colour notation/);
    expect(() => parseColor('rgb(1, 2)')).toThrow('rgb() needs three values: red, green and blue.');
  });
});

describe('model conversions', () => {
  it('matches known HSL values', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, l: 100 });
    expect(rgbToHsl({ r: 0, g: 128, b: 0 })).toEqual({ h: 120, s: 100, l: 25.1 });
    expect(hslToRgb({ h: 210, s: 50, l: 40 })).toEqual({ r: 51, g: 102, b: 153 });
  });

  it('matches known HSV values', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
    expect(hsvToRgb({ h: 120, s: 100, v: 50 })).toEqual({ r: 0, g: 128, b: 0 });
  });

  it('matches known CMYK values', () => {
    expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(cmykToRgb({ c: 100, m: 0, y: 100, k: 0 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(formatCmyk(rgbToCmyk({ r: 59, g: 130, b: 246 }))).toBe('cmyk(76%, 47%, 0%, 4%)');
  });

  it('round trips rgb through every model', () => {
    const samples = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 59, g: 130, b: 246 },
      { r: 17, g: 200, b: 88 },
      { r: 240, g: 12, b: 199 },
      { r: 128, g: 128, b: 128 },
      { r: 1, g: 2, b: 3 },
    ];
    for (const rgb of samples) {
      expect(hslToRgb(rgbToHsl(rgb))).toEqual(rgb);
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
      expect(cmykToRgb(rgbToCmyk(rgb))).toEqual(rgb);
      expect(parseColor(toHex(rgb))).toEqual({ ...rgb, a: 1 });
      // formatHsl rounds to whole degrees and percents, so allow a channel of drift.
      const viaText = parseColor(formatHsl(rgbToHsl(rgb)));
      expect(Math.abs(viaText.r - rgb.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(viaText.g - rgb.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(viaText.b - rgb.b)).toBeLessThanOrEqual(2);
    }
  });

  it('round trips alpha through 8-digit hex', () => {
    const c = { r: 10, g: 20, b: 30, a: 0.5 };
    expect(parseColor(toHexAlpha(c)).a).toBeCloseTo(0.5, 2);
  });
});

describe('contrast', () => {
  it('is 21 between black and white and 1 against itself', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBe(21);
    expect(contrastRatio({ r: 59, g: 130, b: 246 }, { r: 59, g: 130, b: 246 })).toBe(1);
  });

  it('matches the classic 4.5:1 grey', () => {
    expect(contrastRatio({ r: 118, g: 118, b: 118 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(4.54, 1);
  });

  it('grades against the WCAG thresholds', () => {
    expect(wcag(21).grade).toBe('AAA');
    expect(wcag(4.6).grade).toBe('AA');
    expect(wcag(3.2).grade).toBe('AA Large');
    expect(wcag(2).grade).toBe('Fail');
    expect(wcag(4.5).aaNormal).toBe(true);
    expect(wcag(4.49).aaNormal).toBe(false);
  });

  it('picks the better backdrop', () => {
    expect(contrastReport({ r: 0, g: 0, b: 0, a: 1 }).bestOn).toBe('white');
    expect(contrastReport({ r: 255, g: 255, b: 200, a: 1 }).bestOn).toBe('black');
  });
});

describe('named colours', () => {
  it('finds an exact match', () => {
    const match = nearestNamed({ r: 102, g: 51, b: 153 });
    expect(match.name).toBe('rebeccapurple');
    expect(match.exact).toBe(true);
    expect(match.distance).toBe(0);
  });

  it('falls back to the closest name', () => {
    const match = nearestNamed({ r: 101, g: 52, b: 152 });
    expect(match.name).toBe('rebeccapurple');
    expect(match.exact).toBe(false);
    expect(match.distance).toBeGreaterThan(0);
  });

  it('never returns nothing', () => {
    expect(nearestNamed({ r: 123, g: 45, b: 67 }).hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('ramps', () => {
  it('mixes linearly', () => {
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
    expect(mix({ r: 10, g: 20, b: 30 }, { r: 0, g: 0, b: 0 }, 0)).toEqual({ r: 10, g: 20, b: 30 });
  });

  it('ends at white and black', () => {
    const base = { r: 59, g: 130, b: 246 };
    const t = tints(base);
    const s = shades(base);
    expect(t).toHaveLength(10);
    expect(t[9]).toEqual({ percent: 100, hex: '#ffffff' });
    expect(t[0].percent).toBe(10);
    expect(s[9]).toEqual({ percent: 100, hex: '#000000' });
  });
});
