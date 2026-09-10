export interface DedupeOptions {
  /** When false, "Apple" and "apple" count as the same line. */
  caseSensitive: boolean;
  /** Ignore leading and trailing whitespace when comparing. */
  trimForCompare: boolean;
  keep: 'first' | 'last';
  /** 'unique' drops repeats; 'duplicates' keeps only the lines that repeat. */
  mode: 'unique' | 'duplicates';
}

export interface DedupeResult {
  output: string;
  linesIn: number;
  linesOut: number;
  removed: number;
  /** How many distinct values appeared more than once. */
  duplicateValues: number;
}

export function splitLines(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text === '') return { lines: [], trailingNewline: false };
  const trailingNewline = /\r?\n$/.test(text);
  const body = trailingNewline ? text.replace(/\r?\n$/, '') : text;
  return { lines: body.split(/\r?\n/), trailingNewline };
}

export function joinLines(lines: string[], trailingNewline: boolean): string {
  if (lines.length === 0) return '';
  return lines.join('\n') + (trailingNewline ? '\n' : '');
}

function keyOf(line: string, opts: DedupeOptions): string {
  const base = opts.trimForCompare ? line.trim() : line;
  return opts.caseSensitive ? base : base.toLowerCase();
}

export function removeDuplicates(text: string, opts: DedupeOptions): DedupeResult {
  const { lines, trailingNewline } = splitLines(text);
  const counts = new Map<string, number>();
  const lastIndex = new Map<string, number>();
  lines.forEach((line, i) => {
    const key = keyOf(line, opts);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    lastIndex.set(key, i);
  });
  const duplicateValues = [...counts.values()].filter((n) => n > 1).length;

  const wanted = (key: string) => (opts.mode === 'duplicates' ? (counts.get(key) ?? 0) > 1 : true);

  const kept: string[] = [];
  if (opts.keep === 'last') {
    lines.forEach((line, i) => {
      const key = keyOf(line, opts);
      if (lastIndex.get(key) === i && wanted(key)) kept.push(line);
    });
  } else {
    const seen = new Set<string>();
    for (const line of lines) {
      const key = keyOf(line, opts);
      if (seen.has(key)) continue;
      seen.add(key);
      if (wanted(key)) kept.push(line);
    }
  }

  return {
    output: joinLines(kept, trailingNewline),
    linesIn: lines.length,
    linesOut: kept.length,
    removed: lines.length - kept.length,
    duplicateValues,
  };
}
