import { describe, expect, it } from 'vitest';
import { allPages, formatPageSequence, parsePageSequence, togglePage } from './logic';

describe('parsePageSequence', () => {
  it('expands ranges and single pages in the order written', () => {
    expect(parsePageSequence('1-3, 5, 8-10', 10)).toEqual([1, 2, 3, 5, 8, 9, 10]);
  });

  it('keeps a custom order instead of sorting it', () => {
    expect(parsePageSequence('5, 1-2', 10)).toEqual([5, 1, 2]);
  });

  it('counts backwards through a descending range', () => {
    expect(parsePageSequence('8-5', 10)).toEqual([8, 7, 6, 5]);
  });

  it('takes a page only once, keeping its first position', () => {
    expect(parsePageSequence('3, 1-4, 3', 10)).toEqual([3, 1, 2, 4]);
  });

  it('understands open-ended ranges', () => {
    expect(parsePageSequence('8-', 10)).toEqual([8, 9, 10]);
    expect(parsePageSequence('-3', 10)).toEqual([1, 2, 3]);
  });

  it('tolerates spacing, semicolons and pasted en dashes', () => {
    expect(parsePageSequence(' 1 - 2 ; 4 ', 10)).toEqual([1, 2, 4]);
    expect(parsePageSequence('2–3', 10)).toEqual([2, 3]);
  });

  it('treats empty input as an empty selection rather than an error', () => {
    expect(parsePageSequence('', 10)).toEqual([]);
    expect(parsePageSequence('   ', 10)).toEqual([]);
  });

  it('refuses pages the document does not have', () => {
    expect(() => parsePageSequence('11', 10)).toThrow(/10 pages/);
    expect(() => parsePageSequence('1-99', 10)).toThrow(/past the end/);
    expect(() => parsePageSequence('0', 10)).toThrow(/numbered from 1/);
  });

  it('refuses text that is not a page reference', () => {
    expect(() => parsePageSequence('last', 10)).toThrow(/not a page number/);
    expect(() => parsePageSequence('-', 10)).toThrow(/not a page range/);
  });
});

describe('formatPageSequence', () => {
  it('compresses consecutive runs', () => {
    expect(formatPageSequence([1, 2, 3, 5, 8, 9, 10])).toBe('1-3, 5, 8-10');
  });

  it('leaves a custom order alone apart from its own runs', () => {
    expect(formatPageSequence([5, 1, 2])).toBe('5, 1-2');
    expect(formatPageSequence([8, 7, 6])).toBe('8, 7, 6');
  });

  it('round-trips through the parser', () => {
    const pages = [4, 5, 6, 1, 9];
    expect(parsePageSequence(formatPageSequence(pages), 10)).toEqual(pages);
  });

  it('handles the empty and single-page cases', () => {
    expect(formatPageSequence([])).toBe('');
    expect(formatPageSequence([7])).toBe('7');
  });
});

describe('togglePage', () => {
  it('appends a new page at the end of the order', () => {
    expect(togglePage([3, 1], 5)).toEqual([3, 1, 5]);
  });

  it('removes a page that is already chosen', () => {
    expect(togglePage([3, 1, 5], 1)).toEqual([3, 5]);
  });
});

describe('allPages', () => {
  it('lists every page once', () => {
    expect(allPages(3)).toEqual([1, 2, 3]);
    expect(allPages(0)).toEqual([]);
  });
});
