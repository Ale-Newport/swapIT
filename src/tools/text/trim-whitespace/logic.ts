export interface TrimOptions {
  trim: 'none' | 'leading' | 'trailing' | 'both';
  /** Squeeze runs of spaces or tabs inside a line down to one space. */
  collapseSpaces: boolean;
  tabs: 'keep' | 'tabs-to-spaces' | 'spaces-to-tabs';
  tabWidth: number;
  lineEndings: 'keep' | 'lf' | 'crlf';
  /** Remove zero-width characters and turn exotic spaces into normal ones. */
  stripInvisible: boolean;
}

export interface TrimResult {
  output: string;
  /** Invisible formatting characters removed. */
  zeroWidth: number;
  /** Non-breaking and other exotic spaces turned into ordinary spaces. */
  exoticSpaces: number;
  /** Lines whose leading or trailing whitespace changed. */
  linesTrimmed: number;
  /** Runs of internal whitespace squeezed to a single space. */
  runsCollapsed: number;
}

/** Soft hyphen, zero-width family, bidi controls and the BOM. */
export const ZERO_WIDTH_RE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
/** No-break space, narrow/figure/en/em spaces and the ideographic space. */
export const EXOTIC_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function expandTabs(text: string, width: number): string {
  return text.replace(/\t/g, ' '.repeat(Math.max(1, width)));
}

/** Turn leading indentation into tabs of `width` spaces, keeping any remainder. */
function indentToTabs(line: string, width: number): string {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? '';
  if (!lead) return line;
  const spaces = expandTabs(lead, width).length;
  const size = Math.max(1, width);
  return '\t'.repeat(Math.floor(spaces / size)) + ' '.repeat(spaces % size) + line.slice(lead.length);
}

export function trimWhitespace(text: string, opts: TrimOptions): TrimResult {
  let working = text;
  let zeroWidth = 0;
  let exoticSpaces = 0;

  if (opts.stripInvisible) {
    zeroWidth = countMatches(working, ZERO_WIDTH_RE);
    exoticSpaces = countMatches(working, EXOTIC_SPACE_RE);
    working = working.replace(ZERO_WIDTH_RE, '').replace(EXOTIC_SPACE_RE, ' ');
  }

  const hadCrlf = /\r\n/.test(working);
  const lines = working.split(/\r\n|\r|\n/);

  let linesTrimmed = 0;
  let runsCollapsed = 0;

  const processed = lines.map((original) => {
    let line = original;

    if (opts.tabs === 'tabs-to-spaces') line = expandTabs(line, opts.tabWidth);
    else if (opts.tabs === 'spaces-to-tabs') line = indentToTabs(line, opts.tabWidth);

    if (opts.collapseSpaces) {
      const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
      const rest = line.slice(indent.length);
      runsCollapsed += countMatches(rest, /[ \t]{2,}/g);
      line = indent + rest.replace(/[ \t]{2,}/g, ' ');
    }

    const beforeTrim = line;
    if (opts.trim === 'both') line = line.trim();
    else if (opts.trim === 'leading') line = line.replace(/^\s+/, '');
    else if (opts.trim === 'trailing') line = line.replace(/\s+$/, '');
    if (line !== beforeTrim) linesTrimmed += 1;

    return line;
  });

  const ending = opts.lineEndings === 'crlf' ? '\r\n' : opts.lineEndings === 'lf' ? '\n' : hadCrlf ? '\r\n' : '\n';

  return {
    output: processed.join(ending),
    zeroWidth,
    exoticSpaces,
    linesTrimmed,
    runsCollapsed,
  };
}
