/** Frame maths for the ICO builder. */

/** Every size a .ico frame is normally offered at. 256 is the format's ceiling. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

export const DEFAULT_SIZES = [16, 32, 48, 256];

/** Sorted, de-duplicated and inside the range the ICO container allows. */
export function normalizeSizes(sizes: number[]): number[] {
  const clean = sizes
    .map((n) => Math.round(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 256);
  return [...new Set(clean)].sort((a, b) => a - b);
}

export function toggleSize(sizes: number[], size: number): number[] {
  return normalizeSizes(sizes.includes(size) ? sizes.filter((n) => n !== size) : [...sizes, size]);
}

export function isSquare(width: number, height: number): boolean {
  return width > 0 && width === height;
}

/**
 * Side length for the square pre-pass: the centre crop that loses the least
 * detail is the shorter edge, capped so a huge source does not become a huge
 * intermediate.
 */
export function squareSourceSize(width: number, height: number, cap = 2048): number {
  const shorter = Math.min(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  return Math.max(16, Math.min(shorter, cap));
}

export function frameSummary(sizes: number[]): string {
  const clean = normalizeSizes(sizes);
  if (clean.length === 0) return 'No frames selected';
  return `${clean.length} frame${clean.length === 1 ? '' : 's'} · ${clean.join(', ')} px`;
}

/** How the source maps into a square frame — mirrors what the backend does. */
export function fitLabel(square: boolean, sourceIsSquare: boolean): string {
  if (sourceIsSquare) return 'Every frame is an exact square scale of the source.';
  return square
    ? 'The centre square of the source is cropped, then scaled into every frame.'
    : 'The source is stretched into each square frame, so it will look squashed.';
}
