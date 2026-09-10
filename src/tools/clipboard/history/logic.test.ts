import { describe, it, expect } from 'vitest';
import {
  MAX_ENTRIES,
  MAX_TOTAL_CHARS,
  type ClipEntry,
  describeText,
  filterEntries,
  parseStored,
  previewOf,
  recordEntry,
  sortForDisplay,
  trimEntries,
} from './logic';

const entry = (text: string, at: number, pinned = false): ClipEntry => ({
  id: `id-${text}-${at}`,
  text,
  at,
  pinned,
});

describe('recordEntry', () => {
  it('ignores a blank clipboard', () => {
    expect(recordEntry([], '   \n ', 1, 'a')).toEqual([]);
  });

  it('records nothing while the clipboard is unchanged', () => {
    const list = [entry('hello', 10)];
    expect(recordEntry(list, 'hello', 20, 'b')).toBe(list);
  });

  it('moves repeated text back to the top and keeps its pin', () => {
    const list = [entry('second', 20), entry('first', 10, true)];
    const next = recordEntry(list, 'first', 30, 'new');
    expect(next.map((e) => e.text)).toEqual(['first', 'second']);
    expect(next[0].pinned).toBe(true);
    expect(next[0].at).toBe(30);
    expect(next).toHaveLength(2);
  });

  it('adds new text at the top', () => {
    const next = recordEntry([entry('old', 1)], 'new', 2, 'id-new');
    expect(next.map((e) => e.text)).toEqual(['new', 'old']);
    expect(next[0].pinned).toBe(false);
  });
});

describe('trimEntries', () => {
  it('caps the list at the maximum', () => {
    const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => entry(`copy ${i}`, i));
    expect(trimEntries(many)).toHaveLength(MAX_ENTRIES);
  });

  it('drops the oldest unpinned entry first', () => {
    const many = [
      ...Array.from({ length: MAX_ENTRIES }, (_, i) => entry(`copy ${i}`, MAX_ENTRIES - i)),
      entry('keep me', 0, true),
    ];
    const trimmed = trimEntries(many);
    expect(trimmed).toHaveLength(MAX_ENTRIES);
    expect(trimmed.some((e) => e.text === 'keep me')).toBe(true);
    expect(trimmed.some((e) => e.text === `copy ${MAX_ENTRIES - 1}`)).toBe(false);
  });

  it('keeps pinned entries even when they exceed the character budget', () => {
    const huge = 'x'.repeat(MAX_TOTAL_CHARS);
    const list = [entry(huge, 2, true), entry(huge, 1, true)];
    expect(trimEntries(list)).toHaveLength(2);
  });

  it('drops unpinned entries once the character budget is passed', () => {
    const huge = 'x'.repeat(MAX_TOTAL_CHARS);
    const list = [entry(huge, 3), entry(huge, 2), entry('small', 1)];
    const trimmed = trimEntries(list);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0].at).toBe(3);
  });
});

describe('sortForDisplay', () => {
  it('puts pinned entries first, then the most recent', () => {
    const list = [entry('a', 5), entry('b', 9, true), entry('c', 7)];
    expect(sortForDisplay(list).map((e) => e.text)).toEqual(['b', 'c', 'a']);
  });
});

describe('filterEntries', () => {
  it('matches regardless of case and returns everything for an empty query', () => {
    const list = [entry('Hello World', 2), entry('adiós', 1)];
    expect(filterEntries(list, 'hello').map((e) => e.text)).toEqual(['Hello World']);
    expect(filterEntries(list, '  ')).toHaveLength(2);
  });
});

describe('previewOf', () => {
  it('cuts at the line limit', () => {
    const { preview, truncated } = previewOf('1\n2\n3\n4\n5', 2);
    expect(preview).toBe('1\n2');
    expect(truncated).toBe(true);
  });

  it('cuts at the character limit', () => {
    const { preview, truncated } = previewOf('abcdefghij', 4, 5);
    expect(preview).toBe('abcde');
    expect(truncated).toBe(true);
  });

  it('leaves short text alone', () => {
    expect(previewOf('short')).toEqual({ preview: 'short', truncated: false });
  });
});

describe('describeText', () => {
  it('counts characters, words and lines', () => {
    expect(describeText('one two\nthree')).toEqual({ characters: 13, words: 3, lines: 2 });
  });

  it('reports no words for whitespace', () => {
    expect(describeText('  \n ').words).toBe(0);
  });
});

describe('parseStored', () => {
  it('returns an empty list for missing or corrupt storage', () => {
    expect(parseStored(null)).toEqual([]);
    expect(parseStored('not json')).toEqual([]);
    expect(parseStored('{"a":1}')).toEqual([]);
  });

  it('skips entries without text and repairs missing fields', () => {
    const stored = JSON.stringify([{ text: 'kept' }, { text: '' }, { nope: true }]);
    const parsed = parseStored(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe('kept');
    expect(parsed[0].pinned).toBe(false);
    expect(typeof parsed[0].id).toBe('string');
    expect(Number.isFinite(parsed[0].at)).toBe(true);
  });
});
