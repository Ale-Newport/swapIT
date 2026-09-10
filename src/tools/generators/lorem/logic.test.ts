import { describe, expect, it } from 'vitest';
import { MAX_COUNT, OPENERS, SOURCES, countWords, generateLorem, type LoremOptions } from './logic';

const base: LoremOptions = {
  unit: 'paragraphs',
  count: 3,
  source: 'latin',
  startWithLorem: true,
  html: false,
};

describe('word sources', () => {
  it('bundles two lists with no duplicates', () => {
    expect(SOURCES.latin.length).toBeGreaterThan(100);
    expect(SOURCES.english.length).toBeGreaterThan(100);
    expect(new Set(SOURCES.latin).size).toBe(SOURCES.latin.length);
    expect(new Set(SOURCES.english).size).toBe(SOURCES.english.length);
  });
});

describe('generateLorem', () => {
  it('produces exactly the number of words asked for', () => {
    for (const count of [1, 7, 40, 200]) {
      const { text } = generateLorem({ ...base, unit: 'words', count });
      expect(countWords(text)).toBe(count);
    }
  });

  it('starts with the classic opening when asked, and not when it is off', () => {
    const on = generateLorem({ ...base, unit: 'paragraphs', count: 1 });
    expect(on.text.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit.')).toBe(true);
    const off = generateLorem({ ...base, startWithLorem: false, count: 1 });
    expect(off.text.startsWith('Lorem ipsum dolor sit amet')).toBe(false);
  });

  it('uses an English opening for the English source', () => {
    const { text } = generateLorem({ ...base, source: 'english', unit: 'sentences', count: 2 });
    expect(text.startsWith(OPENERS.english)).toBe(true);
    expect(text).not.toContain('ipsum');
  });

  it('makes one block per paragraph, each with several sentences', () => {
    const { blocks } = generateLorem({ ...base, count: 4 });
    expect(blocks).toHaveLength(4);
    for (const block of blocks) {
      const sentences = block.split('. ').length;
      expect(sentences).toBeGreaterThanOrEqual(3);
      expect(block.endsWith('.')).toBe(true);
    }
  });

  it('joins sentences on one line and separates paragraphs by a blank line', () => {
    expect(generateLorem({ ...base, unit: 'sentences', count: 3 }).text).not.toContain('\n');
    expect(generateLorem({ ...base, unit: 'paragraphs', count: 2 }).text).toContain('\n\n');
  });

  it('wraps HTML paragraphs and list items', () => {
    const paragraphs = generateLorem({ ...base, unit: 'paragraphs', count: 2, html: true }).text;
    expect(paragraphs.split('<p>')).toHaveLength(3);
    expect(paragraphs).toContain('</p>');

    const list = generateLorem({ ...base, unit: 'list', count: 3, html: true }).text;
    expect(list.startsWith('<ul>')).toBe(true);
    expect(list.trimEnd().endsWith('</ul>')).toBe(true);
    expect(list.match(/<li>/g)).toHaveLength(3);
  });

  it('bullets a plain-text list instead of leaving it as prose', () => {
    const { text } = generateLorem({ ...base, unit: 'list', count: 3 });
    expect(text.split('\n')).toHaveLength(3);
    expect(text.startsWith('• ')).toBe(true);
  });

  it('caps the count and never returns nothing', () => {
    expect(generateLorem({ ...base, count: 0 }).blocks).toHaveLength(1);
    expect(generateLorem({ ...base, unit: 'sentences', count: 9999 }).blocks).toHaveLength(MAX_COUNT);
  });

  it('varies between runs', () => {
    const a = generateLorem({ ...base, startWithLorem: false, count: 5 }).text;
    const b = generateLorem({ ...base, startWithLorem: false, count: 5 }).text;
    expect(a).not.toBe(b);
  });
});

describe('countWords', () => {
  it('ignores markup', () => {
    expect(countWords('<p>one two three</p>')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
