/**
 * Regex execution helpers. Kept away from React so the awkward parts — a
 * zero-length match that would otherwise loop forever, a pattern that throws,
 * an input big enough to hang the window — are testable.
 */

export const MAX_TEST_LENGTH = 100_000;
export const MAX_MATCHES = 1000;

export const FLAGS: Array<{ flag: string; label: string; hint: string }> = [
  { flag: 'g', label: 'global', hint: 'Find every match, not just the first' },
  { flag: 'i', label: 'ignore case', hint: 'Match regardless of upper or lower case' },
  { flag: 'm', label: 'multiline', hint: '^ and $ match at every line break' },
  { flag: 's', label: 'dot all', hint: '. also matches a newline' },
  { flag: 'u', label: 'unicode', hint: 'Treat the pattern as Unicode code points' },
  { flag: 'y', label: 'sticky', hint: 'Match only from the exact lastIndex position' },
];

export interface CaptureGroup {
  /** 1-based position of the group in the pattern. */
  index: number;
  name: string | null;
  value: string | undefined;
}

export interface MatchInfo {
  /** Position in the test string where the match starts. */
  index: number;
  end: number;
  text: string;
  groups: CaptureGroup[];
}

export interface MatchReport {
  matches: MatchInfo[];
  /** True when MAX_MATCHES was reached and the rest were not collected. */
  truncated: boolean;
}

/** Build a RegExp, turning the engine's terse SyntaxError into a usable sentence. */
export function compileRegex(pattern: string, flags: string): RegExp {
  if (!pattern) throw new Error('Type a pattern to test. An empty pattern matches nothing useful.');
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // "Invalid regular expression: /a(/: Unterminated group" → "Unterminated group"
    const detail = raw.includes('/: ') ? raw.slice(raw.lastIndexOf('/: ') + 3) : raw;
    throw new Error(`This pattern is not valid: ${detail.charAt(0).toUpperCase()}${detail.slice(1)}.`);
  }
}

/**
 * The name of each capturing group, in order, so a match can be labelled
 * exactly rather than guessed from `match.groups`.
 */
export function captureNames(source: string): Array<string | null> {
  const names: Array<string | null> = [];
  let inClass = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') {
      inClass = true;
      continue;
    }
    if (char !== '(') continue;

    if (source[i + 1] !== '?') {
      names.push(null);
      continue;
    }
    const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(source.slice(i));
    if (named) names.push(named[1]);
    // Anything else after "(?" is non-capturing or a lookaround.
  }

  return names;
}

function toGroups(match: RegExpExecArray, names: Array<string | null>): CaptureGroup[] {
  return match.slice(1).map((value, i) => ({
    index: i + 1,
    name: names[i] ?? null,
    value,
  }));
}

/**
 * Every match in `text`. Non-global patterns yield at most one. Zero-length
 * matches advance by one character so the loop always terminates.
 */
export function findMatches(regex: RegExp, text: string): MatchReport {
  const matches: MatchInfo[] = [];
  if (!text) return { matches, truncated: false };
  const names = captureNames(regex.source);
  // A fresh copy so a leftover lastIndex (sticky or global) can never skew the run.
  const runner = new RegExp(regex.source, regex.flags);

  if (!regex.global) {
    const single = runner.exec(text);
    if (!single) return { matches, truncated: false };
    return {
      matches: [
        {
          index: single.index,
          end: single.index + single[0].length,
          text: single[0],
          groups: toGroups(single, names),
        },
      ],
      truncated: false,
    };
  }

  runner.lastIndex = 0;
  let found: RegExpExecArray | null;
  let truncated = false;

  while ((found = runner.exec(text)) !== null) {
    matches.push({
      index: found.index,
      end: found.index + found[0].length,
      text: found[0],
      groups: toGroups(found, names),
    });
    if (found[0].length === 0) runner.lastIndex += 1;
    if (matches.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }
  }

  return { matches, truncated };
}

export interface Segment {
  text: string;
  /** Index into the match list, or null for the text between matches. */
  match: number | null;
}

/** Split the test string into plain and matched runs, ready to render. */
export function highlightSegments(text: string, matches: MatchInfo[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  matches.forEach((match, i) => {
    // Zero-length and already-covered matches contribute no visible run.
    if (match.end <= cursor) return;
    const start = Math.max(match.index, cursor);
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), match: null });
      cursor = start;
    }
    if (match.end > start) {
      segments.push({ text: text.slice(start, match.end), match: i });
      cursor = match.end;
    }
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: null });
  return segments;
}

/**
 * `String.replace` with the engine's own `$1` / `$<name>` handling. Like
 * `findMatches` it runs against a fresh copy: `String.replace` reads *and
 * writes* `lastIndex` for a sticky pattern, so reusing the caller's RegExp
 * would make the result drift on every keystroke.
 */
export function applyReplacement(regex: RegExp, text: string, replacement: string): string {
  return text.replace(new RegExp(regex.source, regex.flags), replacement);
}

export interface MatchStats {
  count: number;
  unique: number;
  coverage: number;
}

export function matchStats(matches: MatchInfo[], textLength: number): MatchStats {
  const covered = matches.reduce((total, m) => total + (m.end - m.index), 0);
  return {
    count: matches.length,
    unique: new Set(matches.map((m) => m.text)).size,
    coverage: textLength === 0 ? 0 : Math.round((covered / textLength) * 100),
  };
}
