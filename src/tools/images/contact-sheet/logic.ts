export interface SheetOptions {
  count: number;
  columns: number;
  thumbSize: number;
  gap: number;
  labels: boolean;
}

export interface SheetLayout {
  /** The values the backend will actually use, after clamping. */
  columns: number;
  thumbSize: number;
  gap: number;
  labelHeight: number;
  rows: number;
  width: number;
  height: number;
}

/** A sheet past roughly this many pixels takes a long time and a lot of memory. */
export const PIXEL_WARNING_THRESHOLD = 80_000_000;

/**
 * The colours `parse_color` in Rust accepts: #RGB, #RGBA, #RRGGBB or #RRGGBBAA,
 * with or without the hash. Checking here means a typo is caught before a job
 * starts rather than after it fails.
 */
export function isValidColor(value: string): boolean {
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-f]+$/i.test(hex) && [3, 4, 6, 8].includes(hex.length);
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));

/**
 * Mirrors the geometry in `contact_sheet` (src-tauri/src/cmd/images.rs) so the
 * final size can be shown before a single pixel is drawn — including the same
 * clamps, so the preview never promises a size the backend will not produce.
 */
export function sheetLayout({ count, columns, thumbSize, gap, labels }: SheetOptions): SheetLayout {
  const cols = clamp(columns, 1, 20);
  const thumb = clamp(thumbSize, 48, 1024);
  const gutter = clamp(gap, 0, 200);
  const labelHeight = labels ? Math.max(Math.floor(thumb / 12), 12) : 0;
  const items = Math.max(0, Math.floor(count));
  const rows = Math.ceil(items / cols);
  return {
    columns: cols,
    thumbSize: thumb,
    gap: gutter,
    labelHeight,
    rows,
    width: Math.max(1, cols * thumb + (cols + 1) * gutter),
    height: Math.max(1, rows * (thumb + labelHeight) + (rows + 1) * gutter),
  };
}
