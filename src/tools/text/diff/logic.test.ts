import { describe, expect, it } from 'vitest';
import { diffInline, diffTextLines, highlightPair, toLines, toUnifiedPatch } from './logic';

const OPTS = { ignoreCase: false, ignoreWhitespace: false, ignoreBlankLines: false };

describe('toLines', () => {
  it('numbers every line from one', () => {
    expect(toLines('a\nb', false)).toEqual([
      { num: 1, text: 'a' },
      { num: 2, text: 'b' },
    ]);
  });

  it('treats a trailing newline as an empty final line', () => {
    expect(toLines('a\n', false)).toHaveLength(2);
  });

  it('returns nothing for empty text', () => {
    expect(toLines('', false)).toEqual([]);
  });

  it('keeps original numbers when blank lines are dropped', () => {
    expect(toLines('a\n\n   \nb', true)).toEqual([
      { num: 1, text: 'a' },
      { num: 4, text: 'b' },
    ]);
  });
});

describe('diffTextLines', () => {
  it('reports no changes for identical text', () => {
    const { rows, summary } = diffTextLines('a\nb\nc', 'a\nb\nc', OPTS);
    expect(summary).toEqual({ additions: 0, deletions: 0, unchanged: 3 });
    expect(rows.every((r) => r.type === 'equal')).toBe(true);
  });

  it('pairs a changed line into a single replace row', () => {
    const { rows, summary } = diffTextLines('a\nb\nc', 'a\nB\nc', OPTS);
    expect(summary).toEqual({ additions: 1, deletions: 1, unchanged: 2 });
    const replaced = rows.find((r) => r.type === 'replace');
    expect(replaced?.left).toEqual({ num: 2, text: 'b' });
    expect(replaced?.right).toEqual({ num: 2, text: 'B' });
  });

  it('leaves the other side empty for a pure insertion', () => {
    const { rows, summary } = diffTextLines('a\nc', 'a\nb\nc', OPTS);
    expect(summary).toEqual({ additions: 1, deletions: 0, unchanged: 2 });
    const added = rows.find((r) => r.type === 'add');
    expect(added?.left).toBeNull();
    expect(added?.right).toEqual({ num: 2, text: 'b' });
  });

  it('keeps every line numbered correctly after a big deletion', () => {
    const { rows } = diffTextLines('1\n2\n3\n4\n5', '1\n5', OPTS);
    const removed = rows.filter((r) => r.type === 'remove').map((r) => r.left?.num);
    expect(removed).toEqual([2, 3, 4]);
    const last = rows[rows.length - 1];
    expect(last.left).toEqual({ num: 5, text: '5' });
    expect(last.right).toEqual({ num: 2, text: '5' });
  });

  it('ignores case when asked', () => {
    const plain = diffTextLines('Hello\nWorld', 'hello\nworld', OPTS);
    expect(plain.summary.unchanged).toBe(0);
    const relaxed = diffTextLines('Hello\nWorld', 'hello\nworld', { ...OPTS, ignoreCase: true });
    expect(relaxed.summary).toEqual({ additions: 0, deletions: 0, unchanged: 2 });
  });

  it('ignores leading and trailing whitespace when asked', () => {
    const relaxed = diffTextLines('  a  \nb', 'a\nb', { ...OPTS, ignoreWhitespace: true });
    expect(relaxed.summary.additions).toBe(0);
    expect(relaxed.summary.deletions).toBe(0);
  });

  it('ignores blank lines but still reports real line numbers', () => {
    const { rows, summary } = diffTextLines('a\n\n\nb', 'a\nb', { ...OPTS, ignoreBlankLines: true });
    expect(summary).toEqual({ additions: 0, deletions: 0, unchanged: 2 });
    expect(rows[1].left).toEqual({ num: 4, text: 'b' });
  });

  it('handles one side being empty', () => {
    const { summary } = diffTextLines('', 'a\nb', OPTS);
    expect(summary).toEqual({ additions: 2, deletions: 0, unchanged: 0 });
  });
});

describe('toUnifiedPatch', () => {
  it('returns nothing when the texts match', () => {
    const { rows } = diffTextLines('same', 'same', OPTS);
    expect(toUnifiedPatch(rows)).toBe('');
  });

  it('emits a hunk header with the right counts', () => {
    const { rows } = diffTextLines('a\nb\nc', 'a\nB\nc', OPTS);
    const patch = toUnifiedPatch(rows).split('\n');
    expect(patch[0]).toBe('--- original');
    expect(patch[1]).toBe('+++ modified');
    expect(patch[2]).toBe('@@ -1,3 +1,3 @@');
    expect(patch.slice(3, 7)).toEqual([' a', '-b', '+B', ' c']);
  });

  it('groups a run of changes as removals then additions', () => {
    const { rows } = diffTextLines('a\nb\nc\nd', 'a\nB\nC\nd', OPTS);
    const body = toUnifiedPatch(rows).split('\n').slice(3);
    expect(body.slice(0, 5)).toEqual([' a', '-b', '-c', '+B', '+C']);
  });

  it('limits context around distant changes', () => {
    const oldText = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    const newText = oldText.replace('line 15', 'changed 15');
    const { rows } = diffTextLines(oldText, newText, OPTS);
    const patch = toUnifiedPatch(rows, 2);
    expect(patch).toContain('@@ -13,5 +13,5 @@');
    expect(patch).not.toContain('line 1\n');
  });
});

describe('diffInline', () => {
  it('counts word-level changes', () => {
    const { segments, summary } = diffInline('the quick fox', 'the slow fox', 'word', OPTS);
    expect(summary.additions).toBe(1);
    expect(summary.deletions).toBe(1);
    expect(segments.map((s) => s.type)).toEqual(['equal', 'remove', 'add', 'equal']);
  });

  it('keeps whitespace significant when ignore whitespace is off', () => {
    const strict = diffInline('a  b', 'a b', 'word', OPTS);
    expect(strict.summary.additions + strict.summary.deletions).toBeGreaterThan(0);
    const relaxed = diffInline('a  b', 'a b', 'word', { ...OPTS, ignoreWhitespace: true });
    expect(relaxed.summary.additions + relaxed.summary.deletions).toBe(0);
  });

  it('compares single characters', () => {
    const { summary } = diffInline('abc', 'abd', 'char', OPTS);
    expect(summary).toEqual({ additions: 1, deletions: 1, unchanged: 2 });
  });
});

describe('highlightPair', () => {
  it('marks only the words that differ on each side', () => {
    const { left, right } = highlightPair('the quick fox', 'the slow fox', { ignoreCase: false });
    expect(left.filter((s) => s.type === 'remove').map((s) => s.value)).toEqual(['quick']);
    expect(right.filter((s) => s.type === 'add').map((s) => s.value)).toEqual(['slow']);
    expect(left.map((s) => s.value).join('')).toBe('the quick fox');
    expect(right.map((s) => s.value).join('')).toBe('the slow fox');
  });
});
