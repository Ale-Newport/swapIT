import { describe, expect, it } from 'vitest';
import {
  constraintBounds,
  formatHsl,
  formatRgb,
  hueInRange,
  makeColor,
  normaliseHue,
  random,
  readableInk,
  rgbToHex,
  rgbToHsl,
  type Constraint,
} from './logic';

const MODES: Constraint[] = ['any', 'pastel', 'vivid', 'dark', 'light'];

describe('makeColor', () => {
  it('always produces a six-digit hex colour', () => {
    for (const mode of MODES) {
      for (let i = 0; i < 100; i += 1) {
        expect(makeColor(mode).hex).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('keeps every mode inside its own saturation and lightness box', () => {
    for (const mode of MODES) {
      const bounds = constraintBounds(mode);
      for (let i = 0; i < 200; i += 1) {
        const { hsl } = makeColor(mode);
        // The round trip through 8-bit sRGB moves things by up to a percent.
        expect(hsl.l).toBeGreaterThanOrEqual(bounds.lightness[0] - 1.5);
        expect(hsl.l).toBeLessThanOrEqual(bounds.lightness[1] + 1.5);
        expect(hsl.s).toBeLessThanOrEqual(bounds.saturation[1] + 2);
      }
    }
  });

  it('separates pastel from vivid and dark from light', () => {
    const pastel = Array.from({ length: 50 }, () => makeColor('pastel').hsl.l);
    const dark = Array.from({ length: 50 }, () => makeColor('dark').hsl.l);
    expect(Math.min(...pastel)).toBeGreaterThan(Math.max(...dark));

    const vivid = Array.from({ length: 50 }, () => makeColor('vivid').hsl.s);
    expect(Math.min(...vivid)).toBeGreaterThan(60);
  });

  it('stays inside a hue range', () => {
    for (let i = 0; i < 200; i += 1) {
      const { hsl } = makeColor('hue', { from: 90, to: 150 });
      expect(hsl.h).toBeGreaterThanOrEqual(88);
      expect(hsl.h).toBeLessThanOrEqual(152);
    }
  });

  it('wraps a hue range that crosses zero', () => {
    for (let i = 0; i < 200; i += 1) {
      const hue = makeColor('hue', { from: 340, to: 20 }).hsl.h;
      expect(hue >= 338 || hue <= 22, `${hue} should be near the red end of the wheel`).toBe(true);
    }
  });

  it('varies between calls', () => {
    const seen = new Set(Array.from({ length: 50 }, () => makeColor('any').hex));
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe('hueInRange', () => {
  it('returns the ends of the span at the ends of the random draw', () => {
    expect(hueInRange({ from: 30, to: 90 }, () => 0)).toBe(30);
    expect(hueInRange({ from: 30, to: 90 }, () => 0.5)).toBe(60);
    expect(hueInRange({ from: 350, to: 10 }, () => 0.5)).toBe(0);
  });
});

describe('helpers', () => {
  it('normalises hues onto the wheel', () => {
    expect(normaliseHue(-90)).toBe(270);
    expect(normaliseHue(725)).toBe(5);
  });

  it('formats css notations', () => {
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000');
    expect(formatRgb({ r: 255, g: 128, b: 0 })).toBe('rgb(255, 128, 0)');
    expect(formatHsl(rgbToHsl({ r: 255, g: 128, b: 0 }))).toBe('hsl(30, 100%, 50%)');
  });

  it('chooses ink that stays readable on the swatch', () => {
    expect(readableInk({ r: 255, g: 255, b: 255 })).toBe('#000000');
    expect(readableInk({ r: 20, g: 20, b: 20 })).toBe('#ffffff');
  });

  it('draws random floats inside the unit interval', () => {
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
