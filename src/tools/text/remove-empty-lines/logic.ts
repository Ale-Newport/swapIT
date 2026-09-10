export interface EmptyLineOptions {
  /** 'remove' drops every blank line; 'collapse' leaves a single one. */
  mode: 'remove' | 'collapse';
  /** Treat lines that only contain spaces or tabs as blank. */
  whitespaceIsBlank: boolean;
}

export interface EmptyLineResult {
  output: string;
  linesIn: number;
  linesOut: number;
  removed: number;
}

export function splitLines(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text === '') return { lines: [], trailingNewline: false };
  const trailingNewline = /\r?\n$/.test(text);
  const body = trailingNewline ? text.replace(/\r?\n$/, '') : text;
  return { lines: body.split(/\r?\n/), trailingNewline };
}

export function isBlank(line: string, whitespaceIsBlank: boolean): boolean {
  return whitespaceIsBlank ? line.trim().length === 0 : line.length === 0;
}

export function removeEmptyLines(text: string, opts: EmptyLineOptions): EmptyLineResult {
  const { lines, trailingNewline } = splitLines(text);
  const kept: string[] = [];
  let blankRun = 0;

  for (const line of lines) {
    if (isBlank(line, opts.whitespaceIsBlank)) {
      blankRun += 1;
      // Collapse keeps the first blank of a run, so paragraph breaks survive —
      // but a line of spaces the user just declared blank is kept as a blank
      // line, not as its spaces.
      if (opts.mode === 'collapse' && blankRun === 1) kept.push(opts.whitespaceIsBlank ? '' : line);
      continue;
    }
    blankRun = 0;
    kept.push(line);
  }

  return {
    output: kept.length === 0 ? '' : kept.join('\n') + (trailingNewline ? '\n' : ''),
    linesIn: lines.length,
    linesOut: kept.length,
    removed: lines.length - kept.length,
  };
}
