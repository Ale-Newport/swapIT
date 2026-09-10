export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Replace only the first occurrence instead of every one. */
  firstOnly: boolean;
}

export interface Range {
  start: number;
  end: number;
}

export interface Segment {
  text: string;
  /** True for the matched (or replaced) run, so the preview can highlight it. */
  hit: boolean;
}

export interface FindReplaceResult {
  output: string;
  /** Occurrences found in the input. */
  count: number;
  /** Occurrences actually replaced. */
  replaced: number;
  inputSegments: Segment[];
  outputSegments: Segment[];
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  return !WORD_CHAR.test(before) && !WORD_CHAR.test(after);
}

/** Every non-overlapping occurrence of `find`, left to right. */
export function findOccurrences(input: string, find: string, opts: Pick<FindOptions, 'caseSensitive' | 'wholeWord'>): Range[] {
  if (!find || !input) return [];
  const ranges: Range[] = [];
  const needle = opts.caseSensitive ? find : find.toLowerCase();
  const hay = opts.caseSensitive ? input : input.toLowerCase();

  if (hay.length === input.length) {
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const end = i + find.length;
      if (!opts.wholeWord || isBoundary(input, i, end)) ranges.push({ start: i, end });
      i = hay.indexOf(needle, i + find.length);
    }
    return ranges;
  }

  // A few characters change length when lower-cased, which would shift every
  // offset — compare slice by slice instead of trusting the folded string.
  for (let i = 0; i + find.length <= input.length; i++) {
    const slice = input.slice(i, i + find.length);
    const same = opts.caseSensitive ? slice === find : slice.toLowerCase() === needle;
    if (!same) continue;
    const end = i + find.length;
    if (!opts.wholeWord || isBoundary(input, i, end)) {
      ranges.push({ start: i, end });
      i = end - 1;
    }
  }
  return ranges;
}

/** Split text into highlighted and plain runs. */
export function toSegments(text: string, ranges: Range[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), hit: false });
    segments.push({ text: text.slice(range.start, range.end), hit: true });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}

export function findReplace(
  input: string,
  find: string,
  replacement: string,
  opts: FindOptions,
): FindReplaceResult {
  const all = findOccurrences(input, find, opts);
  const applied = opts.firstOnly ? all.slice(0, 1) : all;

  let output = '';
  let cursor = 0;
  const outputRanges: Range[] = [];
  for (const range of applied) {
    output += input.slice(cursor, range.start);
    const start = output.length;
    output += replacement;
    outputRanges.push({ start, end: output.length });
    cursor = range.end;
  }
  output += input.slice(cursor);

  return {
    output,
    count: all.length,
    replaced: applied.length,
    inputSegments: toSegments(input, all),
    outputSegments: toSegments(output, outputRanges),
  };
}
