/**
 * DPI / PPI conversions. Everything routes through inches because that is what
 * the unit is defined against; centimetres and millimetres are derived.
 */

export const MM_PER_INCH = 25.4;

export type LengthUnit = 'in' | 'cm' | 'mm';

export const UNIT_LABEL: Record<LengthUnit, string> = { in: 'inches', cm: 'centimetres', mm: 'millimetres' };
export const UNIT_SHORT: Record<LengthUnit, string> = { in: 'in', cm: 'cm', mm: 'mm' };

export function toInches(value: number, unit: LengthUnit): number {
  if (unit === 'in') return value;
  if (unit === 'cm') return (value * 10) / MM_PER_INCH;
  return value / MM_PER_INCH;
}

export function fromInches(inches: number, unit: LengthUnit): number {
  if (unit === 'in') return inches;
  if (unit === 'cm') return (inches * MM_PER_INCH) / 10;
  return inches * MM_PER_INCH;
}

/** Physical length of a pixel run printed at `dpi`. */
export function pixelsToInches(pixels: number, dpi: number): number | null {
  if (!Number.isFinite(pixels) || !Number.isFinite(dpi) || dpi <= 0 || pixels < 0) return null;
  return pixels / dpi;
}

/** Pixels needed to print `inches` at `dpi`. */
export function inchesToPixels(inches: number, dpi: number): number | null {
  if (!Number.isFinite(inches) || !Number.isFinite(dpi) || dpi <= 0 || inches < 0) return null;
  return inches * dpi;
}

/** The resolution you actually get printing `pixels` across `inches`. */
export function dpiFor(pixels: number, inches: number): number | null {
  if (!Number.isFinite(pixels) || !Number.isFinite(inches) || inches <= 0 || pixels <= 0) return null;
  return pixels / inches;
}

export interface ScreenReport {
  ppi: number;
  diagonalPixels: number;
  widthInches: number;
  heightInches: number;
  dotPitchMm: number;
}

/** Real pixel density of a display from its diagonal and resolution. */
export function screenReport(diagonalInches: number, widthPx: number, heightPx: number): ScreenReport | null {
  if (![diagonalInches, widthPx, heightPx].every((n) => Number.isFinite(n) && n > 0)) return null;
  const diagonalPixels = Math.hypot(widthPx, heightPx);
  const ppi = diagonalPixels / diagonalInches;
  return {
    ppi,
    diagonalPixels,
    widthInches: widthPx / ppi,
    heightInches: heightPx / ppi,
    dotPitchMm: MM_PER_INCH / ppi,
  };
}

export interface QualityVerdict {
  label: string;
  tone: 'success' | 'warn' | 'danger';
  note: string;
}

/** How a given print resolution will actually look. */
export function printQuality(dpi: number): QualityVerdict {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    return { label: 'Unknown', tone: 'danger', note: 'Enter a size and a pixel count' };
  }
  if (dpi >= 300) return { label: 'Photo quality', tone: 'success', note: 'Sharp held at arm’s length' };
  if (dpi >= 200) return { label: 'Good', tone: 'success', note: 'Fine for most prints and flyers' };
  if (dpi >= 150) return { label: 'Acceptable', tone: 'warn', note: 'Posters viewed from a step back' };
  if (dpi >= 72) return { label: 'Low', tone: 'warn', note: 'Screen resolution — visibly soft on paper' };
  return { label: 'Too low', tone: 'danger', note: 'Individual pixels will be obvious' };
}

export function parsePositive(text: string): number | null {
  const raw = text.trim().replace(/[\s,_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fixed-decimal display with trailing zeros trimmed and thousands grouped. */
export function fmt(value: number | null, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart = ''] = fixed.split('.');
  const frac = fracPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}
