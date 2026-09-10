/**
 * Aspect-ratio maths. Ratios are carried as a decimal (width ÷ height) because
 * that is the only form that survives arbitrary sizes; integer pairs are
 * recovered on demand with a gcd or, for non-integer sizes, a continued-fraction
 * approximation.
 */

export interface Ratio {
  w: number;
  h: number;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

/**
 * The simplest fraction within `maxDenominator` that approximates `decimal`,
 * found by walking the Stern–Brocot tree. 1.7778 → 16:9, not 8889:5000.
 */
export function approximateRatio(decimal: number, maxDenominator = 500): Ratio | null {
  if (!Number.isFinite(decimal) || decimal <= 0) return null;
  let lowN = 0;
  let lowD = 1;
  let highN = 1;
  let highD = 0;
  for (let guard = 0; guard < 200_000; guard++) {
    const midN = lowN + highN;
    const midD = lowD + highD;
    if (midD > maxDenominator) break;
    const cmp = decimal * midD - midN;
    if (cmp > 0) {
      lowN = midN;
      lowD = midD;
    } else if (cmp < 0) {
      highN = midN;
      highD = midD;
    } else {
      return { w: midN, h: midD };
    }
  }
  if (highD === 0) return { w: lowN, h: lowD };
  if (lowD === 0 || lowN === 0) return { w: highN, h: highD };
  const lowErr = Math.abs(decimal - lowN / lowD);
  const highErr = Math.abs(decimal - highN / highD);
  return lowErr <= highErr ? { w: lowN, h: lowD } : { w: highN, h: highD };
}

/** Reduce a pixel size to its integer ratio. 1920×1080 → 16:9. */
export function simplify(width: number, height: number): Ratio | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (Number.isInteger(width) && Number.isInteger(height)) {
    const d = gcd(width, height);
    return { w: width / d, h: height / d };
  }
  return approximateRatio(width / height);
}

export interface NamedRatio {
  label: string;
  w: number;
  h: number;
  note: string;
}

/** Ratios worth recognising by name when a size lands on one. */
export const NAMED_RATIOS: NamedRatio[] = [
  { label: '1:1', w: 1, h: 1, note: 'Square' },
  { label: '5:4', w: 5, h: 4, note: 'Large format print' },
  { label: '4:3', w: 4, h: 3, note: 'Classic screen, iPad' },
  { label: '3:2', w: 3, h: 2, note: '35 mm photo, DSLR' },
  { label: '16:10', w: 16, h: 10, note: 'Desktop, MacBook' },
  { label: '5:3', w: 5, h: 3, note: 'Super 16' },
  { label: '16:9', w: 16, h: 9, note: 'HD widescreen' },
  { label: '1.85:1', w: 37, h: 20, note: 'Cinema flat' },
  { label: '2:1', w: 2, h: 1, note: 'Univisium' },
  { label: '21:9', w: 21, h: 9, note: 'Ultrawide (nominal)' },
  { label: '64:27', w: 64, h: 27, note: 'Ultrawide 2560×1080' },
  { label: '43:18', w: 43, h: 18, note: 'Ultrawide 3440×1440' },
  { label: '2.39:1', w: 239, h: 100, note: 'Anamorphic scope' },
  { label: '3:4', w: 3, h: 4, note: 'Portrait screen' },
  { label: '2:3', w: 2, h: 3, note: 'Portrait photo' },
  { label: '4:5', w: 4, h: 5, note: 'Instagram portrait' },
  { label: '9:16', w: 9, h: 16, note: 'Vertical video, Stories' },
];

/** The named ratio a decimal lands on, within a relative tolerance. */
export function namedFor(decimal: number, tolerance = 0.005): NamedRatio | null {
  if (!Number.isFinite(decimal) || decimal <= 0) return null;
  let best: NamedRatio | null = null;
  let bestErr = Infinity;
  for (const entry of NAMED_RATIOS) {
    const err = Math.abs(entry.w / entry.h - decimal) / decimal;
    if (err <= tolerance && err < bestErr) {
      best = entry;
      bestErr = err;
    }
  }
  return best;
}

/** Parse "16:9", "16/9", "16x9", "1.85" or "1.85:1" into width ÷ height. */
export function parseRatioText(text: string): number | null {
  const raw = text.trim().replace(/\s/g, '');
  if (!raw) return null;
  const pair = raw.match(/^(\d*\.?\d+)[:/x×](\d*\.?\d+)$/i);
  if (pair) {
    const a = Number(pair[1]);
    const b = Number(pair[2]);
    if (!(a > 0) || !(b > 0)) return null;
    return a / b;
  }
  if (/^\d*\.?\d+$/.test(raw)) {
    const n = Number(raw);
    return n > 0 ? n : null;
  }
  return null;
}

export function parsePositive(text: string): number | null {
  const raw = text.trim().replace(/[\s,_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ratioLabel(r: Ratio | null): string {
  if (!r) return '—';
  return `${r.w}:${r.h}`;
}

/** "1.7778" — trailing zeros trimmed, never in exponent form for sane ratios. */
export function decimalLabel(decimal: number | null, places = 4): string {
  if (decimal === null || !Number.isFinite(decimal)) return '—';
  const fixed = decimal.toFixed(places);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

export interface FitResult {
  width: number;
  height: number;
  /** Unrounded scale factor applied to the source. */
  scale: number;
}

/** Which way `snapTo` breaks a tie with the step grid. */
export type SnapDirection = 'nearest' | 'down' | 'up';

/**
 * Snap to a multiple of `step`, never below one step. The direction matters:
 * a contained size must never grow past the box and a covering one must never
 * fall short of it, so rounding to the nearest multiple is only safe when the
 * caller does not care which side of the box it lands on.
 */
export function snapTo(value: number, step: number, direction: SnapDirection = 'nearest'): number {
  if (!Number.isFinite(value)) return Math.max(1, step);
  // Float scaling leaves values like 1439.9999999999998 that must not fall a
  // whole step short, so ties are nudged back onto the grid before rounding.
  const epsilon = 1e-9;
  if (step <= 1) {
    const rounded =
      direction === 'down'
        ? Math.floor(value + epsilon)
        : direction === 'up'
          ? Math.ceil(value - epsilon)
          : Math.round(value);
    return Math.max(1, rounded);
  }
  const units = value / step;
  const snapped =
    direction === 'down'
      ? Math.floor(units + epsilon)
      : direction === 'up'
        ? Math.ceil(units - epsilon)
        : Math.round(units);
  return Math.max(step, snapped * step);
}

/**
 * Scale a source size into a box. `contain` fits it entirely (letterbox bars);
 * `cover` fills the box (edges are cropped).
 *
 * With a rounding step the two modes snap in opposite directions so that each
 * keeps its promise: contain rounds down and stays inside the box, cover rounds
 * up and still covers it. At a step of one pixel the nearest integer is already
 * inside an integer box on both axes, so that case keeps rounding to nearest
 * and reports the closest whole pixel. The one exception is a box smaller than
 * a single step, where no multiple of the step fits and one step is returned
 * instead of a useless zero.
 */
export function fitBox(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
  mode: 'contain' | 'cover',
  step = 1,
): FitResult | null {
  if (![srcW, srcH, boxW, boxH].every((n) => Number.isFinite(n) && n > 0)) return null;
  const sx = boxW / srcW;
  const sy = boxH / srcH;
  const scale = mode === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
  const direction: SnapDirection = step <= 1 ? 'nearest' : mode === 'contain' ? 'down' : 'up';
  return {
    width: snapTo(srcW * scale, step, direction),
    height: snapTo(srcH * scale, step, direction),
    scale,
  };
}

/** Bars left over around a contained image, per side, in pixels. */
export function letterbox(fit: FitResult, boxW: number, boxH: number): { x: number; y: number } {
  return { x: Math.max(0, (boxW - fit.width) / 2), y: Math.max(0, (boxH - fit.height) / 2) };
}

/** Pixels lost from each side when a covered image is cropped to the box. */
export function cropOverflow(fit: FitResult, boxW: number, boxH: number): { x: number; y: number } {
  return { x: Math.max(0, (fit.width - boxW) / 2), y: Math.max(0, (fit.height - boxH) / 2) };
}

export function orientation(decimal: number | null): 'Landscape' | 'Portrait' | 'Square' | '—' {
  if (decimal === null || !Number.isFinite(decimal)) return '—';
  if (Math.abs(decimal - 1) < 1e-9) return 'Square';
  return decimal > 1 ? 'Landscape' : 'Portrait';
}
