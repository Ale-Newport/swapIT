/**
 * The ASCII table (0–127) and Latin-1 supplement (128–255), built once at
 * module load. Control codes carry their abbreviation and meaning; the 128–159
 * range also shows the character Windows-1252 puts there, because that is what
 * mojibake in a text file usually turns out to be.
 */

export interface CharRow {
  code: number;
  hex: string;
  octal: string;
  binary: string;
  /** The actual character — empty-looking for control codes. */
  char: string;
  /** What to show in the character column. */
  display: string;
  name: string;
  /** NUL, SOH, LF … for control codes. */
  abbr: string | null;
  /** &amp;, &lt; … where a named HTML entity exists. */
  entity: string | null;
  isControl: boolean;
  /** The Windows-1252 character for 128–159, which Latin-1 leaves as a control. */
  windows1252: string | null;
  /** Common escape sequence, e.g. \n for 10. */
  escape: string | null;
}

const C0: Array<[string, string, string | null]> = [
  ['NUL', 'Null', '\\0'],
  ['SOH', 'Start of heading', null],
  ['STX', 'Start of text', null],
  ['ETX', 'End of text', null],
  ['EOT', 'End of transmission', null],
  ['ENQ', 'Enquiry', null],
  ['ACK', 'Acknowledge', null],
  ['BEL', 'Bell', '\\a'],
  ['BS', 'Backspace', '\\b'],
  ['HT', 'Horizontal tab', '\\t'],
  ['LF', 'Line feed', '\\n'],
  ['VT', 'Vertical tab', '\\v'],
  ['FF', 'Form feed', '\\f'],
  ['CR', 'Carriage return', '\\r'],
  ['SO', 'Shift out', null],
  ['SI', 'Shift in', null],
  ['DLE', 'Data link escape', null],
  ['DC1', 'Device control 1 (XON)', null],
  ['DC2', 'Device control 2', null],
  ['DC3', 'Device control 3 (XOFF)', null],
  ['DC4', 'Device control 4', null],
  ['NAK', 'Negative acknowledge', null],
  ['SYN', 'Synchronous idle', null],
  ['ETB', 'End of transmission block', null],
  ['CAN', 'Cancel', null],
  ['EM', 'End of medium', null],
  ['SUB', 'Substitute', null],
  ['ESC', 'Escape', '\\e'],
  ['FS', 'File separator', null],
  ['GS', 'Group separator', null],
  ['RS', 'Record separator', null],
  ['US', 'Unit separator', null],
];

const PUNCTUATION: Record<number, string> = {
  32: 'Space',
  33: 'Exclamation mark',
  34: 'Quotation mark',
  35: 'Number sign',
  36: 'Dollar sign',
  37: 'Percent sign',
  38: 'Ampersand',
  39: 'Apostrophe',
  40: 'Left parenthesis',
  41: 'Right parenthesis',
  42: 'Asterisk',
  43: 'Plus sign',
  44: 'Comma',
  45: 'Hyphen-minus',
  46: 'Full stop',
  47: 'Solidus (slash)',
  58: 'Colon',
  59: 'Semicolon',
  60: 'Less-than sign',
  61: 'Equals sign',
  62: 'Greater-than sign',
  63: 'Question mark',
  64: 'Commercial at',
  91: 'Left square bracket',
  92: 'Reverse solidus (backslash)',
  93: 'Right square bracket',
  94: 'Circumflex accent',
  95: 'Low line (underscore)',
  96: 'Grave accent',
  123: 'Left curly bracket',
  124: 'Vertical line (pipe)',
  125: 'Right curly bracket',
  126: 'Tilde',
};

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const ASCII_ENTITIES: Record<number, string> = {
  34: '&quot;',
  38: '&amp;',
  39: '&apos;',
  60: '&lt;',
  62: '&gt;',
};

/** C1 control names for 128–159, with the Windows-1252 character at that byte. */
const C1: Array<[string, string, string | null]> = [
  ['PAD', 'Padding character', '€'],
  ['HOP', 'High octet preset', null],
  ['BPH', 'Break permitted here', '‚'],
  ['NBH', 'No break here', 'ƒ'],
  ['IND', 'Index', '„'],
  ['NEL', 'Next line', '…'],
  ['SSA', 'Start of selected area', '†'],
  ['ESA', 'End of selected area', '‡'],
  ['HTS', 'Horizontal tab set', 'ˆ'],
  ['HTJ', 'Horizontal tab with justification', '‰'],
  ['VTS', 'Vertical tab set', 'Š'],
  ['PLD', 'Partial line down', '‹'],
  ['PLU', 'Partial line up', 'Œ'],
  ['RI', 'Reverse index', null],
  ['SS2', 'Single shift 2', 'Ž'],
  ['SS3', 'Single shift 3', null],
  ['DCS', 'Device control string', null],
  ['PU1', 'Private use 1', '‘'],
  ['PU2', 'Private use 2', '’'],
  ['STS', 'Set transmit state', '“'],
  ['CCH', 'Cancel character', '”'],
  ['MW', 'Message waiting', '•'],
  ['SPA', 'Start of protected area', '–'],
  ['EPA', 'End of protected area', '—'],
  ['SOS', 'Start of string', '˜'],
  ['SGC', 'Single graphic character introducer', '™'],
  ['SCI', 'Single character introducer', 'š'],
  ['CSI', 'Control sequence introducer', '›'],
  ['ST', 'String terminator', 'œ'],
  ['OSC', 'Operating system command', null],
  ['PM', 'Privacy message', 'ž'],
  ['APC', 'Application program command', 'Ÿ'],
];

/** Entity name and character name for 160–255, in order. */
const LATIN1: Array<[string, string]> = [
  ['nbsp', 'No-break space'],
  ['iexcl', 'Inverted exclamation mark'],
  ['cent', 'Cent sign'],
  ['pound', 'Pound sign'],
  ['curren', 'Currency sign'],
  ['yen', 'Yen sign'],
  ['brvbar', 'Broken bar'],
  ['sect', 'Section sign'],
  ['uml', 'Diaeresis'],
  ['copy', 'Copyright sign'],
  ['ordf', 'Feminine ordinal indicator'],
  ['laquo', 'Left double angle quotation mark'],
  ['not', 'Not sign'],
  ['shy', 'Soft hyphen'],
  ['reg', 'Registered sign'],
  ['macr', 'Macron'],
  ['deg', 'Degree sign'],
  ['plusmn', 'Plus-minus sign'],
  ['sup2', 'Superscript two'],
  ['sup3', 'Superscript three'],
  ['acute', 'Acute accent'],
  ['micro', 'Micro sign'],
  ['para', 'Pilcrow sign'],
  ['middot', 'Middle dot'],
  ['cedil', 'Cedilla'],
  ['sup1', 'Superscript one'],
  ['ordm', 'Masculine ordinal indicator'],
  ['raquo', 'Right double angle quotation mark'],
  ['frac14', 'Vulgar fraction one quarter'],
  ['frac12', 'Vulgar fraction one half'],
  ['frac34', 'Vulgar fraction three quarters'],
  ['iquest', 'Inverted question mark'],
  ['Agrave', 'Latin capital letter A with grave'],
  ['Aacute', 'Latin capital letter A with acute'],
  ['Acirc', 'Latin capital letter A with circumflex'],
  ['Atilde', 'Latin capital letter A with tilde'],
  ['Auml', 'Latin capital letter A with diaeresis'],
  ['Aring', 'Latin capital letter A with ring above'],
  ['AElig', 'Latin capital letter AE'],
  ['Ccedil', 'Latin capital letter C with cedilla'],
  ['Egrave', 'Latin capital letter E with grave'],
  ['Eacute', 'Latin capital letter E with acute'],
  ['Ecirc', 'Latin capital letter E with circumflex'],
  ['Euml', 'Latin capital letter E with diaeresis'],
  ['Igrave', 'Latin capital letter I with grave'],
  ['Iacute', 'Latin capital letter I with acute'],
  ['Icirc', 'Latin capital letter I with circumflex'],
  ['Iuml', 'Latin capital letter I with diaeresis'],
  ['ETH', 'Latin capital letter Eth'],
  ['Ntilde', 'Latin capital letter N with tilde'],
  ['Ograve', 'Latin capital letter O with grave'],
  ['Oacute', 'Latin capital letter O with acute'],
  ['Ocirc', 'Latin capital letter O with circumflex'],
  ['Otilde', 'Latin capital letter O with tilde'],
  ['Ouml', 'Latin capital letter O with diaeresis'],
  ['times', 'Multiplication sign'],
  ['Oslash', 'Latin capital letter O with stroke'],
  ['Ugrave', 'Latin capital letter U with grave'],
  ['Uacute', 'Latin capital letter U with acute'],
  ['Ucirc', 'Latin capital letter U with circumflex'],
  ['Uuml', 'Latin capital letter U with diaeresis'],
  ['Yacute', 'Latin capital letter Y with acute'],
  ['THORN', 'Latin capital letter Thorn'],
  ['szlig', 'Latin small letter sharp s'],
  ['agrave', 'Latin small letter a with grave'],
  ['aacute', 'Latin small letter a with acute'],
  ['acirc', 'Latin small letter a with circumflex'],
  ['atilde', 'Latin small letter a with tilde'],
  ['auml', 'Latin small letter a with diaeresis'],
  ['aring', 'Latin small letter a with ring above'],
  ['aelig', 'Latin small letter ae'],
  ['ccedil', 'Latin small letter c with cedilla'],
  ['egrave', 'Latin small letter e with grave'],
  ['eacute', 'Latin small letter e with acute'],
  ['ecirc', 'Latin small letter e with circumflex'],
  ['euml', 'Latin small letter e with diaeresis'],
  ['igrave', 'Latin small letter i with grave'],
  ['iacute', 'Latin small letter i with acute'],
  ['icirc', 'Latin small letter i with circumflex'],
  ['iuml', 'Latin small letter i with diaeresis'],
  ['eth', 'Latin small letter eth'],
  ['ntilde', 'Latin small letter n with tilde'],
  ['ograve', 'Latin small letter o with grave'],
  ['oacute', 'Latin small letter o with acute'],
  ['ocirc', 'Latin small letter o with circumflex'],
  ['otilde', 'Latin small letter o with tilde'],
  ['ouml', 'Latin small letter o with diaeresis'],
  ['divide', 'Division sign'],
  ['oslash', 'Latin small letter o with stroke'],
  ['ugrave', 'Latin small letter u with grave'],
  ['uacute', 'Latin small letter u with acute'],
  ['ucirc', 'Latin small letter u with circumflex'],
  ['uuml', 'Latin small letter u with diaeresis'],
  ['yacute', 'Latin small letter y with acute'],
  ['thorn', 'Latin small letter thorn'],
  ['yuml', 'Latin small letter y with diaeresis'],
];

function numbers(code: number): Pick<CharRow, 'hex' | 'octal' | 'binary'> {
  return {
    hex: code.toString(16).toUpperCase().padStart(2, '0'),
    octal: code.toString(8).padStart(3, '0'),
    binary: code.toString(2).padStart(8, '0'),
  };
}

function asciiName(code: number): string {
  if (PUNCTUATION[code]) return PUNCTUATION[code];
  if (code >= 48 && code <= 57) return `Digit ${DIGIT_WORDS[code - 48]}`;
  if (code >= 65 && code <= 90) return `Latin capital letter ${String.fromCharCode(code)}`;
  if (code >= 97 && code <= 122) return `Latin small letter ${String.fromCharCode(code)}`;
  return `Character ${code}`;
}

function buildAscii(): CharRow[] {
  return Array.from({ length: 128 }, (_, code) => {
    const char = String.fromCharCode(code);
    if (code < 32 || code === 127) {
      const [abbr, name, escape] =
        code === 127 ? (['DEL', 'Delete', null] as [string, string, string | null]) : C0[code];
      return {
        code,
        ...numbers(code),
        char,
        display: abbr,
        name,
        abbr,
        entity: null,
        isControl: true,
        windows1252: null,
        escape,
      };
    }
    return {
      code,
      ...numbers(code),
      char,
      display: code === 32 ? 'SP' : char,
      name: asciiName(code),
      abbr: code === 32 ? 'SP' : null,
      entity: ASCII_ENTITIES[code] ?? null,
      isControl: false,
      windows1252: null,
      escape: null,
    };
  });
}

function buildLatin1(): CharRow[] {
  return Array.from({ length: 128 }, (_, offset) => {
    const code = 128 + offset;
    const char = String.fromCharCode(code);
    if (code < 160) {
      const [abbr, name, win] = C1[offset];
      return {
        code,
        ...numbers(code),
        char,
        display: abbr,
        name,
        abbr,
        entity: null,
        isControl: true,
        windows1252: win,
        escape: null,
      };
    }
    const [entity, name] = LATIN1[code - 160];
    const invisible = code === 160 || code === 173;
    return {
      code,
      ...numbers(code),
      char,
      display: invisible ? (code === 160 ? 'NBSP' : 'SHY') : char,
      name,
      abbr: invisible ? (code === 160 ? 'NBSP' : 'SHY') : null,
      entity: `&${entity};`,
      isControl: false,
      windows1252: null,
      escape: null,
    };
  });
}

export const ASCII_ROWS: CharRow[] = buildAscii();
export const LATIN1_ROWS: CharRow[] = buildLatin1();

/** Search by character, decimal or hex code, name, abbreviation or entity. */
export function searchRows(rows: CharRow[], query: string): CharRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  const asNumber = /^\d+$/.test(needle) ? Number(needle) : null;
  // Only an explicit 0x / U+ / \x marker means hexadecimal: reading a bare "65"
  // as both 65 and 0x65 would quietly add a second, unasked-for row.
  const asHex = /^(0x|u\+|\\x)[0-9a-f]{1,4}$/.test(needle)
    ? parseInt(needle.replace(/^(0x|u\+|\\x)/, ''), 16)
    : null;

  return rows.filter((row) => {
    if (asNumber !== null && row.code === asNumber) return true;
    if (asHex !== null && row.code === asHex) return true;
    if (needle.length === 1 && row.char === query.trim()) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      (row.abbr?.toLowerCase() === needle) ||
      (row.abbr?.toLowerCase().includes(needle) ?? false) ||
      (row.entity?.toLowerCase().includes(needle) ?? false) ||
      (row.escape?.toLowerCase() === needle) ||
      row.binary === needle ||
      row.octal === needle
    );
  });
}
