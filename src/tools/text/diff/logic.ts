import {
  diffChars,
  diffLines,
  diffWords,
  diffWordsWithSpace,
  type Change,
  type DiffLinesOptionsNonabortable,
} from 'diff';

export type DiffMode = 'line' | 'word' | 'char';

export interface DiffOptions {
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
  ignoreBlankLines: boolean;
}

export interface NumberedLine {
  /** 1-based line number in the original text, before any blank-line filtering. */
  num: number;
  text: string;
}

export type RowType = 'equal' | 'add' | 'remove' | 'replace';

export interface DiffRow {
  type: RowType;
  left: NumberedLine | null;
  right: NumberedLine | null;
}

export interface DiffSummary {
  additions: number;
  deletions: number;
  unchanged: number;
}

export interface LineDiffResult {
  rows: DiffRow[];
  summary: DiffSummary;
}

export interface InlineSegment {
  value: string;
  type: 'equal' | 'add' | 'remove';
}

export interface InlineDiffResult {
  segments: InlineSegment[];
  summary: DiffSummary;
}

/**
 * Split text into 1-based numbered lines. Blank lines are dropped when the user
 * asked to ignore them, but every surviving line keeps its original number so
 * the gutter still points at the real file.
 */
export function toLines(text: string, ignoreBlankLines: boolean): NumberedLine[] {
  if (text === '') return [];
  const all = text.split('\n').map((line, i) => ({ num: i + 1, text: line }));
  return ignoreBlankLines ? all.filter((l) => l.text.trim() !== '') : all;
}

/**
 * Rejoin numbered lines so that jsdiff produces exactly one token per line.
 * The trailing newline matters: without it "a\n" and ["a", ""] disagree about
 * how many lines the text has.
 */
function join(lines: NumberedLine[]): string {
  return lines.length === 0 ? '' : `${lines.map((l) => l.text).join('\n')}\n`;
}

/** Line-by-line comparison, paired up for a side-by-side view. */
export function diffTextLines(oldText: string, newText: string, opts: DiffOptions): LineDiffResult {
  const left = toLines(oldText, opts.ignoreBlankLines);
  const right = toLines(newText, opts.ignoreBlankLines);

  // `ignoreCase` is honoured by jsdiff's base comparator for every diff type,
  // but its line-options type predates that, so widen it here.
  const options: DiffLinesOptionsNonabortable & { ignoreCase: boolean } = {
    ignoreWhitespace: opts.ignoreWhitespace,
    ignoreCase: opts.ignoreCase,
  };
  const changes = diffLines(join(left), join(right), options);

  const rows: DiffRow[] = [];
  let pendingRemove: NumberedLine[] = [];
  let pendingAdd: NumberedLine[] = [];

  const flush = () => {
    const max = Math.max(pendingRemove.length, pendingAdd.length);
    for (let i = 0; i < max; i++) {
      const l = pendingRemove[i] ?? null;
      const r = pendingAdd[i] ?? null;
      rows.push({ type: l && r ? 'replace' : l ? 'remove' : 'add', left: l, right: r });
    }
    pendingRemove = [];
    pendingAdd = [];
  };

  let li = 0;
  let ri = 0;
  for (const change of changes) {
    const count = change.count ?? 0;
    if (change.added) {
      pendingAdd.push(...right.slice(ri, ri + count));
      ri += count;
    } else if (change.removed) {
      pendingRemove.push(...left.slice(li, li + count));
      li += count;
    } else {
      flush();
      for (let i = 0; i < count; i++) {
        rows.push({ type: 'equal', left: left[li + i] ?? null, right: right[ri + i] ?? null });
      }
      li += count;
      ri += count;
    }
  }
  flush();

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;
  for (const row of rows) {
    if (row.type === 'equal') unchanged++;
    else {
      if (row.left) deletions++;
      if (row.right) additions++;
    }
  }

  return { rows, summary: { additions, deletions, unchanged } };
}

function toSegments(changes: Change[]): InlineSegment[] {
  return changes.map((c) => ({
    value: c.value,
    type: c.added ? 'add' : c.removed ? 'remove' : 'equal',
  }));
}

/** Word- or character-level comparison of two texts, rendered as one stream. */
export function diffInline(
  oldText: string,
  newText: string,
  mode: 'word' | 'char',
  opts: DiffOptions,
): InlineDiffResult {
  const changes =
    mode === 'char'
      ? diffChars(oldText, newText, { ignoreCase: opts.ignoreCase })
      : opts.ignoreWhitespace
        ? diffWords(oldText, newText, { ignoreCase: opts.ignoreCase })
        : diffWordsWithSpace(oldText, newText, { ignoreCase: opts.ignoreCase });

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;
  for (const c of changes) {
    const count = c.count ?? 0;
    if (c.added) additions += count;
    else if (c.removed) deletions += count;
    else unchanged += count;
  }

  return { segments: toSegments(changes), summary: { additions, deletions, unchanged } };
}

/** Word-level highlighting inside a pair of lines that replaced one another. */
export function highlightPair(
  leftText: string,
  rightText: string,
  opts: Pick<DiffOptions, 'ignoreCase'>,
): { left: InlineSegment[]; right: InlineSegment[] } {
  const changes = diffWords(leftText, rightText, { ignoreCase: opts.ignoreCase });
  const left: InlineSegment[] = [];
  const right: InlineSegment[] = [];
  for (const c of changes) {
    if (c.added) right.push({ value: c.value, type: 'add' });
    else if (c.removed) left.push({ value: c.value, type: 'remove' });
    else {
      left.push({ value: c.value, type: 'equal' });
      right.push({ value: c.value, type: 'equal' });
    }
  }
  return { left, right };
}

/**
 * Render the paired rows as a patch-style unified diff, with the usual three
 * lines of context around each hunk.
 */
export function toUnifiedPatch(
  rows: DiffRow[],
  context = 3,
  oldName = 'original',
  newName = 'modified',
): string {
  const changed = rows.map((r) => r.type !== 'equal');
  if (!changed.some(Boolean)) return '';

  // Line numbers seen so far on each side, so a pure insertion still reports a
  // sensible @@ start on the old side (and vice versa).
  const prevLeft: number[] = [];
  const prevRight: number[] = [];
  let lastLeft = 0;
  let lastRight = 0;
  for (const row of rows) {
    prevLeft.push(lastLeft);
    prevRight.push(lastRight);
    if (row.left) lastLeft = row.left.num;
    if (row.right) lastRight = row.right.num;
  }

  const groups: Array<[number, number]> = [];
  for (let i = 0; i < rows.length; i++) {
    if (!changed[i]) continue;
    const start = Math.max(0, i - context);
    const end = Math.min(rows.length - 1, i + context);
    const last = groups[groups.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else groups.push([start, end]);
  }

  const out: string[] = [`--- ${oldName}`, `+++ ${newName}`];
  for (const [start, end] of groups) {
    const slice = rows.slice(start, end + 1);
    const oldCount = slice.filter((r) => r.left).length;
    const newCount = slice.filter((r) => r.right).length;
    const oldStart = slice.find((r) => r.left)?.left?.num ?? prevLeft[start];
    const newStart = slice.find((r) => r.right)?.right?.num ?? prevRight[start];
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

    for (let i = 0; i < slice.length; i++) {
      const row = slice[i];
      if (row.type === 'equal') {
        out.push(` ${row.left?.text ?? row.right?.text ?? ''}`);
        continue;
      }
      // Emit a whole run of changes as removals then additions, the way a real
      // unified diff groups them.
      let j = i;
      while (j < slice.length && slice[j].type !== 'equal') j++;
      const run = slice.slice(i, j);
      for (const r of run) if (r.left) out.push(`-${r.left.text}`);
      for (const r of run) if (r.right) out.push(`+${r.right.text}`);
      i = j - 1;
    }
  }
  return `${out.join('\n')}\n`;
}
