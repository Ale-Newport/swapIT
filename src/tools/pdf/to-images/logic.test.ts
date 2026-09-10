import { describe, expect, it } from 'vitest';
import {
  describeRenderSize,
  pagesInRange,
  parsePageField,
  parsePageSize,
  pixelsAtDpi,
  resolvePageRange,
} from './logic';

describe('parsePageField', () => {
  it('treats a blank field as no bound', () => {
    expect(parsePageField('', 'First page')).toBeNull();
    expect(parsePageField('   ', 'First page')).toBeNull();
  });

  it('reads a plain page number, ignoring surrounding spaces', () => {
    expect(parsePageField(' 12 ', 'Last page')).toBe(12);
  });

  it('refuses page zero, decimals and words', () => {
    expect(() => parsePageField('0', 'First page')).toThrow(/numbered from 1/);
    expect(() => parsePageField('2.5', 'First page')).toThrow(/whole page number/);
    expect(() => parsePageField('last', 'Last page')).toThrow(/whole page number/);
    expect(() => parsePageField('-3', 'First page')).toThrow(/whole page number/);
  });

  it('refuses an absurd page number rather than passing it on', () => {
    expect(() => parsePageField('999999', 'Last page')).toThrow(/larger than any real document/);
  });
});

describe('resolvePageRange', () => {
  it('accepts a one-sided window', () => {
    expect(resolvePageRange('5', '')).toEqual({ first: 5, last: null });
    expect(resolvePageRange('', '3')).toEqual({ first: null, last: 3 });
    expect(resolvePageRange('', '')).toEqual({ first: null, last: null });
  });

  it('rejects a window that runs backwards, naming both pages', () => {
    expect(() => resolvePageRange('10', '2')).toThrow('The last page (2) comes before the first page (10).');
  });

  it('allows a single-page window', () => {
    expect(resolvePageRange('4', '4')).toEqual({ first: 4, last: 4 });
  });
});

describe('pagesInRange', () => {
  it('counts the whole document when there is no window', () => {
    expect(pagesInRange({ first: null, last: null }, 12)).toBe(12);
  });

  it('clamps a window that overruns the document', () => {
    expect(pagesInRange({ first: 10, last: 40 }, 12)).toBe(3);
    expect(pagesInRange({ first: null, last: 40 }, 12)).toBe(12);
  });

  it('reports nothing when the window starts past the end', () => {
    expect(pagesInRange({ first: 20, last: null }, 12)).toBe(0);
  });

  it('reports nothing for a document with no known pages', () => {
    expect(pagesInRange({ first: null, last: null }, 0)).toBe(0);
  });
});

describe('pixelsAtDpi', () => {
  it('sizes an A4 page at print resolution', () => {
    expect(pixelsAtDpi(8.27, 11.69, 300)).toBe('2,481 × 3,507 px');
  });

  it('sizes the same page for the screen', () => {
    expect(pixelsAtDpi(8.27, 11.69, 72)).toBe('595 × 842 px');
  });
});

describe('parsePageSize', () => {
  it("reads poppler's page size line, including the paper name", () => {
    expect(parsePageSize('595.276 x 841.89 pts (A4)')).toEqual({
      widthPt: 595.276,
      heightPt: 841.89,
      name: 'A4',
    });
  });

  it('reads a size with no paper name', () => {
    expect(parsePageSize('612 x 792 pts')).toEqual({ widthPt: 612, heightPt: 792, name: null });
  });

  it('gives up on anything it does not recognise', () => {
    expect(parsePageSize(null)).toBeNull();
    expect(parsePageSize('')).toBeNull();
    expect(parsePageSize('variable')).toBeNull();
    expect(parsePageSize('0 x 0 pts')).toBeNull();
  });
});

describe('describeRenderSize', () => {
  it('converts points to pixels at the chosen resolution', () => {
    expect(describeRenderSize('595.276 x 841.89 pts (A4)', 150)).toBe('A4 · 1,240 × 1,754 px');
    expect(describeRenderSize('612 x 792 pts', 72)).toBe('612 × 792 px');
  });

  it('says nothing when the page size is unknown', () => {
    expect(describeRenderSize(null, 300)).toBeNull();
  });
});
