import { describe, it, expect } from 'vitest';
import { countText, lineReport, readingTime, words } from './logic';

describe('words', () => {
  it('counts contractions and compounds once', () => {
    expect(words("it's a state-of-the-art build")).toEqual(["it's", 'a', 'state-of-the-art', 'build']);
  });

  it('ignores punctuation-only runs', () => {
    expect(words('-- ... !')).toEqual([]);
  });
});

describe('countText', () => {
  it('counts characters with and without whitespace', () => {
    const s = countText('ab cd\nef');
    expect(s.characters).toBe(8);
    expect(s.charactersNoSpaces).toBe(6);
  });

  it('counts lines including blank ones', () => {
    expect(countText('a\n\nb').lines).toBe(3);
    expect(countText('').lines).toBe(0);
  });

  it('counts a paragraph as a block separated by a blank line', () => {
    expect(countText('one\ntwo\n\nthree').paragraphs).toBe(2);
  });

  it('counts sentences, including a final one without punctuation', () => {
    expect(countText('One. Two! Three? Four').sentences).toBe(4);
    expect(countText('Wait… what?').sentences).toBe(2);
  });

  it('counts unique words case-insensitively', () => {
    const s = countText('Fox fox FOX dog');
    expect(s.words).toBe(4);
    expect(s.uniqueWords).toBe(2);
  });
});

describe('readingTime', () => {
  it('reports short texts as under a minute', () => {
    expect(readingTime(50)).toBe('under a minute');
  });

  it('rounds to whole minutes at 200 wpm', () => {
    expect(readingTime(600)).toBe('about 3 min');
    expect(readingTime(120)).toBe('about 1 min');
  });

  it('has nothing to report for empty text', () => {
    expect(readingTime(0)).toBe('—');
  });
});

describe('lineReport', () => {
  it('flags only the lines past the limit', () => {
    const rows = lineReport('short\nthis one is much longer', 10);
    expect(rows.map((r) => r.over)).toEqual([false, true]);
    expect(rows[1].length).toBe(23);
  });

  it('returns nothing for empty text', () => {
    expect(lineReport('', 10)).toEqual([]);
  });
});
