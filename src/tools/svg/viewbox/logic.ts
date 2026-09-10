/**
 * viewBox arithmetic and the root-tag rewriting the tool needs. The document is
 * edited as text so comments, indentation and the XML declaration survive.
 */

export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface RootTag {
  start: number;
  end: number;
  text: string;
}

/** Locate the root `<svg>` tag, skipping the XML declaration, DOCTYPE and comments. */
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
      if (char === '>') return { start: open, end: i + 1, text: source.slice(open, i + 1) };
    }
    return null;
  }
  return null;
}

interface AttributeMatch {
  value: string;
  valueStart: number;
  valueEnd: number;
  matchStart: number;
  matchEnd: number;
}

function findAttribute(tag: string, name: string): AttributeMatch | null {
  const re = new RegExp(`\\s(${name})\\s*=\\s*("|')([^"']*)\\2`, 'i');
  const m = re.exec(tag);
  if (!m) return null;
  const valueStart = m.index + m[0].length - 1 - m[3].length;
  return {
    value: m[3],
    valueStart,
    valueEnd: valueStart + m[3].length,
    matchStart: m.index,
    matchEnd: m.index + m[0].length,
  };
}

export function getAttribute(tag: string, name: string): string | null {
  return findAttribute(tag, name)?.value ?? null;
}

export function setAttribute(tag: string, name: string, value: string | null): string {
  const existing = findAttribute(tag, name);
  if (existing) {
    if (value === null) return tag.slice(0, existing.matchStart) + tag.slice(existing.matchEnd);
    return tag.slice(0, existing.valueStart) + value + tag.slice(existing.valueEnd);
  }
  if (value === null) return tag;
  const selfClose = tag.match(/\/\s*>$/);
  const close = selfClose ? tag.length - selfClose[0].length : tag.length - 1;
  return `${tag.slice(0, close).replace(/\s+$/, '')} ${name}="${value}"${tag.slice(close)}`;
}

export function withRootTag(source: string, rewrite: (tag: string) => string): string {
  const root = findRootTag(source);
  if (!root) return source;
  return source.slice(0, root.start) + rewrite(root.text) + source.slice(root.end);
}

export function parseViewBox(raw: string | null | undefined): ViewBox | null {
  if (!raw) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map((p) => Number.parseFloat(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  if (parts[2] <= 0 || parts[3] <= 0) return null;
  return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
}

/** Round to at most three decimals and drop trailing zeros. */
export function trim(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(3));
}

export function formatViewBox(box: ViewBox): string {
  return [box.minX, box.minY, box.width, box.height].map(trim).join(' ');
}

/**
 * A viewBox is measured in user units, which are CSS pixels at 1:1 — so an
 * absolute unit on width/height has to be converted, not just stripped.
 * Anything context-dependent (%, em, ex) has no fixed pixel value and is
 * reported as "no intrinsic size".
 */
const UNIT_PX: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 25.4 / 4,
};

/** A plain number with an optional unit, as `width="120px"` is written. */
function lengthValue(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
  if (!m) return null;
  const value = Number.parseFloat(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = UNIT_PX[m[2].toLowerCase()];
  return factor === undefined ? null : value * factor;
}

export interface ViewBoxState {
  /** The viewBox declared in the file, if any. */
  declared: ViewBox | null;
  /** `0 0 width height` from the declared size — what the file falls back to. */
  intrinsic: ViewBox | null;
}

export function readViewBox(source: string): ViewBoxState | null {
  const root = findRootTag(source);
  if (!root) return null;
  const width = lengthValue(getAttribute(root.text, 'width'));
  const height = lengthValue(getAttribute(root.text, 'height'));
  return {
    declared: parseViewBox(getAttribute(root.text, 'viewBox')),
    intrinsic: width && height ? { minX: 0, minY: 0, width, height } : null,
  };
}

export function applyViewBox(source: string, box: ViewBox): string {
  return withRootTag(source, (tag) => setAttribute(tag, 'viewBox', formatViewBox(box)));
}

/** Drop width and height so the preview scales to whatever box it is drawn in. */
export function stripSize(source: string): string {
  return withRootTag(source, (tag) => setAttribute(setAttribute(tag, 'width', null), 'height', null));
}

/** Grow (or, with a negative value, shrink) a frame on all four sides. */
export function expandViewBox(box: ViewBox, padding: number): ViewBox {
  const width = box.width + padding * 2;
  const height = box.height + padding * 2;
  if (width <= 0 || height <= 0) return box;
  return { minX: box.minX - padding, minY: box.minY - padding, width, height };
}

/** The smallest frame containing both — used to show the old and new frames together. */
export function unionViewBox(a: ViewBox, b: ViewBox): ViewBox {
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.minX + a.width, b.minX + b.width);
  const maxY = Math.max(a.minY + a.height, b.minY + b.height);
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** Scale a frame about its centre — the margin the preview leaves around the artwork. */
export function inflate(box: ViewBox, factor: number): ViewBox {
  const dx = (box.width * factor) / 2;
  const dy = (box.height * factor) / 2;
  return {
    minX: box.minX - dx,
    minY: box.minY - dy,
    width: box.width + dx * 2,
    height: box.height + dy * 2,
  };
}

export function isValidViewBox(box: ViewBox): boolean {
  return (
    Number.isFinite(box.minX) &&
    Number.isFinite(box.minY) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

export function sameViewBox(a: ViewBox | null, b: ViewBox | null): boolean {
  if (!a || !b) return a === b;
  return trim(a.minX) === trim(b.minX) && trim(a.minY) === trim(b.minY) && trim(a.width) === trim(b.width) && trim(a.height) === trim(b.height);
}

/** How the frame compares to the artwork, in plain words. */
export function describeCoverage(frame: ViewBox, content: ViewBox): string {
  const insideX = frame.minX <= content.minX + 0.01 && frame.minX + frame.width >= content.minX + content.width - 0.01;
  const insideY = frame.minY <= content.minY + 0.01 && frame.minY + frame.height >= content.minY + content.height - 0.01;
  if (insideX && insideY) return 'The whole drawing fits inside the frame.';
  return 'Part of the drawing falls outside the frame and will be cut off.';
}
