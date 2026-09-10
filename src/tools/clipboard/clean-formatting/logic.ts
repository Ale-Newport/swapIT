/**
 * Undoing what a word processor, a PDF or a web page did to text on its way to
 * the clipboard: curly quotes, typographic dashes, spaces that are not spaces,
 * characters with no width at all, and paragraphs broken into fixed-width lines.
 *
 * Every step counts what it touched so the tool can say what it actually did.
 */

export interface CleanOptions {
  /** ' ' " " → ' " */
  straightQuotes: boolean;
  /** — – … → - - ... */
  plainPunctuation: boolean;
  /** Non-breaking and other exotic spaces → an ordinary space. */
  normalSpaces: boolean;
  /** Zero-width spaces, soft hyphens and byte-order marks. */
  removeInvisible: boolean;
  /** Spaces and tabs left at the end of a line. */
  trimTrailing: boolean;
  /** Join lines that were hard-wrapped in the middle of a sentence. */
  unwrapLines: boolean;
  /** Runs of blank lines become a single blank line. */
  collapseBlankLines: boolean;
}

export const DEFAULT_OPTIONS: CleanOptions = {
  straightQuotes: true,
  plainPunctuation: true,
  normalSpaces: true,
  removeInvisible: true,
  trimTrailing: true,
  unwrapLines: false,
  collapseBlankLines: true,
};

export interface CleanChange {
  id: string;
  label: string;
  count: number;
}

export interface CleanResult {
  output: string;
  changes: CleanChange[];
  /** Total number of individual edits, for the headline count. */
  total: number;
}

// Written as escape sequences on purpose: several of these are invisible in an editor.
/** Left and right single quotes, low quotes, and the prime used for feet and minutes. */
const SMART_SINGLE = /[\u2018\u2019\u201A\u201B\u2032]/g;
/** Left and right double quotes, low quotes, and the double prime used for inches. */
const SMART_DOUBLE = /[\u201C\u201D\u201E\u201F\u2033]/g;
/** Figure dash, en dash, em dash, horizontal bar and the minus sign. */
const FANCY_DASH = /[\u2012\u2013\u2014\u2015\u2212]/g;
const ELLIPSIS = /\u2026/g;
/** No-break space, ogham space, the quad and thin space family, narrow and ideographic spaces. */
const EXOTIC_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
/**
 * Zero-width space, word joiner, byte-order mark and soft hyphen — characters
 * that carry no meaning and only cause trouble in a search box or a form.
 *
 * The zero-width joiner and non-joiner are deliberately left alone: they hold
 * emoji families together and separate letters in Persian, Hindi and Kurdish.
 */
const INVISIBLE = /[\u200B\u2060\uFEFF\u00AD]/g;
const TRAILING = /[ \t]+$/gm;

/**
 * A line shorter than this was almost certainly ended on purpose, so it is never
 * joined to the next one. Hard wrapping happens at 60–80 columns.
 */
const WRAPPED_LINE_MIN = 45;

/** Markdown-ish line starts that must keep their own line. */
const BLOCK_START = /^\s*(?:[-*+•>]|\d+[.)]|#{1,6}\s|\|)/;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Join hard-wrapped lines back into paragraphs, conservatively. */
export function unwrap(text: string): { output: string; joins: number } {
  const lines = text.split('\n');
  const out: string[] = [];
  let joins = 0;

  for (const line of lines) {
    const previous = out.length > 0 ? out[out.length - 1] : null;
    const trimmedLine = line.trim();

    const startsNewBlock =
      previous === null ||
      previous.trim() === '' ||
      trimmedLine === '' ||
      BLOCK_START.test(line) ||
      /^\s{2,}/.test(line) ||
      BLOCK_START.test(previous);

    if (startsNewBlock) {
      out.push(line);
      continue;
    }

    const head = previous.replace(/\s+$/, '');
    // "exam-\nple" is one word broken by the wrapper.
    if (/[\p{L}]-$/u.test(head) && /^[\p{Ll}]/u.test(trimmedLine)) {
      out[out.length - 1] = head.slice(0, -1) + trimmedLine;
      joins += 1;
      continue;
    }
    if (head.length < WRAPPED_LINE_MIN) {
      out.push(line);
      continue;
    }
    out[out.length - 1] = `${head} ${trimmedLine}`;
    joins += 1;
  }

  return { output: out.join('\n'), joins };
}

export function cleanText(input: string, options: CleanOptions): CleanResult {
  const changes: CleanChange[] = [];
  const note = (id: string, label: string, n: number) => {
    if (n > 0) changes.push({ id, label, count: n });
  };

  let text = input;

  const carriageReturns = count(text, /\r/g);
  if (carriageReturns > 0) {
    text = text.replace(/\r\n?/g, '\n');
    note('lineEndings', 'Windows line breaks normalised', carriageReturns);
  }

  if (options.removeInvisible) {
    const n = count(text, INVISIBLE);
    text = text.replace(INVISIBLE, '');
    note('invisible', 'Invisible characters removed', n);
  }

  if (options.normalSpaces) {
    const n = count(text, EXOTIC_SPACE);
    text = text.replace(EXOTIC_SPACE, ' ');
    note('spaces', 'Non-breaking spaces replaced', n);
  }

  if (options.straightQuotes) {
    const n = count(text, SMART_SINGLE) + count(text, SMART_DOUBLE);
    text = text.replace(SMART_SINGLE, "'").replace(SMART_DOUBLE, '"');
    note('quotes', 'Curly quotes straightened', n);
  }

  if (options.plainPunctuation) {
    const n = count(text, FANCY_DASH) + count(text, ELLIPSIS);
    text = text.replace(FANCY_DASH, '-').replace(ELLIPSIS, '...');
    note('punctuation', 'Dashes and ellipses simplified', n);
  }

  if (options.trimTrailing) {
    const n = count(text, TRAILING);
    text = text.replace(TRAILING, '');
    note('trailing', 'Lines with trailing spaces trimmed', n);
  }

  if (options.unwrapLines) {
    const result = unwrap(text);
    text = result.output;
    note('unwrapped', 'Wrapped lines joined', result.joins);
  }

  if (options.collapseBlankLines) {
    let removed = 0;
    text = text.replace(/\n{3,}/g, (match) => {
      removed += match.length - 2;
      return '\n\n';
    });
    note('blankLines', 'Extra blank lines removed', removed);
  }

  return { output: text, changes, total: changes.reduce((sum, c) => sum + c.count, 0) };
}
