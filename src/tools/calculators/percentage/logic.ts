/**
 * Percentage arithmetic. Every function returns `null` when the maths is
 * undefined (a division by zero) rather than `Infinity` or `NaN`, so the UI can
 * say why instead of printing a nonsense number.
 */

/** Group the integer part with thin commas: 1234567 → "1,234,567". */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Turn a typed decimal into something `Number` understands. Handles the two
 * shapes people actually paste: "1,234.56" (thousands commas) and "1,5"
 * (comma as the decimal separator). Anything else is left alone so the strict
 * pattern in `parseNumber` can reject it.
 */
export function normalizeDecimal(raw: string): string {
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) return raw.replace(/,/g, '');
  if (/^[+-]?\d*,\d+$/.test(raw)) return raw.replace(',', '.');
  return raw;
}

/** Parse a number as typed. Returns null for empty or malformed input. */
export function parseNumber(text: string): number | null {
  const raw = text.trim().replace(/[\s_]/g, '').replace(/%$/, '');
  if (!raw) return null;
  const cleaned = normalizeDecimal(raw);
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Format for display without depending on the host locale (tests and the UI
 * must agree). `decimals` of `null` picks a sensible precision from magnitude.
 */
export function formatNumber(value: number | null, decimals: number | null = null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (decimals === null && abs > 0 && abs < 1e-6) return value.toExponential(3);
  if (abs >= 1e15) return value.toExponential(4);

  let dp: number;
  if (decimals !== null) dp = decimals;
  else if (Number.isInteger(value)) dp = 0;
  else if (abs >= 1000) dp = 2;
  else if (abs >= 1) dp = 4;
  else dp = 6;

  const fixed = value.toFixed(dp);
  const negative = fixed.startsWith('-');
  const [intPart, fracPart = ''] = (negative ? fixed.slice(1) : fixed).split('.');
  const frac = decimals === null ? fracPart.replace(/0+$/, '') : fracPart;
  const body = group(intPart) + (frac ? `.${frac}` : '');
  // -0 is never a useful thing to show.
  if (negative && /^0(\.0*)?$/.test(body)) return body;
  return (negative ? '-' : '') + body;
}

/** Signed percentage, always with an explicit + or −. */
export function formatSigned(value: number | null, decimals: number | null = null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value > 0) return `+${formatNumber(value, decimals)}`;
  return formatNumber(value, decimals);
}

/** "What is P% of V?" */
export function percentOf(percent: number, value: number): number {
  return (percent / 100) * value;
}

/** "P is what percent of W?" — undefined when the whole is zero. */
export function whatPercent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

/** Percentage change from → to. Undefined when the starting value is zero. */
export function percentChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

/** Add or subtract a percentage of a value from itself. */
export function applyPercent(value: number, percent: number, direction: 'add' | 'subtract'): number {
  const delta = (percent / 100) * value;
  return direction === 'add' ? value + delta : value - delta;
}

/** "R is P% of what?" — undefined when the percentage is zero. */
export function reversePercent(result: number, percent: number): number | null {
  if (percent === 0) return null;
  return result / (percent / 100);
}
