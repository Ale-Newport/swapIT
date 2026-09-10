/**
 * Reading and rewriting the `width`, `height` and `viewBox` of an SVG's root
 * element. Everything works on the source text rather than a parsed DOM so the
 * rest of the file — comments, formatting, the XML declaration — survives the
 * edit untouched.
 */

export interface RootTag {
  /** Index of the `<` of `<svg`. */
  start: number;
  /** Index just past the closing `>`. */
  end: number;
  text: string;
  selfClosing: boolean;
}

/**
 * Locate the root `<svg>` tag, skipping the XML declaration, a DOCTYPE and any
 * leading comments, and honouring quoted attribute values that contain `>`.
 */
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
      // A DOCTYPE, whose internal subset may itself contain `>`.
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

interface AttributeMatch {
  name: string;
  value: string;
  valueStart: number;
  valueEnd: number;
  matchStart: number;
  matchEnd: number;
}

/** Find an attribute inside a tag's text. XML is case-sensitive; the lookup is not, so `viewbox` is still found. */
export function findAttribute(tag: string, name: string): AttributeMatch | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\s(${escaped})\\s*=\\s*("|')([^"']*)\\2`, 'i');
  const m = re.exec(tag);
  if (!m) return null;
  const valueStart = m.index + m[0].length - 1 - m[3].length;
  return {
    name: m[1],
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

/** Set an attribute on a tag's text, or remove it when `value` is null. */
export function setAttribute(tag: string, name: string, value: string | null): string {
  const existing = findAttribute(tag, name);
  if (existing) {
    if (value === null) return tag.slice(0, existing.matchStart) + tag.slice(existing.matchEnd);
    return tag.slice(0, existing.valueStart) + escapeAttribute(value) + tag.slice(existing.valueEnd);
  }
  if (value === null) return tag;
  const selfClose = tag.match(/\/\s*>$/);
  const close = selfClose ? tag.length - selfClose[0].length : tag.length - 1;
  const before = tag.slice(0, close).replace(/\s+$/, '');
  return `${before} ${name}="${escapeAttribute(value)}"${tag.slice(close)}`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Replace the root tag of a document with a rewritten version of it. */
export function withRootTag(source: string, rewrite: (tag: string) => string): string {
  const root = findRootTag(source);
  if (!root) return source;
  return source.slice(0, root.start) + rewrite(root.text) + source.slice(root.end);
}

export interface Length {
  value: number;
  /** '' means user units — a bare number, which SVG treats as pixels. */
  unit: string;
}

export const UNITS = ['', 'px', '%', 'em', 'rem', 'pt', 'mm', 'in'];

/** `"120"`, `"120px"`, `"50%"` → a number and its unit. Returns null for `auto`, calc() or junk. */
export function parseLength(raw: string | null | undefined): Length | null {
  if (raw === null || raw === undefined) return null;
  const m = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*([a-z%]*)$/i);
  if (!m) return null;
  const value = Number.parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2].toLowerCase();
  if (unit && !UNITS.includes(unit)) return null;
  return { value, unit };
}

/** Trim trailing zeros so `120.00` is written as `120`. */
export function formatNumber(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(decimals));
  return String(rounded);
}

export function formatLength(length: Length): string {
  return formatNumber(length.value) + length.unit;
}

export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
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

export interface SvgDimensions {
  width: Length | null;
  height: Length | null;
  /** The raw attribute text, so an unparseable value can still be reported. */
  rawWidth: string | null;
  rawHeight: string | null;
  viewBox: ViewBox | null;
}

export function readDimensions(source: string): SvgDimensions | null {
  const root = findRootTag(source);
  if (!root) return null;
  const rawWidth = getAttribute(root.text, 'width');
  const rawHeight = getAttribute(root.text, 'height');
  return {
    rawWidth,
    rawHeight,
    width: parseLength(rawWidth),
    height: parseLength(rawHeight),
    viewBox: parseViewBox(getAttribute(root.text, 'viewBox')),
  };
}

/**
 * The width-to-height ratio the file implies: the viewBox first, because it is
 * what actually governs the drawing, then the declared size.
 */
export function aspectRatio(dimensions: SvgDimensions | null): number | null {
  if (!dimensions) return null;
  if (dimensions.viewBox) return dimensions.viewBox.width / dimensions.viewBox.height;
  const { width, height } = dimensions;
  if (width && height && width.unit === height.unit && height.value !== 0) return width.value / height.value;
  return null;
}

/** Write width and height onto the root tag, or strip them both. */
export function applyDimensions(
  source: string,
  size: { width: Length; height: Length } | null,
): string {
  return withRootTag(source, (tag) => {
    if (!size) return setAttribute(setAttribute(tag, 'width', null), 'height', null);
    return setAttribute(setAttribute(tag, 'width', formatLength(size.width)), 'height', formatLength(size.height));
  });
}

/** Partner dimension for an aspect-locked edit. */
export function lockedCounterpart(value: number, ratio: number, edited: 'width' | 'height'): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return value;
  const next = edited === 'width' ? value / ratio : value * ratio;
  return Number(next.toFixed(3));
}
