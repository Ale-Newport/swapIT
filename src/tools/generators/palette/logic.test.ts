import { describe, expect, it } from 'vitest';
import {
  buildPalette,
  contrastRatio,
  exportPalette,
  formatHsl,
  formatRgb,
  hexToHsl,
  hslToHex,
  hslToRgb,
  mix,
  normaliseHue,
  parseHex,
  readableInk,
  rgbToHex,
  rgbToHsl,
} from './logic';

describe('parseHex', () => {
  it('reads long, short, prefixed and bare forms', () => {
    expect(parseHex('#4f46e5')).toEqual({ r: 0x4f, g: 0x46, b: 0xe5 });
    expect(parseHex('4f46e5')).toEqual({ r: 0x4f, g: 0x46, b: 0xe5 });
    expect(parseHex('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseHex('  #FFFFFF ')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects anything that is not a colour', () => {
    expect(parseHex('')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('rebeccapurple')).toBeNull();
    expect(parseHex('#gggggg')).toBeNull();
  });
});

describe('conversions', () => {
  const samples = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#4f46e5', '#7f7f7f', '#c0ffee'];

  it('round-trips hex → hsl → hex exactly', () => {
    for (const hex of samples) {
      const hsl = hexToHsl(hex);
      expect(hsl).not.toBeNull();
      expect(hslToHex(hsl!)).toBe(hex);
    }
  });

  it('places the primaries on the right hues', () => {
    expect(Math.round(rgbToHsl({ r: 255, g: 0, b: 0 }).h)).toBe(0);
    expect(Math.round(rgbToHsl({ r: 0, g: 255, b: 0 }).h)).toBe(120);
    expect(Math.round(rgbToHsl({ r: 0, g: 0, b: 255 }).h)).toBe(240);
  });

  it('reports greys as unsaturated', () => {
    const grey = rgbToHsl({ r: 128, g: 128, b: 128 });
    expect(grey.s).toBe(0);
    expect(Math.round(grey.l)).toBe(50);
    expect(hslToRgb({ h: 200, s: 0, l: 50 })).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('wraps hues past the ends of the wheel', () => {
    expect(normaliseHue(-30)).toBe(330);
    expect(normaliseHue(400)).toBe(40);
    expect(normaliseHue(360)).toBe(0);
  });

  it('clamps channels instead of emitting invalid hex', () => {
    expect(rgbToHex({ r: 300, g: -20, b: 12.6 })).toBe('#ff000d');
  });

  it('formats css strings with whole numbers', () => {
    expect(formatRgb({ r: 79.4, g: 70, b: 229 })).toBe('rgb(79, 70, 229)');
    expect(formatHsl({ h: 243.7, s: 75.4, l: 58.6 })).toBe('hsl(244, 75%, 59%)');
  });
});

describe('contrast', () => {
  it('gives black on white the WCAG maximum', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
  });

  it('picks the ink that reads on the swatch', () => {
    expect(readableInk({ r: 255, g: 255, b: 255 })).toBe('#000000');
    expect(readableInk({ r: 10, g: 10, b: 40 })).toBe('#ffffff');
  });
});

describe('mix', () => {
  it('interpolates and clamps the amount', () => {
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 40 }, 0.5)).toEqual({ r: 50, g: 100, b: 20 });
    expect(mix({ r: 10, g: 10, b: 10 }, { r: 200, g: 200, b: 200 }, -1)).toEqual({ r: 10, g: 10, b: 10 });
    expect(mix({ r: 10, g: 10, b: 10 }, { r: 200, g: 200, b: 200 }, 2)).toEqual({ r: 200, g: 200, b: 200 });
  });
});

describe('buildPalette', () => {
  const base = '#3366cc';
  const baseHue = hexToHsl(base)!.h;

  const hues = (harmony: Parameters<typeof buildPalette>[1]) =>
    buildPalette(base, harmony).map((s) => Math.round(s.hsl.h));

  it('puts the complement opposite the base', () => {
    const palette = buildPalette(base, 'complementary');
    expect(palette).toHaveLength(2);
    expect(palette[0].hex).toBe(base);
    expect(Math.round(palette[1].hsl.h)).toBe(Math.round(normaliseHue(baseHue + 180)));
  });

  it('spaces analogous hues 30° apart around the base', () => {
    expect(hues('analogous')).toEqual(
      [-60, -30, 0, 30, 60].map((d) => Math.round(normaliseHue(baseHue + d))),
    );
  });

  it('spaces triadic hues evenly', () => {
    expect(hues('triadic')).toEqual([0, 120, 240].map((d) => Math.round(normaliseHue(baseHue + d))));
  });

  it('builds the tetradic rectangle and the split complement', () => {
    expect(hues('tetradic')).toEqual([0, 60, 180, 240].map((d) => Math.round(normaliseHue(baseHue + d))));
    expect(hues('split-complementary')).toEqual([0, 150, 210].map((d) => Math.round(normaliseHue(baseHue + d))));
  });

  it('keeps one hue and varies lightness for a monochromatic set', () => {
    const palette = buildPalette(base, 'monochromatic');
    expect(palette).toHaveLength(5);
    const lightness = palette.map((s) => s.hsl.l);
    for (let i = 1; i < lightness.length; i += 1) expect(lightness[i]).toBeLessThan(lightness[i - 1]);
    expect(palette[2].hex).toBe(base);
  });

  it('ramps ten steps from tint to shade through the base', () => {
    const ramp = buildPalette(base, 'shades');
    expect(ramp.map((s) => s.key)).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']);
    expect(ramp[5].hex).toBe(base);
    const lightness = ramp.map((s) => s.hsl.l);
    for (let i = 1; i < lightness.length; i += 1) {
      expect(lightness[i], `step ${ramp[i].key} should be darker than ${ramp[i - 1].key}`).toBeLessThan(
        lightness[i - 1],
      );
    }
    expect(lightness[0]).toBeGreaterThan(90);
    expect(lightness[9]).toBeLessThan(25);
  });

  it('refuses a colour it cannot read', () => {
    expect(() => buildPalette('nope', 'triadic')).toThrow(/not a colour/i);
  });
});

describe('exports', () => {
  const palette = buildPalette('#3366cc', 'triadic');

  it('writes CSS custom properties inside :root', () => {
    const css = exportPalette(palette, 'css', 'brand');
    expect(css.startsWith(':root {')).toBe(true);
    expect(css).toContain('  --brand-1: #3366cc;');
    expect(css.trimEnd().endsWith('}')).toBe(true);
  });

  it('writes SCSS variables', () => {
    expect(exportPalette(palette, 'scss', 'brand').split('\n')[0]).toBe('$brand-1: #3366cc;');
  });

  it('writes a Tailwind colour object that parses as JS-ish config', () => {
    const config = exportPalette(palette, 'tailwind', 'brand');
    expect(config).toContain('colors: {');
    expect(config).toContain("brand: {");
    expect(config).toContain("1: '#3366cc',");
  });

  it('writes JSON with every notation', () => {
    const parsed = JSON.parse(exportPalette(palette, 'json', 'brand')) as {
      name: string;
      colors: Array<{ hex: string; rgb: string; hsl: string }>;
    };
    expect(parsed.name).toBe('brand');
    expect(parsed.colors).toHaveLength(3);
    expect(parsed.colors[0].hex).toBe('#3366cc');
    expect(parsed.colors[0].rgb).toBe('rgb(51, 102, 204)');
    expect(parsed.colors[0].hsl).toMatch(/^hsl\(/);
  });

  it('slugifies a messy palette name and falls back when it is empty', () => {
    expect(exportPalette(palette, 'scss', '  My Brand!  ')).toContain('$My-Brand-1:');
    expect(exportPalette(palette, 'scss', '   ')).toContain('$brand-1:');
  });
});
