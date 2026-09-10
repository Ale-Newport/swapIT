export type SortMode =
  | 'az'
  | 'za'
  | 'numeric-asc'
  | 'numeric-desc'
  | 'length-asc'
  | 'length-desc'
  | 'shuffle'
  | 'reverse';

export interface SortOptions {
  mode: SortMode;
  caseSensitive: boolean;
  ignoreLeadingWhitespace: boolean;
  removeDuplicates: boolean;
  /** Makes the shuffle reproducible until the user asks for another one. */
  seed: number;
}

export interface SortResult {
  output: string;
  linesIn: number;
  linesOut: number;
  removed: number;
}

export function splitLines(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text === '') return { lines: [], trailingNewline: false };
  const trailingNewline = /\r?\n$/.test(text);
  const body = trailingNewline ? text.replace(/\r?\n$/, '') : text;
  return { lines: body.split(/\r?\n/), trailingNewline };
}

const PURE_NUMBER = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

function asNumber(value: string): number {
  return parseFloat(value.replace(',', '.'));
}

/** Plain text comparison — code-point order when case matters, locale order otherwise. */
export function compareText(a: string, b: string, caseSensitive: boolean): number {
  if (caseSensitive) return a < b ? -1 : a > b ? 1 : 0;
  const r = a.localeCompare(b, undefined, { sensitivity: 'accent' });
  return r !== 0 ? r : a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Natural order: digit runs compare as numbers, so item2 lands before item10,
 * and two plain numbers compare numerically including sign and decimals.
 */
export function naturalCompare(a: string, b: string, caseSensitive = false): number {
  const ta = a.trim();
  const tb = b.trim();
  if (PURE_NUMBER.test(ta) && PURE_NUMBER.test(tb)) {
    const diff = asNumber(ta) - asNumber(tb);
    if (diff !== 0) return diff < 0 ? -1 : 1;
    // Equal value, different spelling ("7" vs "007") — shortest first, then text.
    if (ta.length !== tb.length) return ta.length - tb.length;
    return compareText(a, b, caseSensitive);
  }
  const ca = a.match(/\d+|\D+/g) ?? [];
  const cb = b.match(/\d+|\D+/g) ?? [];
  const len = Math.min(ca.length, cb.length);
  for (let i = 0; i < len; i++) {
    const x = ca[i];
    const y = cb[i];
    const xNum = /^\d/.test(x);
    const yNum = /^\d/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff < 0 ? -1 : 1;
      // "007" and "7" are numerically equal — shorter first, so it stays stable.
      if (x.length !== y.length) return x.length - y.length;
      continue;
    }
    if (xNum !== yNum) return xNum ? -1 : 1; // numbers before words
    const r = compareText(x, y, caseSensitive);
    if (r !== 0) return r;
  }
  return ca.length - cb.length;
}

/** Small deterministic PRNG so a shuffle can be repeated or re-rolled on demand. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sortLines(text: string, opts: SortOptions): SortResult {
  const { lines, trailingNewline } = splitLines(text);
  let working = lines;

  const key = (line: string) => (opts.ignoreLeadingWhitespace ? line.replace(/^\s+/, '') : line);

  if (opts.removeDuplicates) {
    const seen = new Set<string>();
    working = working.filter((line) => {
      // The same key the sort uses, so "Ignore indentation" decides here too.
      const seenKey = opts.caseSensitive ? key(line) : key(line).toLowerCase();
      if (seen.has(seenKey)) return false;
      seen.add(seenKey);
      return true;
    });
  }

  let sorted: string[];

  switch (opts.mode) {
    case 'reverse':
      sorted = [...working].reverse();
      break;
    case 'shuffle':
      sorted = shuffle(working, opts.seed);
      break;
    case 'az':
      sorted = [...working].sort((a, b) => compareText(key(a), key(b), opts.caseSensitive));
      break;
    case 'za':
      sorted = [...working].sort((a, b) => compareText(key(b), key(a), opts.caseSensitive));
      break;
    case 'numeric-asc':
      sorted = [...working].sort((a, b) => naturalCompare(key(a), key(b), opts.caseSensitive));
      break;
    case 'numeric-desc':
      sorted = [...working].sort((a, b) => naturalCompare(key(b), key(a), opts.caseSensitive));
      break;
    case 'length-asc':
      sorted = [...working].sort(
        (a, b) => key(a).length - key(b).length || compareText(key(a), key(b), opts.caseSensitive),
      );
      break;
    case 'length-desc':
      sorted = [...working].sort(
        (a, b) => key(b).length - key(a).length || compareText(key(a), key(b), opts.caseSensitive),
      );
      break;
    default:
      sorted = [...working];
  }

  return {
    output: sorted.length === 0 ? '' : sorted.join('\n') + (trailingNewline ? '\n' : ''),
    linesIn: lines.length,
    linesOut: sorted.length,
    removed: lines.length - sorted.length,
  };
}
