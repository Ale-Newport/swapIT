/**
 * Colour extraction and replacement for SVG source text.
 *
 * The document is scanned for the places a colour can legally appear — the
 * paint attributes, `style="…"` declarations and the rules inside a `<style>`
 * block — and every literal found there is normalised to lower-case hex so the
 * same colour written three different ways (`red`, `#F00`, `rgb(255,0,0)`)
 * collapses into one swatch and is replaced everywhere at once.
 */

/** The 148 CSS colour keywords, lower-case, mapped to six-digit hex. */
export const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700',
  goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6',
  olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500',
  orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f',
  pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080',
  rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57',
  seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb',
  slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080',
  thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee',
  wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

/** Values that are legal paint but are not a colour anyone can recolour. */
const NON_COLOUR = new Set(['none', 'currentcolor', 'inherit', 'transparent', 'initial', 'unset', 'context-fill', 'context-stroke']);

/** Properties whose value is a paint or a colour. */
const COLOUR_PROPERTIES = [
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
  'solid-color',
  'color',
];

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
const hex2 = (n: number) => clamp255(n).toString(16).padStart(2, '0');

/**
 * `#abc`, `#abcd`, `#aabbcc`, `#aabbccdd`, `rgb()`, `rgba()` and the CSS colour
 * keywords collapse to `#rrggbb`, or `#rrggbbaa` when the colour is not opaque.
 * Anything else — `none`, `url(#gradient)`, a variable — returns null.
 */
export function normalizeColor(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value || NON_COLOUR.has(value)) return null;

  if (value.startsWith('#')) {
    const digits = value.slice(1);
    if (!/^[0-9a-f]+$/.test(digits)) return null;
    if (digits.length === 3 || digits.length === 4) {
      const expanded = digits
        .split('')
        .map((c) => c + c)
        .join('');
      return withAlpha(`#${expanded.slice(0, 6)}`, expanded.slice(6, 8));
    }
    if (digits.length === 6) return `#${digits}`;
    if (digits.length === 8) return withAlpha(`#${digits.slice(0, 6)}`, digits.slice(6, 8));
    return null;
  }

  const fn = value.match(/^rgba?\(([^)]*)\)$/);
  if (fn) {
    const parts = fn[1]
      .split(/[\s,/]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const channels: number[] = [];
    for (const part of parts.slice(0, 3)) {
      const pct = part.endsWith('%');
      const n = Number.parseFloat(pct ? part.slice(0, -1) : part);
      if (Number.isNaN(n)) return null;
      channels.push(pct ? (n / 100) * 255 : n);
    }
    let alpha = 1;
    if (parts.length === 4) {
      const a = parts[3];
      const pct = a.endsWith('%');
      const n = Number.parseFloat(pct ? a.slice(0, -1) : a);
      if (Number.isNaN(n)) return null;
      alpha = Math.min(1, Math.max(0, pct ? n / 100 : n));
    }
    const rgb = `#${hex2(channels[0])}${hex2(channels[1])}${hex2(channels[2])}`;
    return withAlpha(rgb, hex2(alpha * 255));
  }

  return NAMED_COLORS[value] ?? null;
}

function withAlpha(rgb: string, alphaHex: string): string {
  if (!alphaHex || alphaHex === 'ff') return rgb;
  return rgb + alphaHex;
}

/** Alpha channel of a normalised colour, 0–1. */
export function alphaOf(normalized: string): number {
  if (normalized.length !== 9) return 1;
  return Number.parseInt(normalized.slice(7, 9), 16) / 255;
}

/** The six-digit part of a normalised colour, for `<input type="color">`. */
export function rgbOf(normalized: string): string {
  return normalized.slice(0, 7);
}

/**
 * Write a normalised colour back as CSS. Opaque colours stay hex, because that
 * is what an SVG author expects to read; anything translucent becomes `rgba()`,
 * which every renderer understands (eight-digit hex does not).
 */
export function formatColor(normalized: string): string {
  const alpha = alphaOf(normalized);
  if (alpha >= 1) return rgbOf(normalized);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
}

export interface ColorOccurrence {
  /** Index of the first character of the colour literal in the source. */
  start: number;
  end: number;
  /** Exactly how it was written, e.g. `#FFF` or `rgb(0 0 0)`. */
  raw: string;
  normalized: string;
  /** `attribute` for `fill="…"`, `style` for a CSS declaration. */
  where: 'attribute' | 'style';
}

const ATTRIBUTE_RE = new RegExp(`(\\s)(${COLOUR_PROPERTIES.join('|')})\\s*=\\s*("|')([^"']*)\\3`, 'gi');
// Deliberately not anchored on `>`: `<text>color: red</text>` is prose, not CSS.
const DECLARATION_RE = new RegExp(`(^|[\\s;{"'])(${COLOUR_PROPERTIES.join('|')})\\s*:\\s*([^;}"'<]+)`, 'gi');

/** Every colour literal in the document, in source order. */
export function findColorOccurrences(source: string): ColorOccurrence[] {
  const found: ColorOccurrence[] = [];
  const taken = new Set<number>();

  const push = (raw: string, start: number, where: ColorOccurrence['where']) => {
    const trimmedStart = start + (raw.length - raw.trimStart().length);
    const value = raw.trim();
    if (!value) return;
    const normalized = normalizeColor(value);
    if (!normalized) return;
    if (taken.has(trimmedStart)) return;
    taken.add(trimmedStart);
    found.push({ start: trimmedStart, end: trimmedStart + value.length, raw: value, normalized, where });
  };

  ATTRIBUTE_RE.lastIndex = 0;
  for (let m = ATTRIBUTE_RE.exec(source); m; m = ATTRIBUTE_RE.exec(source)) {
    const valueStart = m.index + m[0].length - 1 - m[4].length;
    push(m[4], valueStart, 'attribute');
  }

  DECLARATION_RE.lastIndex = 0;
  for (let m = DECLARATION_RE.exec(source); m; m = DECLARATION_RE.exec(source)) {
    const valueStart = m.index + m[0].length - m[3].length;
    push(m[3], valueStart, 'style');
  }

  return found.sort((a, b) => a.start - b.start);
}

export interface FoundColor {
  normalized: string;
  count: number;
  /** The distinct spellings used in the file, e.g. ['#FFF', 'white']. */
  notations: string[];
}

/** The palette of the document, most used first. */
export function extractColors(source: string): FoundColor[] {
  const byColor = new Map<string, { count: number; notations: Set<string> }>();
  for (const occurrence of findColorOccurrences(source)) {
    const entry = byColor.get(occurrence.normalized) ?? { count: 0, notations: new Set<string>() };
    entry.count += 1;
    entry.notations.add(occurrence.raw);
    byColor.set(occurrence.normalized, entry);
  }
  return [...byColor.entries()]
    .map(([normalized, entry]) => ({
      normalized,
      count: entry.count,
      notations: [...entry.notations],
    }))
    .sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized));
}

/**
 * Choose the text to write for a replacement. When the original was
 * translucent and the new colour carries no alpha of its own, the original
 * transparency is kept — losing it would silently make shadows solid.
 */
export function replacementText(target: string, originalNormalized: string): string | null {
  const normalizedTarget = normalizeColor(target);
  if (!normalizedTarget) return null;
  if (normalizedTarget.length === 9) return formatColor(normalizedTarget);
  const originalAlpha = originalNormalized.length === 9 ? originalNormalized.slice(7, 9) : '';
  return formatColor(rgbOf(normalizedTarget) + originalAlpha);
}

export interface ReplaceResult {
  svg: string;
  /** How many literals were rewritten. */
  changed: number;
}

/**
 * Rewrite every occurrence of the given colours. Keys are normalised colours as
 * returned by {@link extractColors}; values are any CSS colour the user picked.
 */
export function replaceColors(source: string, replacements: Record<string, string>): ReplaceResult {
  const entries = Object.entries(replacements);
  if (entries.length === 0) return { svg: source, changed: 0 };

  const resolved = new Map<string, string>();
  for (const [from, to] of entries) {
    const normalizedFrom = normalizeColor(from);
    if (!normalizedFrom) continue;
    const text = replacementText(to, normalizedFrom);
    if (!text) continue;
    if (text.toLowerCase() === formatColor(normalizedFrom).toLowerCase()) continue;
    resolved.set(normalizedFrom, text);
  }
  if (resolved.size === 0) return { svg: source, changed: 0 };

  const occurrences = findColorOccurrences(source);
  let out = '';
  let cursor = 0;
  let changed = 0;
  for (const occurrence of occurrences) {
    const text = resolved.get(occurrence.normalized);
    if (!text) continue;
    out += source.slice(cursor, occurrence.start) + text;
    cursor = occurrence.end;
    changed += 1;
  }
  out += source.slice(cursor);
  return { svg: out, changed };
}

/** Black or white, whichever stays readable on top of the colour. */
export function readableInk(normalized: string): '#000000' | '#ffffff' {
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? '#000000' : '#ffffff';
}
