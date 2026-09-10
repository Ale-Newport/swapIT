export interface RegexMatch {
  index: number;
  line: number;
  text: string;
  groups: string[];
}

export interface RegexScan {
  matches: RegexMatch[];
  total: number;
  /** True when the scan stopped at the safety limit instead of the end. */
  truncated: boolean;
}

/** Text longer than this makes a backtracking pattern genuinely dangerous. */
export const LARGE_INPUT = 200_000;
const MAX_SCAN = 100_000;

export function buildRegex(pattern: string, flags: string): RegExp {
  if (!pattern) throw new Error('Enter a pattern to search for.');
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    const detail = err instanceof Error ? err.message.replace(/^Invalid regular expression:?\s*/i, '') : String(err);
    throw new Error(
      `That pattern is not valid regular expression syntax (${detail}). Check for an unbalanced bracket, a stray backslash, or a flag the pattern does not allow.`,
    );
  }
}

function withGlobal(re: RegExp): RegExp {
  return re.flags.includes('g') ? new RegExp(re.source, re.flags) : new RegExp(re.source, re.flags + 'g');
}

/** Turn the escapes people actually type in a replacement box into real characters. */
export function unescapeReplacement(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '\\' || i === text.length - 1) {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === 'n') out += '\n';
    else if (next === 't') out += '\t';
    else if (next === 'r') out += '\r';
    else if (next === '\\') out += '\\';
    else {
      out += ch + next;
    }
    i += 1;
  }
  return out;
}

export function scanMatches(re: RegExp, input: string, limit = 20): RegexScan {
  const global = withGlobal(re);
  global.lastIndex = 0;
  const matches: RegexMatch[] = [];
  let total = 0;
  let truncated = false;
  let found: RegExpExecArray | null;

  while ((found = global.exec(input)) !== null) {
    total += 1;
    if (matches.length < limit) {
      matches.push({
        index: found.index,
        line: input.slice(0, found.index).split('\n').length,
        text: found[0],
        groups: found.slice(1).map((g) => (g === undefined ? '' : g)),
      });
    }
    // A pattern that can match nothing would spin forever otherwise.
    if (found[0] === '') global.lastIndex += 1;
    if (total >= MAX_SCAN) {
      truncated = true;
      break;
    }
  }

  return { matches, total, truncated };
}

/**
 * True when the pattern quantifies a group that already contains a quantifier
 * or an alternation — `(a+)+`, `(\s*\w+)*`, `(a|a)+`. That is the shape whose
 * backtracking doubles with every extra character of input, so it is the shape
 * that must never be run anywhere it cannot be abandoned.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] === '\\') {
      i += 1;
      continue;
    }
    if (pattern[i] !== '(') continue;
    let depth = 1;
    let body = '';
    let j = i + 1;
    for (; j < pattern.length; j += 1) {
      const ch = pattern[j];
      if (ch === '\\') {
        body += ch + (pattern[j + 1] ?? '');
        j += 1;
        continue;
      }
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      body += ch;
    }
    const after = pattern[j + 1] ?? '';
    if ((after === '*' || after === '+' || after === '{') && /[*+|]|\{\d+,/.test(body)) return true;
  }
  return false;
}

export function applyReplace(re: RegExp, input: string, replacement: string): string {
  // Re-created so a stale lastIndex from the scan cannot skip the first match.
  return input.replace(new RegExp(re.source, re.flags), replacement);
}
