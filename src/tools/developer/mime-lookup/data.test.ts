import { describe, it, expect } from 'vitest';
import { MIME_TYPES, byExtension, byMime, searchMimes } from './data';

describe('the table', () => {
  it('covers a broad set of types', () => {
    expect(MIME_TYPES.length).toBeGreaterThanOrEqual(180);
  });

  it('is well formed', () => {
    for (const entry of MIME_TYPES) {
      expect(entry.mime).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
      expect(entry.label.length).toBeGreaterThan(0);
      for (const ext of entry.extensions) expect(ext).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe('byExtension', () => {
  it('finds a type from an extension with or without a dot', () => {
    expect(byExtension('png').map((e) => e.mime)).toEqual(['image/png']);
    expect(byExtension('.PNG').map((e) => e.mime)).toEqual(['image/png']);
    expect(byExtension('*.png').map((e) => e.mime)).toEqual(['image/png']);
  });

  it('returns every type that claims an extension', () => {
    expect(byExtension('ico').length).toBeGreaterThan(1);
    expect(byExtension('wav').map((e) => e.mime)).toContain('audio/wav');
  });

  it('returns nothing for an unknown extension', () => {
    expect(byExtension('qqq')).toEqual([]);
    expect(byExtension('')).toEqual([]);
  });
});

describe('byMime', () => {
  it('prefers an exact match', () => {
    expect(byMime('image/png').map((e) => e.extensions[0])).toEqual(['png']);
    expect(byMime('IMAGE/PNG')).toHaveLength(1);
  });

  it('falls back to a partial match', () => {
    const results = byMime('opendocument');
    expect(results.length).toBeGreaterThan(2);
    expect(results.every((e) => e.mime.includes('opendocument'))).toBe(true);
  });
});

describe('searchMimes', () => {
  it('puts the exact extension hit first', () => {
    expect(searchMimes('png', 'any', 'all')[0].mime).toBe('image/png');
    expect(searchMimes('json', 'any', 'all')[0].mime).toBe('application/json');
  });

  it('searches the label too', () => {
    expect(searchMimes('subtitle', 'any', 'all').map((e) => e.mime)).toContain('text/vtt');
  });

  it('honours the mode', () => {
    expect(searchMimes('image', 'extension', 'all')).toEqual([]);
    expect(searchMimes('image', 'mime', 'all').length).toBeGreaterThan(10);
  });

  it('honours the category filter', () => {
    const fonts = searchMimes('', 'any', 'font');
    expect(fonts.length).toBeGreaterThan(5);
    expect(fonts.every((e) => e.category === 'font')).toBe(true);
  });
});
