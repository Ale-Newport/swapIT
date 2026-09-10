import { describe, expect, it } from 'vitest';
import { isEffectivelyEmpty, textStats, truncateForPreview } from './logic';

describe('isEffectivelyEmpty', () => {
  it('recognises the shape of a scanned PDF: page breaks and nothing else', () => {
    expect(isEffectivelyEmpty('\f\f\f')).toBe(true);
    expect(isEffectivelyEmpty('')).toBe(true);
    expect(isEffectivelyEmpty('\n   \n\f')).toBe(true);
  });

  it('sees through non-breaking spaces and zero-width characters', () => {
    expect(isEffectivelyEmpty('\u00a0\u200b\ufeff\f')).toBe(true);
  });

  it('does not discard a page holding a single character', () => {
    expect(isEffectivelyEmpty('\f7\f')).toBe(false);
    expect(isEffectivelyEmpty('  Hello  \f')).toBe(false);
  });
});

describe('textStats', () => {
  it('counts pages from the form feeds pdftotext writes', () => {
    expect(textStats('one\f two\f').pages).toBe(2);
    expect(textStats('no page marker').pages).toBe(0);
  });

  it('counts words and lines without letting page breaks distort them', () => {
    const stats = textStats('Hello there\nsecond line\f');
    expect(stats.words).toBe(4);
    expect(stats.lines).toBe(2);
    expect(stats.characters).toBe('Hello there\nsecond line'.length);
  });

  it('reports zero for an empty extraction', () => {
    expect(textStats('\f\f')).toEqual({ characters: 0, words: 0, lines: 0, pages: 2 });
  });

  it('does not count a trailing newline as an extra line', () => {
    expect(textStats('one\ntwo\n').lines).toBe(2);
  });
});

describe('truncateForPreview', () => {
  it('leaves a short extraction alone', () => {
    expect(truncateForPreview('abcdef', 10)).toEqual({ text: 'abcdef', truncated: false });
  });

  it('cuts a long one and says so', () => {
    expect(truncateForPreview('abcdef', 3)).toEqual({ text: 'abc', truncated: true });
  });

  it('treats a zero limit as no limit rather than blanking the pane', () => {
    expect(truncateForPreview('abc', 0)).toEqual({ text: 'abc', truncated: false });
  });
});
