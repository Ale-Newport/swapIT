/** Colour maths for the eyedropper. Pure, so it can be tested without a canvas. */

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

function clampByte(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function toHex(rgb: Rgb): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((n) => clampByte(n).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb | null {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = clampByte(rgb.r) / 255;
  const g = clampByte(rgb.g) / 255;
  const b = clampByte(rgb.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

export function formatRgb(rgb: Rgb): string {
  return `rgb(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)})`;
}

export function formatHsl(hsl: Hsl): string {
  return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
}

/** WCAG relative luminance, used to decide what colour of text a swatch can carry. */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (value: number): number => {
    const c = clampByte(value) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** The hex of the text colour that stays readable on top of `rgb`. */
export function readableInk(rgb: Rgb): string {
  return contrastRatio(rgb, BLACK) >= contrastRatio(rgb, WHITE) ? '#000000' : '#FFFFFF';
}

/** Newest first, no duplicates, capped — the recent-samples strip. */
export function pushRecent(list: Rgb[], color: Rgb, limit = 12): Rgb[] {
  const hex = toHex(color);
  const rest = list.filter((c) => toHex(c) !== hex);
  return [color, ...rest].slice(0, limit);
}
