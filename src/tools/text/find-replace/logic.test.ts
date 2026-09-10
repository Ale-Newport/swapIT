import { describe, it, expect } from 'vitest';
import { findOccurrences, findReplace, toSegments, type FindOptions } from './logic';

const base: FindOptions = { caseSensitive: false, wholeWord: false, firstOnly: false };

describe('findOccurrences', () => {
  it('finds every non-overlapping occurrence', () => {
    expect(findOccurrences('aaaa', 'aa', { caseSensitive: true, wholeWord: false })).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('folds case when asked', () => {
    expect(findOccurrences('Cat cat CAT', 'cat', { caseSensitive: false, wholeWord: false })).toHaveLength(3);
    expect(findOccurrences('Cat cat CAT', 'cat', { caseSensitive: true, wholeWord: false })).toHaveLength(1);
  });

  it('respects word boundaries', () => {
    const ranges = findOccurrences('cat catalogue cat.', 'cat', { caseSensitive: true, wholeWord: true });
    expect(ranges).toEqual([
      { start: 0, end: 3 },
      { start: 14, end: 17 },
    ]);
  });

  it('treats digits and underscores as word characters', () => {
    expect(findOccurrences('id_1 id', 'id', { caseSensitive: true, wholeWord: true })).toEqual([
      { start: 5, end: 7 },
    ]);
  });

  it('returns nothing for an empty needle', () => {
    expect(findOccurrences('anything', '', { caseSensitive: true, wholeWord: false })).toEqual([]);
  });
});

describe('findReplace', () => {
  it('replaces every match and reports the counts', () => {
    const r = findReplace('cat cat cat', 'cat', 'dog', base);
    expect(r.output).toBe('dog dog dog');
    expect(r.count).toBe(3);
    expect(r.replaced).toBe(3);
  });

  it('replaces only the first when asked, but still counts them all', () => {
    const r = findReplace('cat cat cat', 'cat', 'dog', { ...base, firstOnly: true });
    expect(r.output).toBe('dog cat cat');
    expect(r.count).toBe(3);
    expect(r.replaced).toBe(1);
  });

  it('deletes matches when the replacement is empty', () => {
    expect(findReplace('a-b-c', '-', '', base).output).toBe('abc');
  });

  it('does not re-scan its own replacement text', () => {
    expect(findReplace('aa', 'a', 'aa', base).output).toBe('aaaa');
  });

  it('marks the replaced runs in the output segments', () => {
    const r = findReplace('one cat two', 'cat', 'dog', base);
    expect(r.outputSegments).toEqual([
      { text: 'one ', hit: false },
      { text: 'dog', hit: true },
      { text: ' two', hit: false },
    ]);
  });

  it('marks the found runs in the input segments', () => {
    const r = findReplace('one cat two', 'cat', 'dog', base);
    expect(r.inputSegments.filter((s) => s.hit).map((s) => s.text)).toEqual(['cat']);
  });

  it('leaves the text untouched when nothing matches', () => {
    const r = findReplace('hello', 'zzz', 'x', base);
    expect(r.output).toBe('hello');
    expect(r.count).toBe(0);
  });
});

describe('toSegments', () => {
  it('covers the whole string exactly once', () => {
    const text = 'abcdef';
    const segments = toSegments(text, [{ start: 2, end: 4 }]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments).toEqual([
      { text: 'ab', hit: false },
      { text: 'cd', hit: true },
      { text: 'ef', hit: false },
    ]);
  });
});
