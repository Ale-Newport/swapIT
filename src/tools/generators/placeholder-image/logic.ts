/**
 * Placeholder images, drawn on this machine with canvas. No request goes out to
 * a placeholder service, which is the point: the mockup works offline and no
 * one learns what you are building.
 */

export type Overlay = 'none' | 'cross' | 'grid';

export interface PlaceholderSpec {
  width: number;
  height: number;
  background: string;
  foreground: string;
  /** Empty falls back to "1200 × 630". */
  label: string;
  /** 0 means "work it out from the size". */
  fontSize: number;
  overlay: Overlay;
  gridSize: number;
}

export const PRESETS: Array<{ label: string; width: number; height: number; hint: string }> = [
  { label: 'OG image', width: 1200, height: 630, hint: 'Link previews on social and chat' },
  { label: '16:9 HD', width: 1920, height: 1080, hint: 'Slides and hero images' },
  { label: '720p', width: 1280, height: 720, hint: 'Video thumbnails' },
  { label: 'Square', width: 1080, height: 1080, hint: 'Instagram and avatars' },
  { label: 'Portrait', width: 1080, height: 1350, hint: 'Feed portrait' },
  { label: 'Thumb', width: 400, height: 400, hint: 'Small square tile' },
  { label: 'Banner', width: 728, height: 90, hint: 'Leaderboard ad slot' },
  { label: 'Box', width: 300, height: 250, hint: 'Medium rectangle ad slot' },
];

export const MAX_SIDE = 8000;

export function clampSide(value: number): number {
  return Math.max(1, Math.min(MAX_SIDE, Math.round(value) || 1));
}

/** The dimensions, in the multiplication sign designers expect. */
export function defaultLabel(width: number, height: number): string {
  return `${clampSide(width)} × ${clampSide(height)}`;
}

/** A font size that looks deliberate at any aspect ratio. */
export function autoFontSize(width: number, height: number): number {
  return Math.max(11, Math.round(Math.min(clampSide(width), clampSide(height)) / 7));
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Evenly spaced grid lines, always including the outer edges. */
export function gridLines(width: number, height: number, size: number): Line[] {
  const step = Math.max(4, Math.round(size) || 4);
  const lines: Line[] = [];
  for (let x = 0; x <= width; x += step) lines.push({ x1: x, y1: 0, x2: x, y2: height });
  for (let y = 0; y <= height; y += step) lines.push({ x1: 0, y1: y, x2: width, y2: y });
  return lines;
}

export function crossLines(width: number, height: number): Line[] {
  return [
    { x1: 0, y1: 0, x2: width, y2: height },
    { x1: width, y1: 0, x2: 0, y2: height },
  ];
}

export function strokeWidthFor(width: number, height: number): number {
  return Math.max(1, Math.round(Math.min(width, height) / 400));
}

const FONT_STACK = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** Draw the whole placeholder onto a context sized to the spec. */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, spec: PlaceholderSpec): void {
  const width = clampSide(spec.width);
  const height = clampSide(spec.height);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = spec.background;
  ctx.fillRect(0, 0, width, height);

  const lines =
    spec.overlay === 'cross'
      ? crossLines(width, height)
      : spec.overlay === 'grid'
        ? gridLines(width, height, spec.gridSize)
        : [];

  if (lines.length > 0) {
    ctx.save();
    ctx.globalAlpha = spec.overlay === 'grid' ? 0.28 : 0.4;
    ctx.strokeStyle = spec.foreground;
    ctx.lineWidth = strokeWidthFor(width, height);
    ctx.beginPath();
    for (const line of lines) {
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
    }
    ctx.stroke();
    ctx.restore();
  }

  const text = spec.label.trim() || defaultLabel(width, height);
  let size = spec.fontSize > 0 ? Math.round(spec.fontSize) : autoFontSize(width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = spec.foreground;

  // Shrink until the label fits inside the frame with a comfortable margin.
  const maxWidth = width * 0.88;
  ctx.font = `600 ${size}px ${FONT_STACK}`;
  let guard = 0;
  while (size > 6 && ctx.measureText(text).width > maxWidth && guard < 200) {
    size = Math.max(6, Math.floor(size * 0.92));
    ctx.font = `600 ${size}px ${FONT_STACK}`;
    guard += 1;
  }

  ctx.fillText(text, width / 2, height / 2);
}

export function suggestedFilename(spec: PlaceholderSpec): string {
  return `placeholder-${clampSide(spec.width)}x${clampSide(spec.height)}.png`;
}
