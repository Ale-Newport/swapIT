import { describe, it, expect } from 'vitest';
import {
  MAX_MATCHES,
  applyReplacement,
  captureNames,
  compileRegex,
  findMatches,
  highlightSegments,
  matchStats,
} from './logic';

describe('compileRegex', () => {
  it('builds a regex with flags', () => {
    const re = compileRegex('a+', 'gi');
    expect(re.source).toBe('a+');
    expect(re.flags).toBe('gi');
  });

  it('explains a broken pattern in a sentence', () => {
    expect(() => compileRegex('a(', 'g')).toThrow(/^This pattern is not valid: /);
    expect(() => compileRegex('a{2,1}', '')).toThrow(/not valid/);
    expect(() => compileRegex('', 'g')).toThrow('Type a pattern to test. An empty pattern matches nothing useful.');
  });

  it('rejects an impossible flag combination', () => {
    expect(() => compileRegex('a', 'gg')).toThrow(/not valid/);
  });
});

describe('captureNames', () => {
  it('counts capturing groups and names them', () => {
    expect(captureNames('(a)(?:b)(?<year>\\d{4})')).toEqual([null, 'year']);
    expect(captureNames('(?<a>x)(?<b>y)')).toEqual(['a', 'b']);
    expect(captureNames('nothing')).toEqual([]);
  });

  it('ignores parentheses inside classes and escapes', () => {
    expect(captureNames('[()](\\()')).toEqual([null]);
    expect(captureNames('\\(literal\\)')).toEqual([]);
  });

  it('ignores lookarounds', () => {
    expect(captureNames('(?=a)(?!b)(?<=c)(?<!d)(e)')).toEqual([null]);
  });
});

describe('findMatches', () => {
  it('finds every match when global', () => {
    const report = findMatches(compileRegex('\\d+', 'g'), 'a1 b22 c333');
    expect(report.matches.map((m) => m.text)).toEqual(['1', '22', '333']);
    expect(report.matches.map((m) => m.index)).toEqual([1, 4, 8]);
    expect(report.truncated).toBe(false);
  });

  it('stops at the first match when not global', () => {
    const report = findMatches(compileRegex('\\d+', ''), 'a1 b22');
    expect(report.matches).toHaveLength(1);
    expect(report.matches[0].text).toBe('1');
  });

  it('terminates on a zero-length match', () => {
    const report = findMatches(compileRegex('a*', 'g'), 'bab');
    expect(report.matches.map((m) => `${m.index}:${m.text}`)).toEqual(['0:', '1:a', '2:', '3:']);
  });

  it('reports capture groups including named ones', () => {
    const report = findMatches(compileRegex('(?<key>\\w+)=(?<value>\\d+)', 'g'), 'a=1 b=2');
    expect(report.matches).toHaveLength(2);
    expect(report.matches[0].groups).toEqual([
      { index: 1, name: 'key', value: 'a' },
      { index: 2, name: 'value', value: '1' },
    ]);
  });

  it('keeps an unmatched optional group as undefined', () => {
    const report = findMatches(compileRegex('(a)?(b)', 'g'), 'b');
    expect(report.matches[0].groups).toEqual([
      { index: 1, name: null, value: undefined },
      { index: 2, name: null, value: 'b' },
    ]);
  });

  it('caps runaway match counts', () => {
    const report = findMatches(compileRegex('x', 'g'), 'x'.repeat(MAX_MATCHES + 50));
    expect(report.matches).toHaveLength(MAX_MATCHES);
    expect(report.truncated).toBe(true);
  });

  it('handles empty input', () => {
    expect(findMatches(compileRegex('a', 'g'), '')).toEqual({ matches: [], truncated: false });
  });

  it('does not depend on a leftover lastIndex', () => {
    const re = compileRegex('a', 'g');
    re.lastIndex = 5;
    expect(findMatches(re, 'aaa').matches).toHaveLength(3);
  });
});

describe('highlightSegments', () => {
  it('splits the text into plain and matched runs', () => {
    const text = 'a1 b22';
    const { matches } = findMatches(compileRegex('\\d+', 'g'), text);
    expect(highlightSegments(text, matches)).toEqual([
      { text: 'a', match: null },
      { text: '1', match: 0 },
      { text: ' b', match: null },
      { text: '22', match: 1 },
    ]);
  });

  it('skips zero-length matches without losing text', () => {
    const text = 'bab';
    const { matches } = findMatches(compileRegex('a*', 'g'), text);
    expect(highlightSegments(text, matches).map((s) => s.text).join('')).toBe(text);
  });

  it('returns the whole string when nothing matches', () => {
    expect(highlightSegments('hello', [])).toEqual([{ text: 'hello', match: null }]);
  });
});

describe('applyReplacement', () => {
  it('uses numbered and named references', () => {
    expect(applyReplacement(compileRegex('(\\w+)@(\\w+)', 'g'), 'a@b c@d', '$2:$1')).toBe('b:a d:c');
    expect(applyReplacement(compileRegex('(?<n>\\d+)', 'g'), 'x1y2', '[$<n>]')).toBe('x[1]y[2]');
  });

  it('replaces only the first match without the global flag', () => {
    expect(applyReplacement(compileRegex('a', ''), 'aaa', 'b')).toBe('baa');
  });

  it('gives the same answer every time for a sticky pattern', () => {
    // `String.replace` writes lastIndex on a sticky regex, so reusing the same
    // instance used to walk the result forward: 'Xaa', then 'aXa', then 'aaX'.
    const sticky = compileRegex('a', 'y');
    expect(applyReplacement(sticky, 'aaa', 'X')).toBe('Xaa');
    expect(applyReplacement(sticky, 'aaa', 'X')).toBe('Xaa');
    expect(applyReplacement(sticky, 'aaa', 'X')).toBe('Xaa');
    expect(sticky.lastIndex).toBe(0);
  });
});

describe('matchStats', () => {
  it('counts matches, unique values and coverage', () => {
    const text = 'aa bb aa';
    const { matches } = findMatches(compileRegex('\\w+', 'g'), text);
    expect(matchStats(matches, text.length)).toEqual({ count: 3, unique: 2, coverage: 75 });
    expect(matchStats([], 0).coverage).toBe(0);
  });
});
