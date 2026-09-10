import { describe, expect, it } from 'vitest';
import { allPages, formatPageList, keptPages, parsePageSet, togglePage } from './logic';

describe('parsePageSet', () => {
  it('expands ranges and sorts the result', () => {
    expect(parsePageSet('5-7, 2', 10)).toEqual([2, 5, 6, 7]);
  });

  it('merges overlapping ranges instead of removing a page twice', () => {
    expect(parsePageSet('1-3, 2-4', 10)).toEqual([1, 2, 3, 4]);
  });

  it('accepts a reversed range', () => {
    expect(parsePageSet('7-5', 10)).toEqual([5, 6, 7]);
  });

  it('understands open-ended ranges', () => {
    expect(parsePageSet('8-', 10)).toEqual([8, 9, 10]);
    expect(parsePageSet('-2', 10)).toEqual([1, 2]);
  });

  it('tolerates spacing, semicolons and pasted en dashes', () => {
    expect(parsePageSet(' 1 - 2 ; 9 ', 10)).toEqual([1, 2, 9]);
    expect(parsePageSet('2–3', 10)).toEqual([2, 3]);
  });

  it('treats empty input as "remove nothing"', () => {
    expect(parsePageSet('', 10)).toEqual([]);
    expect(parsePageSet('  ', 10)).toEqual([]);
  });

  it('refuses pages the document does not have', () => {
    expect(() => parsePageSet('11', 10)).toThrow(/10 pages/);
    expect(() => parsePageSet('0', 10)).toThrow(/numbered from 1/);
  });

  it('refuses text that is not a page reference', () => {
    expect(() => parsePageSet('blank ones', 10)).toThrow(/not a page number/);
    expect(() => parsePageSet('-', 10)).toThrow(/not a page range/);
  });
});

describe('formatPageList', () => {
  it('compresses runs and always reads in order', () => {
    expect(formatPageList([7, 6, 5, 2])).toBe('2, 5-7');
    expect(formatPageList([1])).toBe('1');
    expect(formatPageList([])).toBe('');
  });

  it('round-trips through the parser', () => {
    const pages = [2, 5, 6, 7, 10];
    expect(parsePageSet(formatPageList(pages), 10)).toEqual(pages);
  });
});

describe('togglePage', () => {
  it('adds and removes while staying sorted', () => {
    expect(togglePage([5, 2], 3)).toEqual([2, 3, 5]);
    expect(togglePage([2, 3, 5], 3)).toEqual([2, 5]);
  });
});

describe('keptPages', () => {
  it('returns the survivors in their original order', () => {
    expect(keptPages(6, [2, 5])).toEqual([1, 3, 4, 6]);
  });

  it('keeps everything when nothing is removed', () => {
    expect(keptPages(3, [])).toEqual([1, 2, 3]);
  });

  it('can end up empty, which the tool must refuse to save', () => {
    expect(keptPages(2, [1, 2])).toEqual([]);
  });

  it('ignores pages that are not in the document', () => {
    expect(keptPages(3, [9])).toEqual(allPages(3));
  });
});
