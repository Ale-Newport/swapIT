import { describe, it, expect } from 'vitest';
import { applyReplace, buildRegex, hasNestedQuantifier, scanMatches, unescapeReplacement } from './logic';

describe('buildRegex', () => {
  it('builds a working regex from a pattern and flags', () => {
    const re = buildRegex('a+', 'gi');
    expect(re.source).toBe('a+');
    expect(re.flags).toBe('gi');
  });

  it('explains an unbalanced bracket instead of leaking a raw SyntaxError', () => {
    expect(() => buildRegex('(unclosed', 'g')).toThrowError(/not valid regular expression syntax/);
  });

  it('asks for a pattern when none was given', () => {
    expect(() => buildRegex('', 'g')).toThrowError(/Enter a pattern/);
  });
});

describe('scanMatches', () => {
  it('counts every match and keeps the first few with their groups', () => {
    const scan = scanMatches(buildRegex('(\\w)(\\d)', 'g'), 'a1 b2 c3', 2);
    expect(scan.total).toBe(3);
    expect(scan.matches).toHaveLength(2);
    expect(scan.matches[0]).toMatchObject({ text: 'a1', groups: ['a', '1'], line: 1 });
  });

  it('reports the line each match sits on', () => {
    const scan = scanMatches(buildRegex('x', 'g'), 'a\nb\nx', 20);
    expect(scan.matches[0].line).toBe(3);
  });

  it('counts every match even when the pattern lacks the g flag', () => {
    expect(scanMatches(buildRegex('a', ''), 'aaa', 20).total).toBe(3);
  });

  it('does not hang on a pattern that can match nothing', () => {
    const scan = scanMatches(buildRegex('b*', 'g'), 'aaa', 20);
    expect(scan.total).toBe(4);
    expect(scan.truncated).toBe(false);
  });

  it('turns an unmatched optional group into an empty string', () => {
    const scan = scanMatches(buildRegex('(a)(b)?', 'g'), 'a', 20);
    expect(scan.matches[0].groups).toEqual(['a', '']);
  });
});

describe('applyReplace', () => {
  it('supports capture group references', () => {
    expect(applyReplace(buildRegex('(\\d{4})-(\\d{2})-(\\d{2})', 'g'), '2024-01-15', '$3/$2/$1')).toBe('15/01/2024');
  });

  it('replaces only the first match without the g flag', () => {
    expect(applyReplace(buildRegex('a', ''), 'aaa', 'b')).toBe('baa');
  });

  it('is not affected by a previous scan leaving lastIndex behind', () => {
    const re = buildRegex('a', 'g');
    scanMatches(re, 'aaa', 20);
    expect(applyReplace(re, 'aaa', 'b')).toBe('bbb');
  });
});

describe('hasNestedQuantifier', () => {
  it('spots the shapes that backtrack exponentially', () => {
    expect(hasNestedQuantifier('(a+)+$')).toBe(true);
    expect(hasNestedQuantifier('^(\\s*\\w+)*$')).toBe(true);
    expect(hasNestedQuantifier('(a|a)+')).toBe(true);
    expect(hasNestedQuantifier('(x(y+))*')).toBe(true);
    expect(hasNestedQuantifier('(a{2,})+')).toBe(true);
  });

  it('leaves ordinary patterns alone', () => {
    expect(hasNestedQuantifier('(\\d{4})-(\\d{2})-(\\d{2})')).toBe(false);
    expect(hasNestedQuantifier('a+b+')).toBe(false);
    expect(hasNestedQuantifier('(abc)+')).toBe(false);
    expect(hasNestedQuantifier('\\(a+\\)+')).toBe(false); // escaped parens are literals
    expect(hasNestedQuantifier('')).toBe(false);
  });
});

describe('unescapeReplacement', () => {
  it('turns typed escapes into real characters', () => {
    expect(unescapeReplacement('a\\nb\\tc')).toBe('a\nb\tc');
  });

  it('keeps a literal backslash pair as one backslash', () => {
    expect(unescapeReplacement('a\\\\n')).toBe('a\\n');
  });

  it('leaves unknown escapes alone so $ and \\d survive', () => {
    expect(unescapeReplacement('\\d $1')).toBe('\\d $1');
  });

  it('keeps a trailing backslash', () => {
    expect(unescapeReplacement('end\\')).toBe('end\\');
  });
});
