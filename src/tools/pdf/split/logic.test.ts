import { describe, expect, it } from 'vitest';
import { chunkRanges, parsePageRanges, rangeLabel, singlePageRanges, totalPages } from './logic';

describe('parsePageRanges', () => {
  it('parses the canonical mixed list', () => {
    expect(parsePageRanges('1-3, 5, 8-10', 10)).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 8, end: 10 },
    ]);
  });

  it('does not care about spacing or separator style', () => {
    const expected = [
      { start: 1, end: 2 },
      { start: 4, end: 4 },
    ];
    expect(parsePageRanges('1-2,4', 9)).toEqual(expected);
    expect(parsePageRanges('  1 - 2 ; 4 ', 9)).toEqual(expected);
    expect(parsePageRanges('1-2 4', 9)).toEqual(expected);
  });

  it('accepts en dashes pasted from word processors', () => {
    expect(parsePageRanges('2–3', 5)).toEqual([{ start: 2, end: 3 }]);
  });

  it('treats an open end as "to the last page" and an open start as "from page 1"', () => {
    expect(parsePageRanges('3-', 7)).toEqual([{ start: 3, end: 7 }]);
    expect(parsePageRanges('-4', 7)).toEqual([{ start: 1, end: 4 }]);
  });

  it('rights a reversed range instead of producing nothing', () => {
    expect(parsePageRanges('9-4', 10)).toEqual([{ start: 4, end: 9 }]);
  });

  it('keeps overlapping ranges — each one becomes its own file', () => {
    expect(parsePageRanges('1-3, 2-4', 10)).toHaveLength(2);
  });

  it('rejects pages past the end of the document', () => {
    expect(() => parsePageRanges('1-3, 12', 10)).toThrow(/10 pages/);
    expect(() => parsePageRanges('8-20', 10)).toThrow(/past the end/);
  });

  it('rejects page zero and negative-looking input', () => {
    expect(() => parsePageRanges('0', 10)).toThrow(/numbered from 1/);
    expect(() => parsePageRanges('0-3', 10)).toThrow(/numbered from 1/);
  });

  it('rejects text that is not a page reference', () => {
    expect(() => parsePageRanges('first three', 10)).toThrow(/not a page number/);
    expect(() => parsePageRanges('1..3', 10)).toThrow(/not a page number/);
    expect(() => parsePageRanges('-', 10)).toThrow(/not a page range/);
  });

  it('asks for input rather than silently returning nothing', () => {
    expect(() => parsePageRanges('', 10)).toThrow(/Enter at least one/);
    expect(() => parsePageRanges('   ', 10)).toThrow(/Enter at least one/);
  });

  it('refuses to work on an empty document', () => {
    expect(() => parsePageRanges('1', 0)).toThrow(/no pages/);
  });
});

describe('chunkRanges', () => {
  it('splits evenly and leaves a short final block', () => {
    expect(chunkRanges(10, 4)).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 8 },
      { start: 9, end: 10 },
    ]);
  });

  it('covers every page exactly once', () => {
    expect(totalPages(chunkRanges(37, 5))).toBe(37);
  });

  it('handles a block larger than the document', () => {
    expect(chunkRanges(3, 50)).toEqual([{ start: 1, end: 3 }]);
  });

  it('falls back to one page per file for a nonsense size', () => {
    expect(chunkRanges(3, 0)).toHaveLength(3);
    expect(chunkRanges(3, -2)).toHaveLength(3);
  });

  it('returns nothing for an empty document', () => {
    expect(chunkRanges(0, 4)).toEqual([]);
  });
});

describe('singlePageRanges', () => {
  it('produces one range per page', () => {
    expect(singlePageRanges(3)).toEqual([
      { start: 1, end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 3 },
    ]);
    expect(singlePageRanges(0)).toEqual([]);
  });
});

describe('rangeLabel', () => {
  it('zero-pads to the width of the document so parts sort correctly', () => {
    expect(rangeLabel({ start: 7, end: 7 }, 120)).toBe('p007');
    expect(rangeLabel({ start: 7, end: 9 }, 120)).toBe('p007-009');
    expect(rangeLabel({ start: 2, end: 2 }, 9)).toBe('p2');
  });
});
