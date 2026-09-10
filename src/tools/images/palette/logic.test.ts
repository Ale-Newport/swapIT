import { describe, it, expect } from 'vitest';
import {
  allHex,
  bandWidths,
  exportExtension,
  exportPalette,
  percentLabel,
  rgbString,
  toCssVariables,
  toJson,
  toPlainList,
  toTailwind,
  tokenName,
  type PaletteColor,
} from './logic';

const palette: PaletteColor[] = [
  { hex: '#1B2A41', rgb: [27, 42, 65], population: 620, percentage: 62.0 },
  { hex: '#CCC9DC', rgb: [204, 201, 220], population: 300, percentage: 30.0 },
  { hex: '#FF6B35', rgb: [255, 107, 53], population: 80, percentage: 8.0 },
];

describe('labels', () => {
  it('drops decimals on large shares and keeps them on small ones', () => {
    expect(percentLabel(palette[0])).toBe('62%');
    expect(percentLabel({ ...palette[0], percentage: 4.25 })).toBe('4.3%');
    expect(percentLabel({ ...palette[0], percentage: 0.043 })).toBe('0.04%');
  });

  it('formats rgb the way CSS expects it', () => {
    expect(rgbString(palette[2])).toBe('rgb(255, 107, 53)');
  });

  it('numbers tokens from one', () => {
    expect(tokenName(0)).toBe('color-1');
    expect(tokenName(4, 'brand')).toBe('brand-5');
  });
});

describe('exports', () => {
  it('writes CSS custom properties with the share as a comment', () => {
    expect(toCssVariables(palette)).toBe(
      [
        ':root {',
        '  --color-1: #1b2a41; /* 62% */',
        '  --color-2: #ccc9dc; /* 30% */',
        '  --color-3: #ff6b35; /* 8.0% */',
        '}',
      ].join('\n'),
    );
  });

  it('writes a Tailwind colour object that can be pasted into a config', () => {
    const out = toTailwind(palette, 'brand');
    expect(out).toContain('        brand: {');
    expect(out).toContain("          '1': '#1b2a41',");
    expect(out).toContain("          '3': '#ff6b35',");
    expect(out.trimEnd().endsWith('};')).toBe(true);
    // Braces have to balance or the config will not parse.
    expect(out.split('{').length).toBe(out.split('}').length);
  });

  it('writes JSON with rounded shares', () => {
    const parsed = JSON.parse(toJson(palette)) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ name: 'color-1', hex: '#1b2a41', rgb: [27, 42, 65], share: 62 });
  });

  it('writes one upper-case hex per line', () => {
    expect(toPlainList(palette)).toBe('#1B2A41\n#CCC9DC\n#FF6B35');
  });

  it('joins every hex for the copy-all button', () => {
    expect(allHex(palette)).toBe('#1B2A41, #CCC9DC, #FF6B35');
  });

  it('routes each format to its own body and extension', () => {
    expect(exportPalette(palette, 'list')).toBe(toPlainList(palette));
    expect(exportPalette(palette, 'css')).toBe(toCssVariables(palette));
    expect(exportExtension('css')).toBe('css');
    expect(exportExtension('tailwind')).toBe('js');
    expect(exportExtension('json')).toBe('json');
    expect(exportExtension('list')).toBe('txt');
  });

  it('survives an empty palette without emitting stray lines', () => {
    expect(toCssVariables([])).toBe(':root {\n\n}');
    expect(toTailwind([])).not.toContain("'1'");
    expect(toPlainList([])).toBe('');
  });
});

describe('bandWidths', () => {
  it('adds up to a full band', () => {
    const widths = bandWidths(palette);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it('keeps a sliver visible for colours below the floor', () => {
    const tiny: PaletteColor[] = [
      { hex: '#000000', rgb: [0, 0, 0], population: 999, percentage: 99.9 },
      { hex: '#FFFFFF', rgb: [255, 255, 255], population: 1, percentage: 0.1 },
    ];
    const widths = bandWidths(tiny, 4);
    expect(widths[1]).toBeGreaterThan(3);
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  it('returns nothing for an empty palette', () => {
    expect(bandWidths([])).toEqual([]);
  });
});
