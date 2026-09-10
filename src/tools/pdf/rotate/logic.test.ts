import { describe, expect, it } from 'vitest';
import { normaliseRotation, pagesForCount, parseOpenRanges } from './logic';

describe('parseOpenRanges', () => {
  it('parses a mixed list without needing a page count', () => {
    expect(parseOpenRanges('1-3, 5, 8-10')).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 8, end: 10 },
    ]);
  });

  it('keeps an open end open so it can adapt to each file', () => {
    expect(parseOpenRanges('4-')).toEqual([{ start: 4, end: null }]);
    expect(parseOpenRanges('-3')).toEqual([{ start: 1, end: 3 }]);
  });

  it('rights a reversed range', () => {
    expect(parseOpenRanges('9-4')).toEqual([{ start: 4, end: 9 }]);
  });

  it('tolerates spacing, semicolons and pasted en dashes', () => {
    expect(parseOpenRanges(' 1 - 2 ; 4 ')).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 4 },
    ]);
    expect(parseOpenRanges('2–3')).toEqual([{ start: 2, end: 3 }]);
  });

  it('treats empty input as an empty selection', () => {
    expect(parseOpenRanges('')).toEqual([]);
    expect(parseOpenRanges('   ')).toEqual([]);
  });

  it('refuses page zero and text', () => {
    expect(() => parseOpenRanges('0')).toThrow(/numbered from 1/);
    expect(() => parseOpenRanges('0-4')).toThrow(/numbered from 1/);
    expect(() => parseOpenRanges('odd pages')).toThrow(/not a page number/);
    expect(() => parseOpenRanges('-')).toThrow(/not a page range/);
  });
});

describe('pagesForCount', () => {
  it('expands ranges against a real document', () => {
    expect(pagesForCount(parseOpenRanges('1-3, 5'), 10)).toEqual([1, 2, 3, 5]);
  });

  it('resolves an open end to the last page of each file', () => {
    expect(pagesForCount(parseOpenRanges('4-'), 6)).toEqual([4, 5, 6]);
    expect(pagesForCount(parseOpenRanges('4-'), 4)).toEqual([4]);
  });

  it('clips a range that runs past a shorter file instead of failing it', () => {
    expect(pagesForCount(parseOpenRanges('1-40'), 3)).toEqual([1, 2, 3]);
  });

  it('returns nothing when the selection misses the file entirely', () => {
    expect(pagesForCount(parseOpenRanges('20-25'), 6)).toEqual([]);
  });

  it('merges overlapping ranges so a page is never turned twice', () => {
    expect(pagesForCount(parseOpenRanges('1-3, 2-4'), 10)).toEqual([1, 2, 3, 4]);
  });
});

describe('normaliseRotation', () => {
  it('adds a turn and stays inside 0-359', () => {
    expect(normaliseRotation(0, 90)).toBe(90);
    expect(normaliseRotation(270, 90)).toBe(0);
    expect(normaliseRotation(180, 270)).toBe(90);
  });

  it('copes with the negative angles some PDFs store', () => {
    expect(normaliseRotation(-90, 180)).toBe(90);
    expect(normaliseRotation(-90, 90)).toBe(0);
  });

  it('copes with angles beyond a full turn', () => {
    expect(normaliseRotation(450, 90)).toBe(180);
  });
});
