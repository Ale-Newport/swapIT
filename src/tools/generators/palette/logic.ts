/**
 * Colour maths and harmony rules for the palette generator. Everything works in
 * HSL because that is where "rotate the hue by 120°" and "make it 20% lighter"
 * are one line each; the results are converted back to sRGB for display.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

export type Harmony =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'tetradic'
  | 'split-complementary'
  | 'monochromatic'
  | 'shades';

export interface Swatch {
  /** Stable key used in every export, e.g. "500" or "2". */
  key: string;
  /** What this colour is doing in the palette. */
  label: string;
  hex: string;
  rgb: Rgb;
  hsl: Hsl;
}

export const HARMONIES: Array<{ value: Harmony; label: string; blurb: string }> = [
  { value: 'complementary', label: 'Complementary', blurb: 'The opposite hue — maximum contrast, two colours' },
  { value: 'analogous', label: 'Analogous', blurb: 'Neighbouring hues — calm and cohesive' },
  { value: 'triadic', label: 'Triadic', blurb: 'Three hues evenly spaced around the wheel' },
  { value: 'tetradic', label: 'Tetradic', blurb: 'Two complementary pairs — rich, needs a dominant colour' },
  { value: 'split-complementary', label: 'Split complementary', blurb: 'The opposite hue, split in two — softer contrast' },
  { value: 'monochromatic', label: 'Monochromatic', blurb: 'One hue at five lightnesses' },
  { value: 'shades', label: 'Shades and tints', blurb: 'A 10-step ramp through the base colour' },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normaliseHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** Accepts `#abc`, `abc`, `#aabbcc` and `aabbcc`. Returns null for anything else. */
export function parseHex(input: string): Rgb | null {
  const raw = input.trim().replace(/^#/, '');
  const hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
  }
  return { h: normaliseHue(h), s: clamp(s * 100, 0, 100), l: clamp(l * 100, 0, 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = normaliseHue(h) / 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  if (sat === 0) {
    const value = Math.round(light * 255);
    return { r: value, g: value, b: value };
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  };
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}

export function formatRgb({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function formatHsl({ h, s, l }: Hsl): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/** WCAG relative luminance, used to decide whether a swatch needs light text. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = clamp(value, 0, 255) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** Black or white text, whichever reads better on this background. */
export function readableInk(rgb: Rgb): '#000000' | '#ffffff' {
  return contrastRatio(rgb, { r: 0, g: 0, b: 0 }) >= contrastRatio(rgb, { r: 255, g: 255, b: 255 })
    ? '#000000'
    : '#ffffff';
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function swatch(key: string, label: string, hsl: Hsl): Swatch {
  const rgb = hslToRgb(hsl);
  return { key, label, hex: rgbToHex(rgb), rgb, hsl: rgbToHsl(rgb) };
}

function fromRgb(key: string, label: string, rgb: Rgb): Swatch {
  return { key, label, hex: rgbToHex(rgb), rgb, hsl: rgbToHsl(rgb) };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 17, g: 17, b: 17 };

/** The 10-step ramp: five tints towards white, the base, four shades towards black. */
export const RAMP_STEPS: Array<{ key: string; mixWith: 'white' | 'black' | 'base'; amount: number }> = [
  { key: '50', mixWith: 'white', amount: 0.95 },
  { key: '100', mixWith: 'white', amount: 0.88 },
  { key: '200', mixWith: 'white', amount: 0.74 },
  { key: '300', mixWith: 'white', amount: 0.56 },
  { key: '400', mixWith: 'white', amount: 0.3 },
  { key: '500', mixWith: 'base', amount: 0 },
  { key: '600', mixWith: 'black', amount: 0.18 },
  { key: '700', mixWith: 'black', amount: 0.38 },
  { key: '800', mixWith: 'black', amount: 0.58 },
  { key: '900', mixWith: 'black', amount: 0.76 },
];

export function buildPalette(baseHex: string, harmony: Harmony): Swatch[] {
  const rgb = parseHex(baseHex);
  if (!rgb) {
    throw new Error(`"${baseHex}" is not a colour. Use a hex value such as #4f46e5.`);
  }
  const base = rgbToHsl(rgb);
  const rotate = (degrees: number): Hsl => ({ ...base, h: normaliseHue(base.h + degrees) });

  switch (harmony) {
    case 'complementary':
      return [swatch('1', 'Base', base), swatch('2', 'Complement', rotate(180))];

    case 'analogous':
      return [
        swatch('1', '−60°', rotate(-60)),
        swatch('2', '−30°', rotate(-30)),
        swatch('3', 'Base', base),
        swatch('4', '+30°', rotate(30)),
        swatch('5', '+60°', rotate(60)),
      ];

    case 'triadic':
      return [swatch('1', 'Base', base), swatch('2', '+120°', rotate(120)), swatch('3', '+240°', rotate(240))];

    case 'tetradic':
      return [
        swatch('1', 'Base', base),
        swatch('2', '+60°', rotate(60)),
        swatch('3', 'Complement', rotate(180)),
        swatch('4', '+240°', rotate(240)),
      ];

    case 'split-complementary':
      return [swatch('1', 'Base', base), swatch('2', '+150°', rotate(150)), swatch('3', '+210°', rotate(210))];

    case 'monochromatic': {
      // The ramp reaches 30 points of lightness either side of the base, then
      // spreads the in-between steps across whatever headroom is left. Clamping
      // each step on its own would let a "darker" step overtake a lighter one
      // once the base sits near black or white.
      const top = Math.min(100, base.l + 30);
      const bottom = Math.max(0, base.l - 30);
      const lightnesses = [top, (top + base.l) / 2, base.l, (base.l + bottom) / 2, bottom];
      return lightnesses.map((l, i) =>
        swatch(String(i + 1), i === 2 ? 'Base' : `${Math.round(l)}% light`, { ...base, l }),
      );
    }

    case 'shades':
      return RAMP_STEPS.map((step) =>
        fromRgb(
          step.key,
          step.mixWith === 'base' ? 'Base' : step.mixWith === 'white' ? 'Tint' : 'Shade',
          step.mixWith === 'base' ? rgb : mix(rgb, step.mixWith === 'white' ? WHITE : BLACK, step.amount),
        ),
      );
  }
}

// ------------------------------------------------------------------ exports

export function toCssVariables(swatches: Swatch[], name: string): string {
  const lines = swatches.map((s) => `  --${name}-${s.key}: ${s.hex};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

export function toScss(swatches: Swatch[], name: string): string {
  return swatches.map((s) => `$${name}-${s.key}: ${s.hex};`).join('\n');
}

export function toTailwind(swatches: Swatch[], name: string): string {
  const entries = swatches.map((s) => `        ${s.key}: '${s.hex}',`);
  return [
    'module.exports = {',
    '  theme: {',
    '    extend: {',
    '      colors: {',
    `        ${name}: {`,
    ...entries.map((line) => `  ${line}`),
    '        },',
    '      },',
    '    },',
    '  },',
    '};',
  ].join('\n');
}

export function toJson(swatches: Swatch[], name: string): string {
  return JSON.stringify(
    {
      name,
      colors: swatches.map((s) => ({
        key: s.key,
        role: s.label,
        hex: s.hex,
        rgb: formatRgb(s.rgb),
        hsl: formatHsl(s.hsl),
      })),
    },
    null,
    2,
  );
}

export type ExportFormat = 'css' | 'scss' | 'tailwind' | 'json';

export function exportPalette(swatches: Swatch[], format: ExportFormat, name: string): string {
  const safe = name.trim().replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'brand';
  switch (format) {
    case 'css':
      return toCssVariables(swatches, safe);
    case 'scss':
      return toScss(swatches, safe);
    case 'tailwind':
      return toTailwind(swatches, safe);
    case 'json':
      return toJson(swatches, safe);
  }
}
