/**
 * HTML entity encoding and decoding, all of it local.
 *
 * Encoding uses the table below. Decoding resolves each entity through the
 * table first and falls back to the browser's own HTML parser (`DOMParser`) for
 * the ~2,000 names HTML5 defines but nobody wants to ship a copy of — which
 * also means the app's answer is exactly what a browser would render.
 */

export type EncodeMode = 'essential' | 'named' | 'decimal' | 'hex' | 'nonAscii';

/** The five that actually change how markup parses. */
const ESSENTIAL: Record<string, string> = {
  '&': 'amp',
  '<': 'lt',
  '>': 'gt',
  '"': 'quot',
  "'": 'apos',
};

// Latin-1 supplement, U+00A0 to U+00FF, in order.
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr ' +
  'deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
  'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml ' +
  'eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';

// U+0391 to U+03A9, with U+03A2 (which does not exist) skipped.
const GREEK_UPPER = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho Sigma Tau Upsilon Phi Chi Psi Omega';
// U+03B1 to U+03C9.
const GREEK_LOWER = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega';

const MISC: Array<[number, string]> = [
  [0x152, 'OElig'], [0x153, 'oelig'], [0x160, 'Scaron'], [0x161, 'scaron'], [0x178, 'Yuml'],
  [0x192, 'fnof'], [0x2c6, 'circ'], [0x2dc, 'tilde'], [0x3d1, 'thetasym'], [0x3d2, 'upsih'], [0x3d6, 'piv'],
  [0x2002, 'ensp'], [0x2003, 'emsp'], [0x2009, 'thinsp'], [0x200c, 'zwnj'], [0x200d, 'zwj'],
  [0x200e, 'lrm'], [0x200f, 'rlm'], [0x2013, 'ndash'], [0x2014, 'mdash'],
  [0x2018, 'lsquo'], [0x2019, 'rsquo'], [0x201a, 'sbquo'], [0x201c, 'ldquo'], [0x201d, 'rdquo'], [0x201e, 'bdquo'],
  [0x2020, 'dagger'], [0x2021, 'Dagger'], [0x2022, 'bull'], [0x2026, 'hellip'], [0x2030, 'permil'],
  [0x2032, 'prime'], [0x2033, 'Prime'], [0x2039, 'lsaquo'], [0x203a, 'rsaquo'], [0x203e, 'oline'],
  [0x2044, 'frasl'], [0x20ac, 'euro'], [0x2111, 'image'], [0x2118, 'weierp'], [0x211c, 'real'],
  [0x2122, 'trade'], [0x2135, 'alefsym'],
  [0x2190, 'larr'], [0x2191, 'uarr'], [0x2192, 'rarr'], [0x2193, 'darr'], [0x2194, 'harr'], [0x21b5, 'crarr'],
  [0x21d0, 'lArr'], [0x21d1, 'uArr'], [0x21d2, 'rArr'], [0x21d3, 'dArr'], [0x21d4, 'hArr'],
  [0x2200, 'forall'], [0x2202, 'part'], [0x2203, 'exist'], [0x2205, 'empty'], [0x2207, 'nabla'],
  [0x2208, 'isin'], [0x2209, 'notin'], [0x220b, 'ni'], [0x220f, 'prod'], [0x2211, 'sum'], [0x2212, 'minus'],
  [0x2217, 'lowast'], [0x221a, 'radic'], [0x221d, 'prop'], [0x221e, 'infin'], [0x2220, 'ang'],
  [0x2227, 'and'], [0x2228, 'or'], [0x2229, 'cap'], [0x222a, 'cup'], [0x222b, 'int'], [0x2234, 'there4'],
  [0x223c, 'sim'], [0x2245, 'cong'], [0x2248, 'asymp'], [0x2260, 'ne'], [0x2261, 'equiv'],
  [0x2264, 'le'], [0x2265, 'ge'], [0x2282, 'sub'], [0x2283, 'sup'], [0x2284, 'nsub'], [0x2286, 'sube'],
  [0x2287, 'supe'], [0x2295, 'oplus'], [0x2297, 'otimes'], [0x22a5, 'perp'], [0x22c5, 'sdot'],
  [0x2308, 'lceil'], [0x2309, 'rceil'], [0x230a, 'lfloor'], [0x230b, 'rfloor'],
  [0x2329, 'lang'], [0x232a, 'rang'], [0x25ca, 'loz'],
  [0x2660, 'spades'], [0x2663, 'clubs'], [0x2665, 'hearts'], [0x2666, 'diams'],
];

function buildTable(): { charToName: Map<string, string>; nameToChar: Map<string, string> } {
  const charToName = new Map<string, string>();
  const nameToChar = new Map<string, string>();
  const add = (codePoint: number, name: string) => {
    const char = String.fromCodePoint(codePoint);
    if (!charToName.has(char)) charToName.set(char, name);
    nameToChar.set(name, char);
  };
  for (const [char, name] of Object.entries(ESSENTIAL)) add(char.codePointAt(0) as number, name);
  // `&quot;` is the canonical name for U+0022, but `&apos;` and `&#39;` are both
  // written for U+0027; the table keeps the first one added.
  LATIN1.split(/\s+/).forEach((name, i) => add(0xa0 + i, name));
  GREEK_UPPER.split(/\s+/).forEach((name, i) => add(0x391 + i + (i >= 17 ? 1 : 0), name));
  GREEK_LOWER.split(/\s+/).forEach((name, i) => add(0x3b1 + i, name));
  for (const [codePoint, name] of MISC) add(codePoint, name);
  return { charToName, nameToChar };
}

const { charToName: CHAR_TO_NAME, nameToChar: NAME_TO_CHAR } = buildTable();

/** How many characters this tool can write as a named entity. */
export const NAMED_COUNT = CHAR_TO_NAME.size;

function numericEntity(codePoint: number, hex: boolean): string {
  return hex ? `&#x${codePoint.toString(16).toUpperCase()};` : `&#${codePoint};`;
}

function encodeChar(char: string, mode: EncodeMode): string {
  const codePoint = char.codePointAt(0) as number;
  const essential = ESSENTIAL[char];
  switch (mode) {
    case 'essential':
      return essential ? `&${essential};` : char;
    case 'named': {
      const name = essential ?? CHAR_TO_NAME.get(char);
      return name ? `&${name};` : char;
    }
    case 'decimal':
    case 'hex': {
      const hex = mode === 'hex';
      if (essential) return numericEntity(codePoint, hex);
      if (char === '\n' || char === '\r' || char === '\t') return char;
      if (codePoint < 0x20 || codePoint > 0x7e) return numericEntity(codePoint, hex);
      return char;
    }
    case 'nonAscii': {
      if (codePoint < 0x80) return char;
      const name = CHAR_TO_NAME.get(char);
      return name ? `&${name};` : numericEntity(codePoint, false);
    }
  }
}

/** Encode by code point, so an emoji becomes one entity rather than two halves. */
export function encodeEntities(text: string, mode: EncodeMode): string {
  let out = '';
  for (const char of text) out += encodeChar(char, mode);
  return out;
}

/** How many entities an encode pass wrote. */
export function countEntities(text: string): number {
  return (text.match(/&(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g) ?? []).length;
}

// ------------------------------------------------------------------ decoding

const domCache = new Map<string, string | null>();

/**
 * Resolve one named entity. The table answers instantly for everything common;
 * anything else is handed to the browser's HTML parser, which knows the full
 * HTML5 list. In a plain JS runtime (the tests) the table is the whole answer.
 */
export function resolveNamed(name: string): string | null {
  const known = NAME_TO_CHAR.get(name);
  if (known !== undefined) return known;
  if (typeof DOMParser === 'undefined') return null;
  if (domCache.has(name)) return domCache.get(name) ?? null;
  const source = `&${name};`;
  let resolved: string | null = null;
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const text = doc.documentElement.textContent ?? '';
    resolved = text === source || text === '' ? null : text;
  } catch {
    resolved = null;
  }
  domCache.set(name, resolved);
  return resolved;
}

export interface DecodeReport {
  output: string;
  /** Entities successfully turned back into characters. */
  decoded: number;
  /** Entity names that mean nothing, left in the text untouched. */
  unknown: string[];
  /** `&nbsp` written without its semicolon — found, reported, left alone. */
  missingSemicolon: string[];
}

const ENTITY = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;

function decodeNumeric(token: string): string {
  const hex = token[1] === 'x' || token[1] === 'X';
  const codePoint = parseInt(hex ? token.slice(2) : token.slice(1), hex ? 16 : 10);
  if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) {
    throw new Error(
      `“&${token};” is not a character: the highest code point Unicode defines is 1114111 (U+10FFFF).`,
    );
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    throw new Error(
      `“&${token};” points at a surrogate half (U+D800–U+DFFF), which is never a character on its own. It was probably meant to be part of a surrogate pair — use the real code point instead, for example &#128512; for 😀.`,
    );
  }
  if (codePoint === 0) {
    throw new Error('“&#0;” is a null character, which HTML does not allow. Remove it from the source.');
  }
  return String.fromCodePoint(codePoint);
}

/**
 * Decode named, decimal and hexadecimal entities. Markup around them survives —
 * only the entity tokens themselves are replaced — and anything unrecognised is
 * reported rather than quietly deleted.
 */
export function decodeEntities(text: string): DecodeReport {
  const unknown = new Set<string>();
  let decoded = 0;
  const output = text.replace(ENTITY, (match, token: string) => {
    if (token.startsWith('#')) {
      decoded += 1;
      return decodeNumeric(token);
    }
    const resolved = resolveNamed(token);
    if (resolved === null) {
      unknown.add(match);
      return match;
    }
    decoded += 1;
    return resolved;
  });
  return {
    output,
    decoded,
    unknown: [...unknown],
    missingSemicolon: findMissingSemicolons(text),
  };
}

/**
 * `&nbsp` without the semicolon is everywhere in hand-written HTML. Browsers
 * decode a legacy handful of those; this tool does not guess, but it says so.
 */
export function findMissingSemicolons(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/&([a-zA-Z][a-zA-Z0-9]{1,30})/g)) {
    const raw = match[1];
    const after = text[(match.index ?? 0) + match[0].length];
    // A trailing semicolon means this is a real entity token — decoded above,
    // or reported as unknown. Only the bare ones are interesting here.
    if (after === ';') continue;
    for (let length = raw.length; length >= 2; length -= 1) {
      const name = raw.slice(0, length);
      if (NAME_TO_CHAR.has(name)) {
        found.add(`&${name}`);
        break;
      }
    }
  }
  return [...found];
}
