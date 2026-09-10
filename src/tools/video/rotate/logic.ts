export type Rotation = 0 | 90 | 180 | 270;

export interface Orientation {
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
}

/**
 * The CSS transform that shows what FFmpeg will produce.
 *
 * `build_video_filters` in src-tauri/src/cmd/media.rs applies the transpose
 * first and the flips after it, so the picture ends up as flip(rotate(frame)).
 * CSS composes right-to-left — the rightmost function touches the pixels first —
 * which is why the rotate is written last.
 */
export function cssTransform({ rotate, flipH, flipV }: Orientation): string {
  const parts: string[] = [];
  if (flipH) parts.push('scaleX(-1)');
  if (flipV) parts.push('scaleY(-1)');
  if (rotate) parts.push(`rotate(${rotate}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

export function isQuarterTurn(rotate: Rotation): boolean {
  return rotate === 90 || rotate === 270;
}

/** Width and height after the rotation. Flips never change the dimensions. */
export function resultDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
  rotate: Rotation,
): { width: number; height: number } | null {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return isQuarterTurn(rotate) ? { width: h, height: w } : { width: w, height: h };
}

/**
 * How much to shrink the preview frame so that it still fits its box *after*
 * the rotation — a quarter turn swaps which side has to fit which. Never scales
 * above 1, because upscaling the preview JPEG only makes it blurrier.
 */
export function fitScale(
  natural: { width: number; height: number },
  box: { width: number; height: number },
  quarterTurn: boolean,
): number | null {
  const { width: nw, height: nh } = natural;
  const { width: bw, height: bh } = box;
  if (![nw, nh, bw, bh].every((n) => Number.isFinite(n) && n > 0)) return null;
  const scale = quarterTurn ? Math.min(bw / nh, bh / nw) : Math.min(bw / nw, bh / nh);
  return Math.min(1, scale);
}

export function orientationLabel({ rotate, flipH, flipV }: Orientation): string {
  const parts: string[] = [];
  if (rotate === 90) parts.push('90° clockwise');
  else if (rotate === 180) parts.push('180°');
  else if (rotate === 270) parts.push('90° counter-clockwise');
  if (flipH) parts.push('mirrored horizontally');
  if (flipV) parts.push('mirrored vertically');
  if (parts.length === 0) return 'Unchanged';
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase());
}

export function isIdentity({ rotate, flipH, flipV }: Orientation): boolean {
  return rotate === 0 && !flipH && !flipV;
}

/** A sensible frame to preview: a little way in, so title cards are skipped. */
export function previewTimestamp(duration: number | null | undefined): number {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.min(d / 2, 3);
}
