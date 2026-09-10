/**
 * Character-by-character Unicode analysis.
 *
 * Two questions bring people here: "why does my 1-emoji string have length 7?"
 * — answered by the four different ways of counting below — and "what is that
 * character I cannot see?" — answered by the flag table.
 */

export type FlagKind = 'invisible' | 'lookalike';

export interface Flag {
  kind: FlagKind;
  name: string;
  note: string;
}

export interface CharInfo {
  /** Position in code points, 1-based. */
  index: number;
  char: string;
  codePoint: number;
  /** `U+1F600` */
  hex: string;
  /** UTF-8 bytes as hex pairs, e.g. `F0 9F 98 80`. */
  utf8: string;
  /** UTF-16 code units as hex, e.g. `D83D DE00`. */
  utf16: string;
  byteLength: number;
  unitLength: number;
  category: string;
  /** The Unicode name where this tool can derive it. */
  name: string | null;
  /** What to print in a "character" column — a control picture, a dotted circle, or the character. */
  display: string;
  flag: Flag | null;
}

// ------------------------------------------------------------------ names

const C0_NAMES =
  'NULL|START OF HEADING|START OF TEXT|END OF TEXT|END OF TRANSMISSION|ENQUIRY|ACKNOWLEDGE|BELL|' +
  'BACKSPACE|CHARACTER TABULATION (TAB)|LINE FEED|LINE TABULATION|FORM FEED|CARRIAGE RETURN|SHIFT OUT|SHIFT IN|' +
  'DATA LINK ESCAPE|DEVICE CONTROL ONE|DEVICE CONTROL TWO|DEVICE CONTROL THREE|DEVICE CONTROL FOUR|' +
  'NEGATIVE ACKNOWLEDGE|SYNCHRONOUS IDLE|END OF TRANSMISSION BLOCK|CANCEL|END OF MEDIUM|SUBSTITUTE|ESCAPE|' +
  'INFORMATION SEPARATOR FOUR|INFORMATION SEPARATOR THREE|INFORMATION SEPARATOR TWO|INFORMATION SEPARATOR ONE';

const CONTROL_NAMES = C0_NAMES.split('|');

const DIGIT_NAMES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

const PUNCT_NAMES: Record<number, string> = {
  0x20: 'SPACE', 0x21: 'EXCLAMATION MARK', 0x22: 'QUOTATION MARK', 0x23: 'NUMBER SIGN',
  0x24: 'DOLLAR SIGN', 0x25: 'PERCENT SIGN', 0x26: 'AMPERSAND', 0x27: 'APOSTROPHE',
  0x28: 'LEFT PARENTHESIS', 0x29: 'RIGHT PARENTHESIS', 0x2a: 'ASTERISK', 0x2b: 'PLUS SIGN',
  0x2c: 'COMMA', 0x2d: 'HYPHEN-MINUS', 0x2e: 'FULL STOP', 0x2f: 'SOLIDUS',
  0x3a: 'COLON', 0x3b: 'SEMICOLON', 0x3c: 'LESS-THAN SIGN', 0x3d: 'EQUALS SIGN',
  0x3e: 'GREATER-THAN SIGN', 0x3f: 'QUESTION MARK', 0x40: 'COMMERCIAL AT',
  0x5b: 'LEFT SQUARE BRACKET', 0x5c: 'REVERSE SOLIDUS', 0x5d: 'RIGHT SQUARE BRACKET',
  0x5e: 'CIRCUMFLEX ACCENT', 0x5f: 'LOW LINE', 0x60: 'GRAVE ACCENT',
  0x7b: 'LEFT CURLY BRACKET', 0x7c: 'VERTICAL LINE', 0x7d: 'RIGHT CURLY BRACKET', 0x7e: 'TILDE',
};

// ------------------------------------------------------------------ flags

interface FlagRule {
  from: number;
  to?: number;
  kind: FlagKind;
  name: string | ((codePoint: number) => string);
  note: string;
}

const FLAG_RULES: FlagRule[] = [
  { from: 0xa0, kind: 'invisible', name: 'NO-BREAK SPACE', note: 'Looks like a space but never wraps. Arrives from Word, Figma and copied web pages, and breaks string comparisons.' },
  { from: 0xad, kind: 'invisible', name: 'SOFT HYPHEN', note: 'Invisible until the word wraps, then shows as a hyphen.' },
  { from: 0x61c, kind: 'invisible', name: 'ARABIC LETTER MARK', note: 'Invisible mark that steers bidirectional layout.' },
  { from: 0x1680, kind: 'invisible', name: 'OGHAM SPACE MARK', note: 'A space character from the Ogham block.' },
  { from: 0x180e, kind: 'invisible', name: 'MONGOLIAN VOWEL SEPARATOR', note: 'Zero-width format character.' },
  { from: 0x2000, to: 0x200a, kind: 'invisible', name: 'Fixed-width space', note: 'A typographic space of a specific width — not the ASCII space, and rarely what you want in data.' },
  { from: 0x200b, kind: 'invisible', name: 'ZERO WIDTH SPACE', note: 'Takes no space at all. A classic cause of “identical” strings that do not match.' },
  { from: 0x200c, kind: 'invisible', name: 'ZERO WIDTH NON-JOINER', note: 'Stops two characters from joining.' },
  { from: 0x200d, kind: 'invisible', name: 'ZERO WIDTH JOINER', note: 'Glues characters together — this is what turns several emoji into one family or profession.' },
  { from: 0x200e, kind: 'invisible', name: 'LEFT-TO-RIGHT MARK', note: 'Invisible direction mark.' },
  { from: 0x200f, kind: 'invisible', name: 'RIGHT-TO-LEFT MARK', note: 'Invisible direction mark. Used to make filenames read backwards.' },
  { from: 0x2028, kind: 'invisible', name: 'LINE SEPARATOR', note: 'A line break that is not \\n. Valid in JSON but not in older JavaScript string literals.' },
  { from: 0x2029, kind: 'invisible', name: 'PARAGRAPH SEPARATOR', note: 'A paragraph break that is not \\n\\n.' },
  { from: 0x202a, to: 0x202e, kind: 'invisible', name: 'Bidirectional override', note: 'Forces display direction. This is the “trojan source” family — text can render in an order the bytes do not have.' },
  { from: 0x202f, kind: 'invisible', name: 'NARROW NO-BREAK SPACE', note: 'A thin space that never wraps.' },
  { from: 0x205f, kind: 'invisible', name: 'MEDIUM MATHEMATICAL SPACE', note: 'A space used in mathematical typesetting.' },
  { from: 0x2060, kind: 'invisible', name: 'WORD JOINER', note: 'Zero-width, prevents a line break.' },
  { from: 0x2066, to: 0x2069, kind: 'invisible', name: 'Bidirectional isolate', note: 'Isolates a run of text for direction handling. Also part of the “trojan source” family.' },
  { from: 0x3000, kind: 'invisible', name: 'IDEOGRAPHIC SPACE', note: 'The full-width space used in CJK text.' },
  { from: 0xfe00, to: 0xfe0f, kind: 'invisible', name: 'VARIATION SELECTOR', note: 'Invisible on its own; asks for the emoji or text look of the character before it.' },
  { from: 0xfeff, kind: 'invisible', name: 'ZERO WIDTH NO-BREAK SPACE (BOM)', note: 'A byte-order mark left inside the text. At the start of a file it is usually harmless; anywhere else it is a bug.' },
  { from: 0xfffc, kind: 'invisible', name: 'OBJECT REPLACEMENT CHARACTER', note: 'A placeholder where an image or object used to be.' },
  { from: 0xfffd, kind: 'invisible', name: 'REPLACEMENT CHARACTER', note: 'Something was already lost here: a byte that could not be decoded was replaced by this.' },
  { from: 0xe0000, to: 0xe007f, kind: 'invisible', name: 'TAG CHARACTER', note: 'Invisible tag character. Used to smuggle hidden text and to build regional flags.' },

  { from: 0x2018, kind: 'lookalike', name: 'LEFT SINGLE QUOTATION MARK', note: 'A curly quote, not the ASCII apostrophe.' },
  { from: 0x2019, kind: 'lookalike', name: 'RIGHT SINGLE QUOTATION MARK', note: 'A curly quote, not the ASCII apostrophe. The usual culprit in “broken” CSV and code.' },
  { from: 0x201c, kind: 'lookalike', name: 'LEFT DOUBLE QUOTATION MARK', note: 'A curly quote, not the ASCII double quote.' },
  { from: 0x201d, kind: 'lookalike', name: 'RIGHT DOUBLE QUOTATION MARK', note: 'A curly quote, not the ASCII double quote.' },
  { from: 0x2013, kind: 'lookalike', name: 'EN DASH', note: 'Wider than a hyphen and not interchangeable with it.' },
  { from: 0x2014, kind: 'lookalike', name: 'EM DASH', note: 'Wider than a hyphen and not interchangeable with it.' },
  { from: 0x2212, kind: 'lookalike', name: 'MINUS SIGN', note: 'The typographic minus, not the ASCII hyphen — number parsers reject it.' },
  { from: 0xff01, to: 0xff5e, kind: 'lookalike', name: 'Full-width form', note: 'A full-width copy of an ASCII character, common in CJK input.' },
];

const CYRILLIC_LOOKALIKES: Record<number, string> = {
  0x410: 'A', 0x412: 'B', 0x415: 'E', 0x41a: 'K', 0x41c: 'M', 0x41d: 'H', 0x41e: 'O',
  0x420: 'P', 0x421: 'C', 0x422: 'T', 0x425: 'X', 0x430: 'a', 0x435: 'e', 0x43e: 'o',
  0x440: 'p', 0x441: 'c', 0x443: 'y', 0x445: 'x',
};

const GREEK_LOOKALIKES: Record<number, string> = {
  0x391: 'A', 0x392: 'B', 0x395: 'E', 0x396: 'Z', 0x397: 'H', 0x399: 'I', 0x39a: 'K',
  0x39c: 'M', 0x39d: 'N', 0x39f: 'O', 0x3a1: 'P', 0x3a4: 'T', 0x3a7: 'X', 0x3bf: 'o',
};

/** The flag for a code point, or null when it is an ordinary visible character. */
export function flagFor(codePoint: number): Flag | null {
  for (const rule of FLAG_RULES) {
    const to = rule.to ?? rule.from;
    if (codePoint >= rule.from && codePoint <= to) {
      return {
        kind: rule.kind,
        name: typeof rule.name === 'function' ? rule.name(codePoint) : rule.name,
        note: rule.note,
      };
    }
  }
  const cyrillic = CYRILLIC_LOOKALIKES[codePoint];
  if (cyrillic) {
    return {
      kind: 'lookalike',
      name: 'Cyrillic letter',
      note: `Looks exactly like the Latin “${cyrillic}” but is a different character. This is how spoofed domains and copied identifiers are built.`,
    };
  }
  const greek = GREEK_LOOKALIKES[codePoint];
  if (greek) {
    return {
      kind: 'lookalike',
      name: 'Greek letter',
      note: `Looks exactly like the Latin “${greek}” but is a different character.`,
    };
  }
  // Anything else the standard marks as a format character is invisible too.
  if (/\p{Cf}/u.test(String.fromCodePoint(codePoint))) {
    return { kind: 'invisible', name: 'Format character', note: 'An invisible character that controls how text around it is laid out.' };
  }
  return null;
}

// ------------------------------------------------------------------ analysis

export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function utf8Hex(char: string): string {
  return [...new TextEncoder().encode(char)]
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function utf16Hex(char: string): string {
  const units: string[] = [];
  for (let i = 0; i < char.length; i += 1) {
    units.push(char.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
  }
  return units.join(' ');
}

/** A short, honest category label. */
export function classify(char: string, codePoint: number): string {
  if (char === '\t' || char === '\n' || char === '\r') return 'Whitespace';
  if (codePoint < 0x20 || codePoint === 0x7f) return 'Control';
  if (/\p{Cf}/u.test(char)) return 'Invisible format';
  if (/\p{Zs}/u.test(char)) return 'Whitespace';
  if (/\p{Zl}|\p{Zp}/u.test(char)) return 'Separator';
  if (/\p{M}/u.test(char)) return 'Combining mark';
  if (/\p{Extended_Pictographic}/u.test(char) || /\p{Regional_Indicator}/u.test(char)) return 'Emoji';
  if (codePoint < 0x80) {
    if (/[A-Za-z]/.test(char)) return 'ASCII letter';
    if (/[0-9]/.test(char)) return 'ASCII digit';
    return 'ASCII punctuation';
  }
  if (/\p{L}/u.test(char)) return 'Letter';
  if (/\p{N}/u.test(char)) return 'Number';
  if (/\p{P}/u.test(char)) return 'Punctuation';
  if (/\p{S}/u.test(char)) return 'Symbol';
  if (/\p{Cs}/u.test(char)) return 'Surrogate half';
  if (/\p{Co}/u.test(char)) return 'Private use';
  return 'Other';
}

/** The Unicode name, for the ranges this tool can name without shipping the database. */
export function characterName(codePoint: number): string | null {
  if (codePoint < 0x20) return CONTROL_NAMES[codePoint] ?? null;
  if (codePoint === 0x7f) return 'DELETE';
  if (codePoint >= 0x41 && codePoint <= 0x5a) return `LATIN CAPITAL LETTER ${String.fromCodePoint(codePoint)}`;
  if (codePoint >= 0x61 && codePoint <= 0x7a) {
    return `LATIN SMALL LETTER ${String.fromCodePoint(codePoint).toUpperCase()}`;
  }
  if (codePoint >= 0x30 && codePoint <= 0x39) return `DIGIT ${DIGIT_NAMES[codePoint - 0x30]}`;
  const punctuation = PUNCT_NAMES[codePoint];
  if (punctuation) return punctuation;
  return flagFor(codePoint)?.name ?? null;
}

function displayFor(char: string, codePoint: number, flag: Flag | null, category: string): string {
  if (codePoint < 0x20) return String.fromCodePoint(0x2400 + codePoint); // ␀ ␉ ␊ …
  if (codePoint === 0x7f) return '␡';
  // ␠ is the plain ASCII space; ␣ stands in for every other kind of space.
  if (category === 'Whitespace') return char === ' ' ? '␠' : '␣';
  if (flag?.kind === 'invisible') return '';
  if (category === 'Combining mark') return `◌${char}`;
  return char;
}

export interface InspectResult {
  chars: CharInfo[];
  /** Total code points in the input, before the limit is applied. */
  total: number;
  truncated: boolean;
}

export const DEFAULT_LIMIT = 500;

export function inspectText(text: string, limit = DEFAULT_LIMIT): InspectResult {
  const chars: CharInfo[] = [];
  let index = 0;
  for (const char of text) {
    index += 1;
    if (chars.length >= limit) continue;
    const codePoint = char.codePointAt(0) as number;
    const category = classify(char, codePoint);
    const flag = flagFor(codePoint);
    chars.push({
      index,
      char,
      codePoint,
      hex: formatCodePoint(codePoint),
      utf8: utf8Hex(char),
      utf16: utf16Hex(char),
      byteLength: new TextEncoder().encode(char).byteLength,
      unitLength: char.length,
      category,
      name: characterName(codePoint),
      display: displayFor(char, codePoint, flag, category),
      flag,
    });
  }
  return { chars, total: index, truncated: index > chars.length };
}

export interface Summary {
  graphemes: number;
  codePoints: number;
  utf16Units: number;
  utf8Bytes: number;
  invisible: number;
  lookalike: number;
  /** False when the runtime has no Intl.Segmenter and graphemes fall back to code points. */
  exactGraphemes: boolean;
}

/** Grapheme clusters — what a person calls "a character". */
export function countGraphemes(text: string): { count: number; exact: boolean } {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const iterator = segmenter.segment(text)[Symbol.iterator]();
    let count = 0;
    while (!iterator.next().done) count += 1;
    return { count, exact: true };
  }
  return { count: [...text].length, exact: false };
}

export function summarize(text: string): Summary {
  const graphemes = countGraphemes(text);
  let invisible = 0;
  let lookalike = 0;
  for (const char of text) {
    const flag = flagFor(char.codePointAt(0) as number);
    if (flag?.kind === 'invisible') invisible += 1;
    else if (flag?.kind === 'lookalike') lookalike += 1;
  }
  return {
    graphemes: graphemes.count,
    codePoints: [...text].length,
    utf16Units: text.length,
    utf8Bytes: new TextEncoder().encode(text).byteLength,
    invisible,
    lookalike,
    exactGraphemes: graphemes.exact,
  };
}

/** A plain-text version of the table, so Copy and Save produce something useful. */
export function reportText(result: InspectResult, summary: Summary): string {
  const header = ['#', 'Char', 'Code point', 'Decimal', 'UTF-8', 'UTF-16', 'Category', 'Name'];
  const rows = result.chars.map((c) => [
    String(c.index),
    c.display || '(invisible)',
    c.hex,
    String(c.codePoint),
    c.utf8,
    c.utf16,
    c.category,
    c.name ?? '',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd();
  const out = [
    `${summary.graphemes} grapheme clusters · ${summary.codePoints} code points · ${summary.utf16Units} UTF-16 units · ${summary.utf8Bytes} UTF-8 bytes`,
    '',
    line(header),
    line(widths.map((w) => '-'.repeat(w))),
    ...rows.map(line),
  ];
  if (result.truncated) {
    out.push('', `Showing the first ${result.chars.length} of ${result.total} code points.`);
  }
  return out.join('\n');
}
