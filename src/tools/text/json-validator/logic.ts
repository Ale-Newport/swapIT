export interface ErrorLocation {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** 0-based offset into the text, when it could be worked out. */
  index: number | null;
}

export interface JsonError extends ErrorLocation {
  /** The engine's explanation with the position clause stripped off. */
  reason: string;
  lineText: string;
}

export interface DuplicateKey {
  /** Path of the object holding the key, e.g. `$.users[0]`. */
  path: string;
  key: string;
  /** 1-based line of every occurrence, in document order. */
  lines: number[];
}

export interface JsonStats {
  type: string;
  nodes: number;
  depth: number;
  objects: number;
  arrays: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
  keys: number;
}

export function lineColumnFromIndex(text: string, index: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(index, text.length));
  const before = text.slice(0, clamped);
  const lastNewline = before.lastIndexOf('\n');
  return { line: before.split('\n').length, column: clamped - lastNewline };
}

export function indexFromLineColumn(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  let index = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) index += lines[i].length + 1;
  return index + Math.max(0, column - 1);
}

/**
 * Every engine words a JSON syntax error differently and puts the position in a
 * different place — V8 says "at position 42", sometimes followed by
 * "(line 3 column 5)", Firefox says "at line 3 column 5 of the JSON data", and
 * older Safari says nothing at all. Pull out whichever form is present.
 */
export function parseErrorLocation(message: string, text: string): ErrorLocation | null {
  const lineColumn = /line (\d+) column (\d+)/i.exec(message);
  if (lineColumn) {
    const line = Number(lineColumn[1]);
    const column = Number(lineColumn[2]);
    return { line, column, index: indexFromLineColumn(text, line, column) };
  }
  const position = /position (\d+)/i.exec(message);
  if (position) {
    const index = Number(position[1]);
    return { ...lineColumnFromIndex(text, index), index };
  }
  return null;
}

/** Strip the machine-oriented position clause so the sentence reads cleanly. */
export function cleanErrorMessage(message: string): string {
  return message
    .replace(/^JSON\.parse:\s*/i, '')
    .replace(/\s*in JSON at position \d+(\s*\(line \d+ column \d+\))?/i, '')
    .replace(/\s*at line \d+ column \d+ of the JSON data\.?/i, '')
    .replace(/\s*\(line \d+ column \d+\)/i, '')
    .trim()
    .replace(/^JSON Parse error:\s*/i, '');
}

export function describeError(message: string, text: string): JsonError {
  const located = parseErrorLocation(message, text);
  const line = located?.line ?? 1;
  const lines = text.split('\n');
  return {
    reason: cleanErrorMessage(message) || 'The text is not valid JSON',
    line,
    column: located?.column ?? 1,
    index: located?.index ?? null,
    lineText: lines[line - 1] ?? '',
  };
}

// ------------------------------------------------------------------- JSONC

export interface JsoncScan {
  /**
   * The source with comments and trailing commas replaced by spaces. Blanking
   * rather than deleting keeps every offset — and therefore every line and
   * column a parse error reports — identical to the original text.
   */
  text: string;
  comments: number;
  trailingCommas: number;
}

/** True when the scan actually had to change something. */
export function isRelaxed(scan: JsoncScan): boolean {
  return scan.comments > 0 || scan.trailingCommas > 0;
}

/**
 * `.jsonc` files are JSON plus `//` and block comments and trailing commas —
 * strict `JSON.parse` refuses all three. This blanks them out so the document
 * underneath can be checked, and counts what it removed so the report can say
 * the file is not strict JSON.
 */
export function stripJsonc(source: string): JsoncScan {
  const blanks: Array<[number, number]> = [];
  let comments = 0;
  let trailingCommas = 0;
  /** Index of the last comma seen with only whitespace or comments after it. */
  let pendingComma: number | null = null;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === '"') {
      i++;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        i++;
        if (c === '"') break;
      }
      pendingComma = null;
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n') i++;
      blanks.push([start, i]);
      comments++;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i = Math.min(source.length, i + 2);
      blanks.push([start, i]);
      comments++;
      continue;
    }

    if (ch === ',') {
      pendingComma = i;
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      if (pendingComma !== null) {
        blanks.push([pendingComma, pendingComma + 1]);
        trailingCommas++;
      }
      pendingComma = null;
      i++;
      continue;
    }

    if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') pendingComma = null;
    i++;
  }

  if (blanks.length === 0) return { text: source, comments: 0, trailingCommas: 0 };

  blanks.sort((a, b) => a[0] - b[0]);
  let text = '';
  let last = 0;
  for (const [start, end] of blanks) {
    if (start < last) continue;
    text += source.slice(last, start) + source.slice(start, end).replace(/[^\n]/g, ' ');
    last = end;
  }
  text += source.slice(last);
  return { text, comments, trailingCommas };
}

/** "2 comments and 1 trailing comma", for the report. */
export function describeRelaxation(scan: JsoncScan): string {
  const parts: string[] = [];
  if (scan.comments > 0) parts.push(`${scan.comments} comment${scan.comments === 1 ? '' : 's'}`);
  if (scan.trailingCommas > 0) {
    parts.push(`${scan.trailingCommas} trailing comma${scan.trailingCommas === 1 ? '' : 's'}`);
  }
  return parts.join(' and ');
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Node counts, nesting depth and a per-type breakdown of a parsed document. */
export function analyzeJson(value: unknown): JsonStats {
  const stats: JsonStats = {
    type: describeType(value),
    nodes: 0,
    depth: 0,
    objects: 0,
    arrays: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0,
    keys: 0,
  };

  const walk = (node: unknown, depth: number): void => {
    stats.nodes++;
    if (depth > stats.depth) stats.depth = depth;
    if (node === null) {
      stats.nulls++;
      return;
    }
    if (Array.isArray(node)) {
      stats.arrays++;
      for (const item of node) walk(item, depth + 1);
      return;
    }
    switch (typeof node) {
      case 'object': {
        stats.objects++;
        const entries = Object.entries(node as Record<string, unknown>);
        stats.keys += entries.length;
        for (const [, item] of entries) walk(item, depth + 1);
        return;
      }
      case 'string':
        stats.strings++;
        return;
      case 'number':
        stats.numbers++;
        return;
      case 'boolean':
        stats.booleans++;
        return;
      default:
        return;
    }
  };

  walk(value, 1);
  return stats;
}

// ------------------------------------------------------------ duplicate keys

type TokenType = 'punct' | 'string' | 'literal';

interface Token {
  type: TokenType;
  value: string;
  line: number;
}

const PUNCT = '{}[]:,';
const WHITESPACE = ' \t\r\n';

function decodeString(raw: string): string {
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw.slice(1, -1);
  }
}

/** A forgiving scanner: it never throws, it just stops making sense. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (WHITESPACE.includes(ch)) {
      i++;
      continue;
    }
    if (PUNCT.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, line });
      i++;
      continue;
    }
    if (ch === '"') {
      const start = i;
      const startLine = line;
      i++;
      while (i < text.length) {
        const c = text[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        if (c === '\n') line++;
        i++;
      }
      tokens.push({ type: 'string', value: decodeString(text.slice(start, i)), line: startLine });
      continue;
    }
    const start = i;
    while (i < text.length && !PUNCT.includes(text[i]) && !WHITESPACE.includes(text[i])) i++;
    if (i === start) i++;
    tokens.push({ type: 'literal', value: text.slice(start, i), line });
  }
  return tokens;
}

/**
 * `JSON.parse` silently keeps the last of two identical keys, so a document can
 * be perfectly valid and still lose data. Scanning the raw text is the only way
 * to see it.
 */
export function findDuplicateKeys(text: string): DuplicateKey[] {
  const tokens = tokenize(text);
  const found: DuplicateKey[] = [];
  let p = 0;

  const parseValue = (path: string): void => {
    const token = tokens[p];
    if (!token) return;
    if (token.type === 'punct' && token.value === '{') {
      p++;
      parseObject(path);
      return;
    }
    if (token.type === 'punct' && token.value === '[') {
      p++;
      parseArray(path);
      return;
    }
    p++;
  };

  const parseObject = (path: string): void => {
    const seen = new Map<string, number[]>();
    while (p < tokens.length) {
      const token = tokens[p];
      if (token.type === 'punct' && token.value === '}') {
        p++;
        break;
      }
      if (token.type !== 'string') {
        p++;
        continue;
      }
      p++;
      if (tokens[p]?.type === 'punct' && tokens[p]?.value === ':') p++;
      const lines = seen.get(token.value);
      if (lines) lines.push(token.line);
      else seen.set(token.value, [token.line]);
      parseValue(path === '$' ? `$.${token.value}` : `${path}.${token.value}`);
    }
    for (const [key, lines] of seen) {
      if (lines.length > 1) found.push({ path, key, lines });
    }
  };

  const parseArray = (path: string): void => {
    let index = 0;
    while (p < tokens.length) {
      const token = tokens[p];
      if (token.type === 'punct' && token.value === ']') {
        p++;
        break;
      }
      if (token.type === 'punct' && token.value === ',') {
        p++;
        continue;
      }
      const before = p;
      parseValue(`${path}[${index}]`);
      if (p === before) p++;
      index++;
    }
  };

  parseValue('$');
  return found;
}
