import { describe, it, expect } from 'vitest';
import { slugifyLine, slugifyText, transliterate, type SlugOptions } from './logic';

const base: SlugOptions = { separator: '-', stripStopWords: false, maxLength: 0 };

describe('transliterate', () => {
  it('folds Latin-1 accents to plain letters', () => {
    expect(transliterate('áéíóú àèìòù âêîôû ãñõ äëïöü')).toBe('aeiou aeiou aeiou ano aeiou');
  });

  it('expands the ligatures and letters that have no accent to strip', () => {
    expect(transliterate('Straße')).toBe('strasse');
    expect(transliterate('Æon Øre œuvre')).toBe('aeon ore oeuvre');
  });

  it('handles Central European letters through NFD', () => {
    expect(transliterate('Čeština Łódź')).toBe('cestina lodz');
  });
});

describe('slugifyLine', () => {
  it('lowercases and joins with the separator', () => {
    expect(slugifyLine('Hello World', base)).toBe('hello-world');
  });

  it('uses an underscore when asked', () => {
    expect(slugifyLine('Hello World', { ...base, separator: '_' })).toBe('hello_world');
  });

  it('drops punctuation and collapses the gaps', () => {
    expect(slugifyLine('  What?! Is   this... "thing"?  ', base)).toBe('what-is-this-thing');
  });

  it('spells out symbols people expect to keep meaning', () => {
    expect(slugifyLine('Salt & Pepper', base)).toBe('salt-and-pepper');
    expect(slugifyLine('C++ guide', base)).toBe('c-plus-plus-guide');
  });

  it('keeps digits', () => {
    expect(slugifyLine('Top 10 songs of 2024', base)).toBe('top-10-songs-of-2024');
  });

  it('removes stop words in both languages when asked', () => {
    expect(slugifyLine('The Best of the Beatles', { ...base, stripStopWords: true })).toBe('best-beatles');
    expect(slugifyLine('La casa de los espíritus', { ...base, stripStopWords: true })).toBe('casa-espiritus');
  });

  it('keeps the stop words rather than returning an empty slug', () => {
    expect(slugifyLine('The One', { ...base, stripStopWords: true })).toBe('one');
    expect(slugifyLine('of the', { ...base, stripStopWords: true })).toBe('of-the');
  });

  it('truncates between words, never mid-word', () => {
    expect(slugifyLine('one two three four', { ...base, maxLength: 12 })).toBe('one-two');
    expect(slugifyLine('one two three four', { ...base, maxLength: 13 })).toBe('one-two-three');
  });

  it('cuts a single over-long word because there is no boundary to use', () => {
    expect(slugifyLine('supercalifragilistic', { ...base, maxLength: 6 })).toBe('superc');
  });

  it('returns an empty string for a line with nothing usable', () => {
    expect(slugifyLine('¡¿— …!', base)).toBe('');
  });
});

describe('slugifyText', () => {
  it('slugs every line and keeps the line count', () => {
    const r = slugifyText('First Title\nSecond Title', base);
    expect(r.output).toBe('first-title\nsecond-title');
    expect(r.slugs).toHaveLength(2);
  });

  it('flags slugs that would collide', () => {
    const r = slugifyText('Hello World\nhello  world!\nOther', base);
    expect(r.duplicates).toBe(1);
  });

  it('counts lines that produced nothing but ignores blank ones', () => {
    const r = slugifyText('Good\n\n???', base);
    expect(r.empty).toBe(1);
  });
});
