/**
 * Random colours with a constraint. Each mode is a box in HSL space: "pastel"
 * is low saturation and high lightness, "vivid" is the opposite corner, and so
 * on — which is why the generator works in HSL and converts out to sRGB.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface ColorSpec {
  hex: string;
  rgb: Rgb;
  hsl: Hsl;
}

export type Constraint = 'any' | 'pastel' | 'vivid' | 'dark' | 'light' | 'hue';

export interface HueRange {
  from: number;
  to: number;
}

/** Random float in [0, 1) from the platform CSPRNG. */
export const random = (): number => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296;
};

export type Random = () => number;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normaliseHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
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

export function formatRgb({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function formatHsl({ h, s, l }: Hsl): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = clamp(value, 0, 255) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function readableInk(rgb: Rgb): '#000000' | '#ffffff' {
  return relativeLuminance(rgb) > 0.35 ? '#000000' : '#ffffff';
}

interface Box {
  saturation: [number, number];
  lightness: [number, number];
}

export const CONSTRAINTS: Array<{ value: Constraint; label: string; blurb: string }> = [
  { value: 'any', label: 'Anything', blurb: 'The whole wheel, any saturation, any lightness' },
  { value: 'pastel', label: 'Pastel', blurb: 'Soft and washed out — light backgrounds, tags' },
  { value: 'vivid', label: 'Vivid', blurb: 'Saturated and punchy — accents, charts' },
  { value: 'dark', label: 'Dark', blurb: 'Deep colours that white text sits on happily' },
  { value: 'light', label: 'Light', blurb: 'Barely-there tints for surfaces' },
  { value: 'hue', label: 'Hue range', blurb: 'Anything between two points on the wheel' },
];

const BOXES: Record<Exclude<Constraint, 'hue'>, Box> = {
  any: { saturation: [0, 100], lightness: [5, 95] },
  pastel: { saturation: [25, 60], lightness: [78, 90] },
  vivid: { saturation: [85, 100], lightness: [45, 60] },
  dark: { saturation: [30, 90], lightness: [10, 25] },
  light: { saturation: [15, 70], lightness: [82, 94] },
};

const HUE_BOX: Box = { saturation: [45, 90], lightness: [35, 70] };

function between([min, max]: [number, number], rand: Random): number {
  return min + rand() * (max - min);
}

/**
 * Hue inside the range, going clockwise from `from` to `to` and wrapping past
 * 360. The span is measured before either end is put back on the wheel, so
 * 0° → 360° stays the whole wheel instead of collapsing onto red.
 */
export function hueInRange(range: HueRange, rand: Random): number {
  const from = normaliseHue(range.from);
  const sweep = range.to - range.from;
  const span = sweep >= 360 ? 360 : ((sweep % 360) + 360) % 360;
  return normaliseHue(from + rand() * span);
}

export function makeColor(
  constraint: Constraint,
  hueRange: HueRange = { from: 0, to: 360 },
  rand: Random = random,
): ColorSpec {
  const box = constraint === 'hue' ? HUE_BOX : BOXES[constraint];
  const hsl: Hsl = {
    h: constraint === 'hue' ? hueInRange(hueRange, rand) : rand() * 360,
    s: between(box.saturation, rand),
    l: between(box.lightness, rand),
  };
  const rgb = hslToRgb(hsl);
  return { hex: rgbToHex(rgb), rgb, hsl: rgbToHsl(rgb) };
}

/** Bounds a constraint promises, so the UI can describe what it is about to do. */
export function constraintBounds(constraint: Constraint): Box {
  return constraint === 'hue' ? HUE_BOX : BOXES[constraint];
}
