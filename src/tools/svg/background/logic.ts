/**
 * Inserting a background rectangle as the first child of an SVG. Both the rect
 * and its gradient carry a `data-toolbox-bg` marker so re-running the tool on a
 * file it already touched replaces the background instead of stacking a second
 * one behind the first.
 */

export interface RootTag {
  start: number;
  end: number;
  text: string;
  selfClosing: boolean;
}

export function findRootTag(source: string): RootTag | null {
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open < 0) return null;
    if (source.startsWith('<!--', open)) {
      const close = source.indexOf('-->', open + 4);
      cursor = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith('<?', open)) {
      const close = source.indexOf('?>', open + 2);
      cursor = close < 0 ? source.length : close + 2;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const close = source.indexOf(']]>', open + 9);
      cursor = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith('<!', open)) {
      let depth = 0;
      let i = open + 2;
      for (; i < source.length; i += 1) {
        const char = source[i];
        if (char === '[') depth += 1;
        else if (char === ']') depth -= 1;
        else if (char === '>' && depth <= 0) break;
      }
      cursor = i + 1;
      continue;
    }
    if (!/^<svg(?=[\s/>])/i.test(source.slice(open, open + 5))) {
      cursor = open + 1;
      continue;
    }
    let quote: string | null = null;
    for (let i = open + 4; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '>') {
        const text = source.slice(open, i + 1);
        return { start: open, end: i + 1, text, selfClosing: /\/\s*>$/.test(text) };
      }
    }
    return null;
  }
  return null;
}

export function getAttribute(tag: string, name: string): string | null {
  const m = new RegExp(`\\s(${name})\\s*=\\s*("|')([^"']*)\\2`, 'i').exec(tag);
  return m ? m[3] : null;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseViewBox(raw: string | null): Box | null {
  if (!raw) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map((p) => Number.parseFloat(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  if (parts[2] <= 0 || parts[3] <= 0) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * A root `width`/`height` in user units. Without a viewBox the user coordinate
 * system *is* the viewport one, where a user unit is a CSS pixel — so `100pt`
 * describes a 133.33-unit drawing area, not a 100-unit one. Any other unit
 * returns null so the caller falls back to a fluid 100% × 100% rectangle.
 */
function lengthValue(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|pt|)$/i);
  if (!m) return null;
  const value = Number.parseFloat(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return m[2].toLowerCase() === 'pt' ? value * (4 / 3) : value;
}

/** The area the background has to cover, in the root's own coordinates. */
export interface Coverage {
  box: Box | null;
  /** True when the size is unknown and the rect has to fall back to 100% × 100%. */
  fluid: boolean;
}

export function coverageOf(source: string): Coverage | null {
  const root = findRootTag(source);
  if (!root) return null;
  const viewBox = parseViewBox(getAttribute(root.text, 'viewBox'));
  if (viewBox) return { box: viewBox, fluid: false };
  const width = lengthValue(getAttribute(root.text, 'width'));
  const height = lengthValue(getAttribute(root.text, 'height'));
  if (width && height) return { box: { x: 0, y: 0, width, height }, fluid: false };
  return { box: null, fluid: true };
}

/** Round for the file, then drop the trailing zeros: `24.0000` is written `24`. */
export const num = (value: number, decimals = 4) => String(Number(value.toFixed(decimals)));

export interface GradientVector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Endpoints of a linear gradient in objectBoundingBox units for an angle in
 * degrees, where 0° runs left to right and 90° runs top to bottom. The line is
 * lengthened so the gradient still spans the whole box on a diagonal.
 */
export function gradientVector(angle: number): GradientVector {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const span = Math.abs(dx) + Math.abs(dy) || 1;
  // `+ 0` turns a negative zero back into plain 0, which reads better in the file.
  const round = (value: number) => Number(value.toFixed(4)) + 0;
  return {
    x1: round(0.5 - (dx * span) / 2),
    y1: round(0.5 - (dy * span) / 2),
    x2: round(0.5 + (dx * span) / 2),
    y2: round(0.5 + (dy * span) / 2),
  };
}

export const GRADIENT_ID = 'toolbox-background';

const DEFS_RE = /[ \t]*<defs data-toolbox-bg="1">[\s\S]*?<\/defs>\n?/g;
const RECT_RE = /[ \t]*<rect data-toolbox-bg="1"[^>]*\/>\n?/g;

/** Remove a background this tool added earlier, leaving anything else alone. */
export function removeBackground(source: string): string {
  return source.replace(DEFS_RE, '').replace(RECT_RE, '');
}

export function hasToolboxBackground(source: string): boolean {
  return /data-toolbox-bg="1"/.test(source);
}

export interface BackgroundOptions {
  kind: 'solid' | 'gradient';
  /** Used when `kind` is 'solid'. */
  color: string;
  from: string;
  to: string;
  /** Degrees; 0° left to right, 90° top to bottom. */
  angle: number;
  /** Corner radius in user units. 0 means square corners. */
  radius: number;
}

export function buildBackgroundMarkup(options: BackgroundOptions, coverage: Coverage): string {
  const { box, fluid } = coverage;
  const geometry = fluid
    ? 'x="0" y="0" width="100%" height="100%"'
    : `x="${num(box?.x ?? 0)}" y="${num(box?.y ?? 0)}" width="${num(box?.width ?? 0)}" height="${num(box?.height ?? 0)}"`;
  const radius = options.radius > 0 ? ` rx="${num(options.radius)}"` : '';

  if (options.kind === 'solid') {
    return `  <rect data-toolbox-bg="1" ${geometry}${radius} fill="${options.color}"/>\n`;
  }

  const vector = gradientVector(options.angle);
  return (
    `  <defs data-toolbox-bg="1">\n` +
    `    <linearGradient id="${GRADIENT_ID}" x1="${vector.x1}" y1="${vector.y1}" x2="${vector.x2}" y2="${vector.y2}">\n` +
    `      <stop offset="0" stop-color="${options.from}"/>\n` +
    `      <stop offset="1" stop-color="${options.to}"/>\n` +
    `    </linearGradient>\n` +
    `  </defs>\n` +
    `  <rect data-toolbox-bg="1" ${geometry}${radius} fill="url(#${GRADIENT_ID})"/>\n`
  );
}

/**
 * Insert the background as the first child of the root. Returns null when the
 * file has no `<svg>` element to put it in.
 */
export function applyBackground(source: string, options: BackgroundOptions): string | null {
  const cleaned = removeBackground(source);
  const root = findRootTag(cleaned);
  if (!root) return null;
  const coverage = coverageOf(cleaned);
  if (!coverage) return null;

  const markup = buildBackgroundMarkup(options, coverage);

  if (root.selfClosing) {
    // `<svg …/>` has no children yet; give it a body to hold the rectangle.
    const opened = root.text.replace(/\/\s*>$/, '>');
    return `${cleaned.slice(0, root.start)}${opened}\n${markup}</svg>${cleaned.slice(root.end)}`;
  }
  return `${cleaned.slice(0, root.end)}\n${markup}${cleaned.slice(root.end).replace(/^\n/, '')}`;
}
