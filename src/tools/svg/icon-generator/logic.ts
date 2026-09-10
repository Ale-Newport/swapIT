/**
 * Builds an icon as SVG source. Everything is laid out on a 100 × 100 grid and
 * the exported `width`/`height` scale it, so a change of size never moves a
 * single coordinate — and padding, radius and font size can all be expressed as
 * a plain percentage of the icon.
 */

export type ShapeId = 'circle' | 'rounded' | 'square' | 'hexagon' | 'shield' | 'none';
export type ForegroundKind = 'initials' | 'emoji' | 'glyph';
export type FillKind = 'solid' | 'gradient';

export const GRID = 100;

export const SHAPES: Array<{ id: ShapeId; label: string }> = [
  { id: 'rounded', label: 'Rounded square' },
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'shield', label: 'Shield' },
  { id: 'none', label: 'No shape' },
];

export const FONTS: Array<{ id: string; label: string; stack: string }> = [
  { id: 'sans', label: 'Sans', stack: "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" },
  { id: 'serif', label: 'Serif', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Mono', stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  { id: 'rounded', label: 'Rounded', stack: "'SF Pro Rounded', 'Avenir Next', 'Nunito', system-ui, sans-serif" },
];

/**
 * A handful of geometric marks, drawn on a 24 × 24 grid — the same grid the
 * common icon sets use, so the proportions look familiar.
 */
export const GLYPHS: Array<{ id: string; label: string; d: string; mode: 'fill' | 'stroke' }> = [
  { id: 'check', label: 'Check', d: 'M4 12.5 L9.5 18 L20 6', mode: 'stroke' },
  { id: 'plus', label: 'Plus', d: 'M4 11 H20 M12 3 V19', mode: 'stroke' },
  { id: 'arrow', label: 'Arrow', d: 'M3 12 H19 M13 6 L19 12 L13 18', mode: 'stroke' },
  { id: 'play', label: 'Play', d: 'M7 4 L20 12 L7 20 Z', mode: 'fill' },
  { id: 'heart', label: 'Heart', d: 'M12 20.5 C4 15 2 11 2 8 A5 5 0 0 1 12 6 A5 5 0 0 1 22 8 C22 11 20 15 12 20.5 Z', mode: 'fill' },
  { id: 'bolt', label: 'Bolt', d: 'M13.5 2 L4 13.5 H11 L10 22 L20 10 H13 Z', mode: 'fill' },
  { id: 'dot', label: 'Dot', d: 'M12 5 A7 7 0 1 0 12.01 5 Z', mode: 'fill' },
  { id: 'square', label: 'Square', d: 'M4 4 H20 V20 H4 Z', mode: 'fill' },
];

export interface IconOptions {
  /** Exported pixel size; the drawing itself is always on the 100 grid. */
  size: number;
  shape: ShapeId;
  /** Corner radius of the rounded square, 0–50 on the grid. */
  radius: number;
  fillKind: FillKind;
  color: string;
  from: string;
  to: string;
  /** Gradient direction in degrees; 0° left to right, 90° top to bottom. */
  angle: number;
  /** Space between the shape's edge and the foreground, 0–40 on the grid. */
  padding: number;
  foreground: ForegroundKind;
  text: string;
  glyph: string;
  fgColor: string;
  fontWeight: number;
  font: string;
  /** Foreground size multiplier, 0.4–1.6. */
  scale: number;
}

export const DEFAULT_ICON: IconOptions = {
  size: 512,
  shape: 'rounded',
  radius: 22,
  fillKind: 'gradient',
  color: '#2563eb',
  from: '#6366f1',
  to: '#ec4899',
  angle: 135,
  padding: 22,
  foreground: 'initials',
  text: 'TB',
  glyph: 'check',
  fgColor: '#ffffff',
  fontWeight: 700,
  font: 'sans',
  scale: 1,
};

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals)) + 0;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Split into user-perceived characters, so an emoji counts as one. */
export function graphemes(value: string): string[] {
  try {
    const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    if (Segmenter) {
      return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map((s) => s.segment);
    }
  } catch {
    /* fall through to code points */
  }
  return [...value];
}

/** Up to three characters, upper-cased — what an avatar monogram looks like. */
export function normalizeInitials(raw: string): string {
  return graphemes(raw.replace(/\s+/g, '')).slice(0, 3).join('').toUpperCase();
}

/** The first emoji (or character) of the input. */
export function firstGrapheme(raw: string): string {
  return graphemes(raw.trim())[0] ?? '';
}

/** Points of a hexagon with a vertex at the top, inscribed in a circle of radius `r`. */
export function hexagonPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    points.push(`${round(cx + r * Math.cos(angle))},${round(cy + r * Math.sin(angle))}`);
  }
  return points.join(' ');
}

/** A crest-shaped shield filling the grid. */
export const SHIELD_PATH = 'M50 3 L93 18 V50 C93 74 75 89 50 97 C25 89 7 74 7 50 V18 Z';

export interface GradientVector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function gradientVector(angle: number): GradientVector {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const span = Math.abs(dx) + Math.abs(dy) || 1;
  const r = (value: number) => Number(value.toFixed(4)) + 0;
  return {
    x1: r(0.5 - (dx * span) / 2),
    y1: r(0.5 - (dy * span) / 2),
    x2: r(0.5 + (dx * span) / 2),
    y2: r(0.5 + (dy * span) / 2),
  };
}

/** The square left for the foreground once the padding is taken off. */
export function innerSize(padding: number): number {
  return Math.max(10, GRID - padding * 2);
}

/** Type size that keeps one, two or three characters inside the inner square. */
export function initialsFontSize(text: string, inner: number, scale = 1): number {
  const length = Math.max(1, graphemes(text).length);
  const factor = length <= 1 ? 0.66 : length === 2 ? 0.46 : 0.34;
  return round(inner * factor * scale);
}

export const GRADIENT_ID = 'icon-fill';

function shapeMarkup(options: IconOptions, paint: string): string {
  switch (options.shape) {
    case 'circle':
      return `  <circle cx="50" cy="50" r="50" fill="${paint}"/>\n`;
    case 'square':
      return `  <rect width="100" height="100" fill="${paint}"/>\n`;
    case 'rounded':
      return `  <rect width="100" height="100" rx="${round(Math.min(50, Math.max(0, options.radius)))}" fill="${paint}"/>\n`;
    case 'hexagon':
      return `  <polygon points="${hexagonPoints(50, 50, 50)}" fill="${paint}"/>\n`;
    case 'shield':
      return `  <path d="${SHIELD_PATH}" fill="${paint}"/>\n`;
    case 'none':
    default:
      return '';
  }
}

function foregroundMarkup(options: IconOptions): string {
  const inner = innerSize(options.padding);
  const font = FONTS.find((f) => f.id === options.font) ?? FONTS[0];

  if (options.foreground === 'glyph') {
    const glyph = GLYPHS.find((g) => g.id === options.glyph) ?? GLYPHS[0];
    const factor = round(((inner * options.scale) / 24) * (glyph.mode === 'stroke' ? 0.92 : 1), 4);
    const paint =
      glyph.mode === 'stroke'
        ? `fill="none" stroke="${options.fgColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`
        : `fill="${options.fgColor}"`;
    return (
      `  <g transform="translate(50 50) scale(${factor}) translate(-12 -12)" ${paint}>\n` +
      `    <path d="${glyph.d}"/>\n` +
      `  </g>\n`
    );
  }

  const text = options.foreground === 'emoji' ? firstGrapheme(options.text) : normalizeInitials(options.text);
  if (!text) return '';
  const fontSize =
    options.foreground === 'emoji' ? round(inner * 0.72 * options.scale) : initialsFontSize(text, inner, options.scale);
  const family = options.foreground === 'emoji' ? "'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" : font.stack;
  const weight = options.foreground === 'emoji' ? '' : ` font-weight="${options.fontWeight}"`;
  const fill = options.foreground === 'emoji' ? '' : ` fill="${options.fgColor}"`;
  return (
    `  <text x="50" y="50" text-anchor="middle" dominant-baseline="central"` +
    ` font-family="${escapeXml(family)}" font-size="${fontSize}"${weight}${fill}>${escapeXml(text)}</text>\n`
  );
}

export function buildIconSvg(options: IconOptions): string {
  const size = Math.max(1, Math.round(options.size));
  const gradient = options.fillKind === 'gradient' && options.shape !== 'none';
  const paint = options.fillKind === 'gradient' ? `url(#${GRADIENT_ID})` : options.color;
  const vector = gradientVector(options.angle);

  const defs = gradient
    ? `  <defs>\n` +
      `    <linearGradient id="${GRADIENT_ID}" x1="${vector.x1}" y1="${vector.y1}" x2="${vector.x2}" y2="${vector.y2}">\n` +
      `      <stop offset="0" stop-color="${options.from}"/>\n` +
      `      <stop offset="1" stop-color="${options.to}"/>\n` +
      `    </linearGradient>\n` +
      `  </defs>\n`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}">\n` +
    defs +
    shapeMarkup(options, paint) +
    foregroundMarkup(options) +
    `</svg>\n`
  );
}

/** A sensible file name for the icon that was built. */
export function iconFileName(options: IconOptions): string {
  const base =
    options.foreground === 'glyph'
      ? options.glyph
      : options.foreground === 'emoji'
        ? 'emoji'
        : normalizeInitials(options.text).toLowerCase();
  const cleaned = base.replace(/[^a-z0-9-]+/gi, '') || 'icon';
  return `icon-${cleaned}`;
}
