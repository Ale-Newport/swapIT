import { describe, it, expect } from 'vitest';
import { toCsv, tokenize, wordFrequency, type FrequencyOptions } from './logic';

const base: FrequencyOptions = { caseSensitive: false, stopWords: 'none', minLength: 1, topN: 0 };

describe('tokenize', () => {
  it('keeps apostrophes and hyphens inside words', () => {
    expect(tokenize("don't state-of-the-art")).toEqual(["don't", 'state-of-the-art']);
  });

  it('splits on punctuation and keeps digits', () => {
    expect(tokenize('one, two. 3 four!')).toEqual(['one', 'two', '3', 'four']);
  });

  it('handles accented and non-Latin letters', () => {
    expect(tokenize('café niño 東京')).toEqual(['café', 'niño', '東京']);
  });
});

describe('wordFrequency', () => {
  it('counts case-insensitively by default', () => {
    const r = wordFrequency('Fox fox FOX dog', base);
    expect(r.rows[0]).toMatchObject({ word: 'fox', count: 3 });
    expect(r.uniqueWords).toBe(2);
  });

  it('separates casings when case sensitivity is on', () => {
    const r = wordFrequency('Fox fox', { ...base, caseSensitive: true });
    expect(r.uniqueWords).toBe(2);
  });

  it('breaks count ties alphabetically so the order is stable', () => {
    const r = wordFrequency('beta alpha', base);
    expect(r.rows.map((x) => x.word)).toEqual(['alpha', 'beta']);
  });

  it('drops English stop words', () => {
    const r = wordFrequency('the fox and the dog', { ...base, stopWords: 'english' });
    expect(r.rows.map((x) => x.word)).toEqual(['dog', 'fox']);
    expect(r.totalWords).toBe(5);
    expect(r.countedWords).toBe(2);
  });

  it('drops Spanish stop words', () => {
    const r = wordFrequency('el perro y la casa', { ...base, stopWords: 'spanish' });
    expect(r.rows.map((x) => x.word)).toEqual(['casa', 'perro']);
  });

  it('drops both lists at once', () => {
    const r = wordFrequency('the perro and la casa', { ...base, stopWords: 'both' });
    expect(r.rows.map((x) => x.word)).toEqual(['casa', 'perro']);
  });

  it('still filters stop words when case sensitivity is on', () => {
    const r = wordFrequency('The Fox', { ...base, caseSensitive: true, stopWords: 'english' });
    expect(r.rows.map((x) => x.word)).toEqual(['Fox']);
  });

  it('applies the minimum length filter', () => {
    const r = wordFrequency('a bb ccc dddd', { ...base, minLength: 3 });
    expect(r.rows.map((x) => x.word)).toEqual(['ccc', 'dddd']);
  });

  it('limits to the top N without changing the totals', () => {
    const r = wordFrequency('a a a b b c', { ...base, topN: 2 });
    expect(r.rows.map((x) => x.word)).toEqual(['a', 'b']);
    expect(r.uniqueWords).toBe(3);
  });

  it('computes each share against the counted words', () => {
    const r = wordFrequency('a a b b', base);
    expect(r.rows[0].share).toBeCloseTo(50);
  });

  it('returns an empty ranking for text without words', () => {
    const r = wordFrequency('!!! ???', base);
    expect(r.rows).toEqual([]);
    expect(r.countedWords).toBe(0);
  });
});

describe('toCsv', () => {
  it('writes a header and one row per word', () => {
    const csv = toCsv(wordFrequency('a a b', base).rows);
    expect(csv.split('\n')).toEqual(['rank,word,count,share', '1,a,2,66.67%', '2,b,1,33.33%']);
  });

  it('quotes a word that would break the columns', () => {
    expect(toCsv([{ rank: 1, word: 'a,b', count: 1, share: 100 }])).toContain('"a,b"');
  });
});
