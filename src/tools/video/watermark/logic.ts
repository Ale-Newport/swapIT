import type { CSSProperties } from 'react';

/**
 * The positions `overlay_expr` in src-tauri/src/cmd/media.rs understands. There
 * is deliberately no middle-left or middle-right: the backend has no expression
 * for them, so the grid leaves those two cells empty rather than offering a
 * button that would silently land bottom-right.
 */
export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/** Row-major 3×3 layout; `null` is a cell the backend cannot express. */
export const POSITION_GRID: Array<WatermarkPosition | null> = [
  'top-left',
  'top-center',
  'top-right',
  null,
  'center',
  null,
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export const POSITION_LABELS: Record<WatermarkPosition, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  center: 'Centre',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
};

/** FFmpeg's drawtext branch hard-codes a 24 px inset, whatever the margin says. */
export const TEXT_MARGIN = 24;
/** …and a font size of height/22, with an 8 px box border. */
export const TEXT_FONT_DIVISOR = 22;
export const TEXT_BOX_PADDING = 8;

export type WatermarkMode = 'logo' | 'text';

/**
 * Where the overlay sits inside the preview frame, in the frame's own pixels.
 * Mirrors `overlay_expr`: margins are measured from the edges, centres are
 * true centres.
 */
export function overlayStyle(position: WatermarkPosition, margin: number): CSSProperties {
  const m = `${margin}px`;
  switch (position) {
    case 'top-left':
      return { top: m, left: m };
    case 'top-center':
      return { top: m, left: '50%', transform: 'translateX(-50%)' };
    case 'top-right':
      return { top: m, right: m };
    case 'center':
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'bottom-left':
      return { bottom: m, left: m };
    case 'bottom-center':
      return { bottom: m, left: '50%', transform: 'translateX(-50%)' };
    case 'bottom-right':
    default:
      return { bottom: m, right: m };
  }
}

/**
 * The preview frame is a shrunken copy of the video, so a margin expressed in
 * video pixels has to shrink with it. Falls back to 1:1 when the real width is
 * unknown, which is the least surprising thing to draw.
 */
export function previewScaleFactor(displayWidth: number, videoWidth: number | null | undefined): number {
  const d = Number(displayWidth);
  const v = Number(videoWidth);
  if (!Number.isFinite(d) || d <= 0) return 0;
  if (!Number.isFinite(v) || v <= 0) return 1;
  return d / v;
}

/** The range `MediaWatermark.scale` is clamped to in src-tauri/src/cmd/media.rs. */
function clampScale(scale: number): number {
  return Math.min(1, Math.max(0.02, Number(scale) || 0));
}

/**
 * How wide the burned-in logo comes out, in video pixels.
 *
 * The filtergraph is `[1:v]…,scale=iw*{scale}:-1[wm]`, and that `scale` filter
 * sits inside the *logo's* chain — so `iw` is the logo's own width, never the
 * frame's. A 500 px logo at 0.2 is always 100 px wide, on a 4K clip and on a
 * 480p one alike.
 */
export function burnedLogoWidthPx(scale: number, logoNaturalWidth: number): number {
  const w = Number(logoNaturalWidth);
  if (!Number.isFinite(w) || w <= 0) return 0;
  return Math.max(1, Math.round(w * clampScale(scale)));
}

/**
 * The same mark measured in preview pixels: video pixels shrunk by the factor
 * the preview frame is drawn at. Zero whenever a piece is still unknown, which
 * is the caller's cue not to draw the overlay yet.
 */
export function logoWidthPx(scale: number, logoNaturalWidth: number, factor: number): number {
  const f = Number(factor);
  const w = burnedLogoWidthPx(scale, logoNaturalWidth);
  if (w <= 0 || !Number.isFinite(f) || f <= 0) return 0;
  return Math.max(1, Math.round(w * f));
}

/**
 * What share of the frame width that mark covers — the figure the "% of the
 * logo" slider cannot tell you on its own. Null when either width is unknown.
 */
export function frameCoverage(
  scale: number,
  logoNaturalWidth: number,
  videoWidth: number | null | undefined,
): number | null {
  const v = Number(videoWidth);
  const w = burnedLogoWidthPx(scale, logoNaturalWidth);
  if (w <= 0 || !Number.isFinite(v) || v <= 0) return null;
  return w / v;
}

export function textFontPx(displayHeight: number): number {
  const h = Number(displayHeight);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return h / TEXT_FONT_DIVISOR;
}

export interface WatermarkOps {
  logo?: string;
  text?: string;
  position: WatermarkPosition;
  opacity: number;
  margin: number;
  scale: number;
}

/**
 * Build the MediaWatermark payload. The backend prefers a logo whenever one is
 * present, so exactly one of `logo`/`text` is ever sent.
 */
export function buildWatermarkOps(input: {
  mode: WatermarkMode;
  logo: string | null;
  text: string;
  position: WatermarkPosition;
  opacity: number;
  margin: number;
  scale: number;
}): WatermarkOps {
  const base = {
    position: input.position,
    opacity: Math.min(1, Math.max(0, input.opacity)),
    margin: Math.max(0, Math.round(input.margin)),
    scale: clampScale(input.scale),
  };
  if (input.mode === 'logo') {
    return { ...base, logo: input.logo ?? undefined };
  }
  // Text is drawn at a fixed inset and a fixed size, so the payload carries the
  // backend's own constants rather than controls the user never saw.
  return { ...base, text: input.text.trim(), margin: TEXT_MARGIN };
}

/** A sentence naming what is missing, or null when the settings are usable. */
export function validateWatermark(mode: WatermarkMode, logo: string | null, text: string): string | null {
  if (mode === 'logo' && !logo) return 'Choose a PNG or JPG to use as the watermark.';
  if (mode === 'text' && !text.trim()) return 'Type the text you want burned into the video.';
  return null;
}
