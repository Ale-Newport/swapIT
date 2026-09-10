/**
 * Colour maths for the converter: parsing every CSS notation a developer might
 * paste, the model conversions, WCAG contrast and the named-colour lookup.
 * Everything here is pure so it can be tested without a canvas.
 */

export interface RGBA {
  /** 0–255 */
  r: number;
  /** 0–255 */
  g: number;
  /** 0–255 */
  b: number;
  /** 0–1 */
  a: number;
}

export interface HSL {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export interface CMYK {
  c: number;
  m: number;
  y: number;
  k: number;
}

/** The 148 CSS named colours, keyed by name. */
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

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const round = (n: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Accepts "50%", "0.5" (alpha) or a plain number. */
function channel(token: string, max: number): number | null {
  const t = token.trim();
  if (!t) return null;
  if (t.endsWith('%')) {
    const n = Number(t.slice(0, -1));
    return Number.isFinite(n) ? (n / 100) * max : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function alphaValue(token: string | undefined): number {
  if (token === undefined) return 1;
  const t = token.trim();
  if (!t) return 1;
  if (t.endsWith('%')) {
    const n = Number(t.slice(0, -1));
    return Number.isFinite(n) ? clamp(n / 100, 0, 1) : 1;
  }
  const n = Number(t);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 1;
}

function hueValue(token: string): number | null {
  const t = token.trim().toLowerCase();
  let n: number;
  if (t.endsWith('deg')) n = Number(t.slice(0, -3));
  else if (t.endsWith('turn')) n = Number(t.slice(0, -4)) * 360;
  else if (t.endsWith('rad')) n = (Number(t.slice(0, -3)) * 180) / Math.PI;
  else if (t.endsWith('grad')) n = (Number(t.slice(0, -4)) * 360) / 400;
  else n = Number(t);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

/**
 * Split "1, 2, 3 / 0.5" or "1 2 3 / 50%" into components plus alpha. A fourth
 * bare component counts as alpha only for the three-channel notations, so
 * cmyk()'s key channel is never mistaken for one.
 */
function splitArgs(body: string, channels: number): { parts: string[]; alpha?: string } {
  const [main, alphaPart] = body.split('/');
  const parts = main
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (alphaPart !== undefined) return { parts, alpha: alphaPart };
  if (parts.length === channels + 1) return { parts: parts.slice(0, channels), alpha: parts[channels] };
  return { parts };
}

/**
 * Parse any CSS colour notation this tool supports. Throws a sentence that
 * says what was wrong rather than returning null.
 */
export function parseColor(input: string): RGBA {
  const text = input.trim();
  if (!text) throw new Error('Type a colour, for example #3b82f6, rgb(59 130 246) or steelblue.');

  const lower = text.toLowerCase();

  if (NAMED_COLORS[lower]) return parseColor(NAMED_COLORS[lower]);

  const hexBody = lower.startsWith('#') ? lower.slice(1) : /^[0-9a-f]{3,8}$/.test(lower) ? lower : null;
  if (hexBody !== null) {
    if (!/^[0-9a-f]+$/.test(hexBody)) {
      const bad = [...hexBody].find((c) => !/[0-9a-f]/.test(c));
      throw new Error(`"${bad}" is not a hex digit. Hex colours use 0-9 and a-f, like #3b82f6.`);
    }
    const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);
    if (hexBody.length === 3 || hexBody.length === 4) {
      return {
        r: expand(hexBody[0]),
        g: expand(hexBody[1]),
        b: expand(hexBody[2]),
        a: hexBody.length === 4 ? round(expand(hexBody[3]) / 255, 3) : 1,
      };
    }
    if (hexBody.length === 6 || hexBody.length === 8) {
      return {
        r: expand(hexBody.slice(0, 2)),
        g: expand(hexBody.slice(2, 4)),
        b: expand(hexBody.slice(4, 6)),
        a: hexBody.length === 8 ? round(expand(hexBody.slice(6, 8)) / 255, 3) : 1,
      };
    }
    throw new Error(`A hex colour needs 3, 4, 6 or 8 digits — "${text}" has ${hexBody.length}.`);
  }

  const fn = /^([a-z]+)\s*\((.*)\)$/s.exec(lower);
  if (fn) {
    const name = fn[1];
    const { parts, alpha } = splitArgs(fn[2], name === 'cmyk' || name === 'device-cmyk' ? 4 : 3);
    const a = alphaValue(alpha);

    if (name === 'rgb' || name === 'rgba') {
      if (parts.length < 3) throw new Error('rgb() needs three values: red, green and blue.');
      const r = channel(parts[0], 255);
      const g = channel(parts[1], 255);
      const b = channel(parts[2], 255);
      if (r === null || g === null || b === null) throw new Error('rgb() values must be numbers from 0 to 255 or percentages.');
      return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255), a };
    }

    if (name === 'hsl' || name === 'hsla') {
      if (parts.length < 3) throw new Error('hsl() needs three values: hue, saturation and lightness.');
      const h = hueValue(parts[0]);
      const s = channel(parts[1], 100);
      const l = channel(parts[2], 100);
      if (h === null || s === null || l === null) throw new Error('hsl() takes a hue in degrees and two percentages, like hsl(210, 50%, 40%).');
      return { ...hslToRgb({ h, s: clamp(s, 0, 100), l: clamp(l, 0, 100) }), a };
    }

    if (name === 'hsv' || name === 'hsb') {
      if (parts.length < 3) throw new Error('hsv() needs three values: hue, saturation and value.');
      const h = hueValue(parts[0]);
      const s = channel(parts[1], 100);
      const v = channel(parts[2], 100);
      if (h === null || s === null || v === null) throw new Error('hsv() takes a hue in degrees and two percentages, like hsv(210, 76%, 76%).');
      return { ...hsvToRgb({ h, s: clamp(s, 0, 100), v: clamp(v, 0, 100) }), a };
    }

    if (name === 'cmyk' || name === 'device-cmyk') {
      if (parts.length < 4) throw new Error('cmyk() needs four values: cyan, magenta, yellow and key.');
      const values = parts.slice(0, 4).map((p) => channel(p, 100));
      if (values.some((v) => v === null)) throw new Error('cmyk() takes four percentages, like cmyk(0%, 100%, 100%, 0%).');
      const [c, m, y, k] = values as number[];
      return {
        ...cmykToRgb({ c: clamp(c, 0, 100), m: clamp(m, 0, 100), y: clamp(y, 0, 100), k: clamp(k, 0, 100) }),
        a,
      };
    }

    throw new Error(`"${name}()" is not a colour notation this tool understands. Try hex, rgb, hsl, hsv or cmyk.`);
  }

  if (/^[a-z]+$/.test(lower)) {
    throw new Error(`"${text}" is not a CSS colour name. Check the spelling, or use a hex value like #3b82f6.`);
  }

  throw new Error(`"${text}" is not a colour this tool recognises. Use hex, rgb(), hsl(), hsv(), cmyk() or a CSS name.`);
}

// ------------------------------------------------------------------ models

export function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: round(h, 1), s: round(s * 100, 1), l: round(l * 100, 1) };
}

export function hslToRgb({ h, s, l }: HSL): { r: number; g: number; b: number } {
  const hn = (((h % 360) + 360) % 360) / 60;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs((hn % 2) - 1));
  const m = ln - c / 2;
  let rgb: [number, number, number];
  if (hn < 1) rgb = [c, x, 0];
  else if (hn < 2) rgb = [x, c, 0];
  else if (hn < 3) rgb = [0, c, x];
  else if (hn < 4) rgb = [0, x, c];
  else if (hn < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clamp(Math.round((rgb[0] + m) * 255), 0, 255),
    g: clamp(Math.round((rgb[1] + m) * 255), 0, 255),
    b: clamp(Math.round((rgb[2] + m) * 255), 0, 255),
  };
}

export function rgbToHsv({ r, g, b }: { r: number; g: number; b: number }): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: round(h, 1), s: round((max === 0 ? 0 : delta / max) * 100, 1), v: round(max * 100, 1) };
}

export function hsvToRgb({ h, s, v }: HSV): { r: number; g: number; b: number } {
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const l = vn * (1 - sn / 2);
  const sl = l === 0 || l === 1 ? 0 : (vn - l) / Math.min(l, 1 - l);
  return hslToRgb({ h, s: sl * 100, l: l * 100 });
}

export function rgbToCmyk({ r, g, b }: { r: number; g: number; b: number }): CMYK {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: round(((1 - rn - k) / (1 - k)) * 100, 1),
    m: round(((1 - gn - k) / (1 - k)) * 100, 1),
    y: round(((1 - bn - k) / (1 - k)) * 100, 1),
    k: round(k * 100, 1),
  };
}

export function cmykToRgb({ c, m, y, k }: CMYK): { r: number; g: number; b: number } {
  const cn = clamp(c, 0, 100) / 100;
  const mn = clamp(m, 0, 100) / 100;
  const yn = clamp(y, 0, 100) / 100;
  const kn = clamp(k, 0, 100) / 100;
  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn)),
  };
}

// ------------------------------------------------------------------ output

const hex2 = (n: number): string => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export function toHex({ r, g, b }: RGBA | { r: number; g: number; b: number }): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function toHexAlpha({ r, g, b, a }: RGBA): string {
  return `${toHex({ r, g, b })}${hex2(clamp(a, 0, 1) * 255)}`;
}

export function formatRgb(c: RGBA): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

export function formatRgba(c: RGBA): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${round(c.a, 3)})`;
}

export function formatHsl(hsl: HSL): string {
  return `hsl(${round(hsl.h)}, ${round(hsl.s)}%, ${round(hsl.l)}%)`;
}

export function formatHsla(hsl: HSL, a: number): string {
  return `hsla(${round(hsl.h)}, ${round(hsl.s)}%, ${round(hsl.l)}%, ${round(a, 3)})`;
}

export function formatHsv(hsv: HSV): string {
  return `hsv(${round(hsv.h)}, ${round(hsv.s)}%, ${round(hsv.v)}%)`;
}

export function formatCmyk(cmyk: CMYK): string {
  return `cmyk(${round(cmyk.c)}%, ${round(cmyk.m)}%, ${round(cmyk.y)}%, ${round(cmyk.k)}%)`;
}

/** CSS string safe to hand to a style attribute, alpha included. */
export function toCss(c: RGBA): string {
  return c.a >= 1 ? toHex(c) : formatRgba(c);
}

// ------------------------------------------------------------------ contrast

export function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channelLum = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

export function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return round((lighter + 0.05) / (darker + 0.05), 2);
}

export interface WcagVerdict {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  /** "AAA", "AA", "AA Large" or "Fail" — the headline result. */
  grade: string;
}

export function wcag(ratio: number): WcagVerdict {
  const aaNormal = ratio >= 4.5;
  const aaLarge = ratio >= 3;
  const aaaNormal = ratio >= 7;
  const aaaLarge = ratio >= 4.5;
  const grade = aaaNormal ? 'AAA' : aaNormal ? 'AA' : aaLarge ? 'AA Large' : 'Fail';
  return { ratio, aaNormal, aaLarge, aaaNormal, aaaLarge, grade };
}

/** Contrast of a colour against pure white and pure black. */
export function contrastReport(c: RGBA): { white: WcagVerdict; black: WcagVerdict; bestOn: 'white' | 'black' } {
  const white = wcag(contrastRatio(c, { r: 255, g: 255, b: 255 }));
  const black = wcag(contrastRatio(c, { r: 0, g: 0, b: 0 }));
  return { white, black, bestOn: white.ratio >= black.ratio ? 'white' : 'black' };
}

// ------------------------------------------------------------------ names

export interface NamedMatch {
  name: string;
  hex: string;
  exact: boolean;
  /** Euclidean RGB distance, 0 when exact. */
  distance: number;
}

let namedCache: Array<{ name: string; hex: string; r: number; g: number; b: number }> | null = null;

function namedList(): Array<{ name: string; hex: string; r: number; g: number; b: number }> {
  if (!namedCache) {
    namedCache = Object.entries(NAMED_COLORS).map(([name, hex]) => ({
      name,
      hex,
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    }));
  }
  return namedCache;
}

export function nearestNamed({ r, g, b }: { r: number; g: number; b: number }): NamedMatch {
  let best = namedList()[0];
  let bestDistance = Infinity;
  for (const entry of namedList()) {
    const distance = Math.sqrt((entry.r - r) ** 2 + (entry.g - g) ** 2 + (entry.b - b) ** 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
      if (distance === 0) break;
    }
  }
  return { name: best.name, hex: best.hex, exact: bestDistance === 0, distance: round(bestDistance, 2) };
}

// ------------------------------------------------------------------ ramps

export function mix(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const f = clamp(t, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * f),
    g: Math.round(a.g + (b.g - a.g) * f),
    b: Math.round(a.b + (b.b - a.b) * f),
  };
}

export interface RampStop {
  /** 10, 20 … 100 */
  percent: number;
  hex: string;
}

/** Steps toward white in 10% increments. */
export function tints(c: { r: number; g: number; b: number }, steps = 10): RampStop[] {
  return Array.from({ length: steps }, (_, i) => {
    const percent = ((i + 1) / steps) * 100;
    return { percent: round(percent), hex: toHex(mix(c, { r: 255, g: 255, b: 255 }, (i + 1) / steps)) };
  });
}

/** Steps toward black in 10% increments. */
export function shades(c: { r: number; g: number; b: number }, steps = 10): RampStop[] {
  return Array.from({ length: steps }, (_, i) => {
    const percent = ((i + 1) / steps) * 100;
    return { percent: round(percent), hex: toHex(mix(c, { r: 0, g: 0, b: 0 }, (i + 1) / steps)) };
  });
}
