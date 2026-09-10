export type Mode = 'json' | 'js' | 'sql' | 'shell' | 'csv' | 'regex' | 'xml';
export type Direction = 'escape' | 'unescape';

export interface ModeInfo {
  id: Mode;
  label: string;
  /** What the escaping is for, in one sentence. */
  hint: string;
  /** Label for the "wrap it" switch in this mode. */
  wrapLabel: string;
}

export const MODES: ModeInfo[] = [
  {
    id: 'json',
    label: 'JSON string',
    hint: 'Escapes ", \\ and every control character; anything below U+0020 becomes \\uXXXX. Ready to sit between double quotes in a JSON document.',
    wrapLabel: 'Wrap in double quotes',
  },
  {
    id: 'js',
    label: 'JavaScript literal',
    hint: 'Escapes all three quote characters, backslashes, control characters and ${ so the result is safe in a \', " or ` literal.',
    wrapLabel: 'Wrap in single quotes',
  },
  {
    id: 'sql',
    label: 'SQL literal',
    hint: 'Doubles every single quote, which is what the SQL standard (Postgres, SQLite, Oracle, SQL Server) expects. Never a substitute for a bound parameter.',
    wrapLabel: 'Wrap in single quotes',
  },
  {
    id: 'shell',
    label: 'Shell argument',
    hint: "Uses POSIX single quoting: every ' becomes '\\'' so the text survives sh, bash and zsh exactly as written. Keep the wrapping quotes on — the escaped form is only a complete argument with them.",
    wrapLabel: 'Wrap in single quotes',
  },
  {
    id: 'csv',
    label: 'CSV field',
    hint: 'Quotes the field when it holds the delimiter, a quote, a line break or edge spaces, doubling any quote inside — RFC 4180.',
    wrapLabel: 'Always quote the field',
  },
  {
    id: 'regex',
    label: 'Regular expression',
    hint: 'Escapes every metacharacter so the text matches itself literally, including the / that delimits a literal.',
    wrapLabel: 'Wrap in / … /',
  },
  {
    id: 'xml',
    label: 'XML / HTML attribute',
    hint: 'Escapes &, <, >, " and \' plus tabs and line breaks, which attribute values would otherwise lose.',
    wrapLabel: 'Wrap in double quotes',
  },
];

export interface Options {
  /** Wrap the escaped result in the syntax's own quotes. */
  wrap: boolean;
  /** JSON and JavaScript: turn every non-ASCII character into \uXXXX. */
  ascii: boolean;
  /** CSV only. */
  delimiter: string;
}

export const DEFAULT_OPTIONS: Options = { wrap: false, ascii: false, delimiter: ',' };

// ------------------------------------------------------------------ helpers

function unicodeEscape(ch: string): string {
  return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

function hexEscape(ch: string): string {
  return `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`;
}

function readHex(text: string, start: number, length: number, kind: string): number {
  const slice = text.slice(start, start + length);
  if (slice.length < length || !/^[0-9a-fA-F]+$/.test(slice)) {
    throw new Error(
      `Broken ${kind} escape at position ${start - 1}: “${text.slice(start - 2, start + length)}” needs ${length} hexadecimal digits.`,
    );
  }
  return parseInt(slice, 16);
}

/** Strip one matching pair of wrapping quotes, if the text has them. */
export function stripWrapping(text: string, quotes: string[]): string {
  const trimmed = text.trim();
  for (const quote of quotes) {
    if (trimmed.length >= 2 * quote.length && trimmed.startsWith(quote) && trimmed.endsWith(quote)) {
      return trimmed.slice(quote.length, trimmed.length - quote.length);
    }
  }
  return text;
}

// ------------------------------------------------------------------ JSON

const JSON_SIMPLE: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

export function escapeJson(text: string, ascii = false): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const simple = JSON_SIMPLE[ch];
    if (simple) {
      out += simple;
      continue;
    }
    const code = ch.charCodeAt(0);
    // U+2028 and U+2029 are legal JSON but break JavaScript that embeds it.
    if (code < 0x20 || code === 0x2028 || code === 0x2029 || (ascii && code > 0x7e)) {
      out += unicodeEscape(ch);
      continue;
    }
    out += ch;
  }
  return out;
}

const JSON_UNESCAPE: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

export function unescapeJson(text: string): string {
  const source = stripWrapping(text, ['"']);
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = source[i + 1];
    if (next === undefined) {
      throw new Error(`The text ends with a lone backslash at position ${i + 1}, which starts an escape that never finishes.`);
    }
    if (next === 'u') {
      out += String.fromCharCode(readHex(source, i + 2, 4, 'unicode'));
      i += 5;
      continue;
    }
    const simple = JSON_UNESCAPE[next];
    if (simple === undefined) {
      throw new Error(
        `“\\${next}” at position ${i + 1} is not a JSON escape. JSON allows \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.`,
      );
    }
    out += simple;
    i += 1;
  }
  return out;
}

// ------------------------------------------------------------------ JavaScript

const JS_SIMPLE: Record<string, string> = {
  '\\': '\\\\',
  "'": "\\'",
  '"': '\\"',
  '`': '\\`',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\v': '\\v',
};

export function escapeJs(text: string, ascii = false): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    // `${` only means anything inside a template literal, and escaping the
    // dollar keeps the result safe in all three kinds of literal.
    if (ch === '$' && text[i + 1] === '{') {
      out += '\\${';
      i += 1;
      continue;
    }
    const simple = JS_SIMPLE[ch];
    if (simple) {
      out += simple;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      out += hexEscape(ch);
      continue;
    }
    if (code === 0x2028 || code === 0x2029 || (ascii && code > 0x7e)) {
      out += unicodeEscape(ch);
      continue;
    }
    out += ch;
  }
  return out;
}

const JS_UNESCAPE: Record<string, string> = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '0': '\0',
};

export function unescapeJs(text: string): string {
  const source = stripWrapping(text, ['"', "'", '`']);
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = source[i + 1];
    if (next === undefined) {
      throw new Error(`The text ends with a lone backslash at position ${i + 1}, which starts an escape that never finishes.`);
    }
    if (next === '\n') {
      // A line continuation contributes nothing to the value.
      i += 1;
      continue;
    }
    if (next === 'x') {
      out += String.fromCharCode(readHex(source, i + 2, 2, 'hex'));
      i += 3;
      continue;
    }
    if (next === 'u') {
      if (source[i + 2] === '{') {
        const end = source.indexOf('}', i + 3);
        if (end === -1) throw new Error(`The \\u{…} escape at position ${i + 1} is missing its closing brace.`);
        const digits = source.slice(i + 3, end);
        if (!/^[0-9a-fA-F]{1,6}$/.test(digits)) {
          throw new Error(`“\\u{${digits}}” at position ${i + 1} is not a code point in hexadecimal.`);
        }
        const value = parseInt(digits, 16);
        if (value > 0x10ffff) throw new Error(`Code point U+${digits.toUpperCase()} is beyond the largest character, U+10FFFF.`);
        out += String.fromCodePoint(value);
        i = end;
        continue;
      }
      out += String.fromCharCode(readHex(source, i + 2, 4, 'unicode'));
      i += 5;
      continue;
    }
    const simple = JS_UNESCAPE[next];
    // JavaScript treats any other escaped character as itself: \q is q.
    out += simple ?? next;
    i += 1;
  }
  return out;
}

// ------------------------------------------------------------------ SQL

export function escapeSql(text: string): string {
  return text.replace(/'/g, "''");
}

export function unescapeSql(text: string): string {
  const source = stripWrapping(text, ["'"]);
  return source.replace(/''/g, "'");
}

// ------------------------------------------------------------------ shell

export function escapeShell(text: string): string {
  // Inside single quotes nothing is special, so the only trick is leaving the
  // quotes to insert an escaped one: 'it'\''s'.
  return text.replace(/'/g, `'\\''`);
}

export function unescapeShell(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) throw new Error(`The single quote at position ${i + 1} is never closed.`);
      out += text.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      i += 1;
      let closed = false;
      while (i < text.length) {
        if (text[i] === '"') {
          closed = true;
          i += 1;
          break;
        }
        if (text[i] === '\\' && '"\\$`\n'.includes(text[i + 1] ?? '')) {
          if (text[i + 1] !== '\n') out += text[i + 1];
          i += 2;
          continue;
        }
        out += text[i];
        i += 1;
      }
      if (!closed) throw new Error('A double quote is never closed.');
      continue;
    }
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) throw new Error('The text ends with a lone backslash, which escapes nothing.');
      if (next !== '\n') out += next;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// ------------------------------------------------------------------ CSV

export function escapeCsv(text: string, delimiter = ',', always = false): string {
  const needsQuotes =
    always ||
    text.includes(delimiter) ||
    text.includes('"') ||
    /[\r\n]/.test(text) ||
    text !== text.trim();
  const body = text.replace(/"/g, '""');
  return needsQuotes ? `"${body}"` : body;
}

export function unescapeCsv(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return text.replace(/""/g, '"');
}

// ------------------------------------------------------------------ regex

const REGEX_META = /[.*+?^${}()|[\]\\/]/;

export function escapeRegex(text: string): string {
  let out = '';
  for (const ch of text) {
    if (REGEX_META.test(ch)) {
      out += `\\${ch}`;
      continue;
    }
    if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\v') out += '\\v';
    else if (ch === '\0') out += '\\0';
    else out += ch;
  }
  return out;
}

const REGEX_CLASSES = 'dDwWsSbBpPkc';

const REGEX_UNESCAPE: Record<string, string> = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v', '0': '\0' };

export function unescapeRegex(text: string): string {
  const source = stripWrapping(text, ['/']);
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = source[i + 1];
    if (next === undefined) {
      throw new Error(`The pattern ends with a lone backslash at position ${i + 1}.`);
    }
    if (next === 'x') {
      out += String.fromCharCode(readHex(source, i + 2, 2, 'hex'));
      i += 3;
      continue;
    }
    if (next === 'u') {
      out += String.fromCharCode(readHex(source, i + 2, 4, 'unicode'));
      i += 5;
      continue;
    }
    if (REGEX_CLASSES.includes(next)) {
      throw new Error(
        `“\\${next}” at position ${i + 1} is a character class, not an escaped character. This text is a pattern, so there is no literal string to recover from it.`,
      );
    }
    out += REGEX_UNESCAPE[next] ?? next;
    i += 1;
  }
  return out;
}

// ------------------------------------------------------------------ XML

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};

export function escapeXml(text: string): string {
  let out = '';
  for (const ch of text) {
    const replacement = XML_ESCAPE[ch];
    if (replacement) {
      out += replacement;
      continue;
    }
    const code = ch.charCodeAt(0);
    // XML 1.0 has no way to carry the other control characters at all.
    if (code < 0x20) {
      out += `&#${code};`;
      continue;
    }
    out += ch;
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  deg: '°',
  euro: '€',
  pound: '£',
  middot: '·',
};

export function unescapeXml(text: string): string {
  const source = stripWrapping(text, ['"', "'"]);
  // One pass, so `&amp;lt;` correctly becomes `&lt;` rather than `<`.
  return source.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const value = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return match;
      return String.fromCodePoint(value);
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

// ------------------------------------------------------------------ dispatch

const WRAPPERS: Record<Mode, [string, string]> = {
  json: ['"', '"'],
  js: ["'", "'"],
  sql: ["'", "'"],
  shell: ["'", "'"],
  csv: ['', ''],
  regex: ['/', '/'],
  xml: ['"', '"'],
};

export function escapeText(text: string, mode: Mode, options: Options): string {
  const escaped = (() => {
    switch (mode) {
      case 'json':
        return escapeJson(text, options.ascii);
      case 'js':
        return escapeJs(text, options.ascii);
      case 'sql':
        return escapeSql(text);
      case 'shell':
        return escapeShell(text);
      case 'csv':
        return escapeCsv(text, options.delimiter, options.wrap);
      case 'regex':
        return escapeRegex(text);
      case 'xml':
        return escapeXml(text);
    }
  })();
  if (!options.wrap || mode === 'csv') return escaped;
  const [open, close] = WRAPPERS[mode];
  return `${open}${escaped}${close}`;
}

export function unescapeText(text: string, mode: Mode): string {
  switch (mode) {
    case 'json':
      return unescapeJson(text);
    case 'js':
      return unescapeJs(text);
    case 'sql':
      return unescapeSql(text);
    case 'shell':
      return unescapeShell(text);
    case 'csv':
      return unescapeCsv(text);
    case 'regex':
      return unescapeRegex(text);
    case 'xml':
      return unescapeXml(text);
  }
}

export function transform(text: string, mode: Mode, direction: Direction, options: Options): string {
  return direction === 'escape' ? escapeText(text, mode, options) : unescapeText(text, mode);
}
