import { describe, it, expect } from 'vitest';
import {
  characterName,
  classify,
  flagFor,
  formatCodePoint,
  inspectText,
  reportText,
  summarize,
  utf16Hex,
  utf8Hex,
} from './logic';

describe('summarize', () => {
  it('answers "why is my emoji seven characters"', () => {
    const family = '\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
    const summary = summarize(family);
    expect(summary.graphemes).toBe(1);
    expect(summary.codePoints).toBe(7);
    expect(summary.utf16Units).toBe(11);
    expect(summary.utf8Bytes).toBe(25);
    expect(summary.exactGraphemes).toBe(true);
  });

  it('counts a flag and a combining sequence as one grapheme each', () => {
    expect(summarize('\u{1F1EA}\u{1F1F8}').graphemes).toBe(1);
    expect(summarize('\u{1F1EA}\u{1F1F8}').codePoints).toBe(2);
    expect(summarize('e\u0301').graphemes).toBe(1);
    expect(summarize('e\u0301').codePoints).toBe(2);
    expect(summarize('\u00E9').codePoints).toBe(1);
  });

  it('agrees with the plain counts for ASCII', () => {
    const summary = summarize('hello');
    expect([summary.graphemes, summary.codePoints, summary.utf16Units, summary.utf8Bytes]).toEqual([5, 5, 5, 5]);
  });

  it('counts flagged characters separately', () => {
    const summary = summarize('a\u200Bb\u00A0c\u2019d');
    expect(summary.invisible).toBe(2);
    expect(summary.lookalike).toBe(1);
  });
});

describe('flagFor', () => {
  it('flags the characters people come here to find', () => {
    expect(flagFor(0x200b)?.name).toBe('ZERO WIDTH SPACE');
    expect(flagFor(0x200d)?.name).toBe('ZERO WIDTH JOINER');
    expect(flagFor(0x00a0)?.name).toBe('NO-BREAK SPACE');
    expect(flagFor(0x00ad)?.name).toBe('SOFT HYPHEN');
    expect(flagFor(0x200f)?.name).toBe('RIGHT-TO-LEFT MARK');
    expect(flagFor(0xfeff)?.kind).toBe('invisible');
    expect(flagFor(0x202e)?.kind).toBe('invisible');
    expect(flagFor(0x2069)?.kind).toBe('invisible');
  });

  it('flags lookalikes that break parsers', () => {
    expect(flagFor(0x2019)?.kind).toBe('lookalike');
    expect(flagFor(0x2212)?.kind).toBe('lookalike');
    expect(flagFor(0xff21)?.name).toBe('Full-width form');
    expect(flagFor(0x0430)?.note).toMatch(/Latin “a”/);
    expect(flagFor(0x039f)?.note).toMatch(/Latin “O”/);
  });

  it('leaves ordinary characters unflagged', () => {
    for (const codePoint of [0x41, 0x20, 0x39, 0x1f600, 0x4e2d, 0x0a]) {
      expect(flagFor(codePoint)).toBeNull();
    }
  });

  it('catches format characters that are not in the table', () => {
    expect(flagFor(0x0600)?.kind).toBe('invisible'); // ARABIC NUMBER SIGN, general category Cf
  });
});

describe('classify and characterName', () => {
  it('labels the categories the table promises', () => {
    expect(classify('A', 0x41)).toBe('ASCII letter');
    expect(classify('7', 0x37)).toBe('ASCII digit');
    expect(classify('!', 0x21)).toBe('ASCII punctuation');
    expect(classify(' ', 0x20)).toBe('Whitespace');
    expect(classify('\u00A0', 0xa0)).toBe('Whitespace');
    expect(classify('\n', 0x0a)).toBe('Whitespace');
    expect(classify('\u0007', 0x07)).toBe('Control');
    expect(classify('\u200B', 0x200b)).toBe('Invisible format');
    expect(classify('\u0301', 0x301)).toBe('Combining mark');
    expect(classify('\u{1F600}', 0x1f600)).toBe('Emoji');
    expect(classify('中', 0x4e2d)).toBe('Letter');
    expect(classify('€', 0x20ac)).toBe('Symbol');
  });

  it('names what it can and admits what it cannot', () => {
    expect(characterName(0x41)).toBe('LATIN CAPITAL LETTER A');
    expect(characterName(0x7a)).toBe('LATIN SMALL LETTER Z');
    expect(characterName(0x30)).toBe('DIGIT ZERO');
    expect(characterName(0x20)).toBe('SPACE');
    expect(characterName(0x0a)).toBe('LINE FEED');
    expect(characterName(0x7f)).toBe('DELETE');
    expect(characterName(0x2019)).toBe('RIGHT SINGLE QUOTATION MARK');
    expect(characterName(0x4e2d)).toBeNull();
  });
});

describe('encodings', () => {
  it('prints UTF-8 and UTF-16 the way a debugger would', () => {
    expect(utf8Hex('\u{1F600}')).toBe('F0 9F 98 80');
    expect(utf16Hex('\u{1F600}')).toBe('D83D DE00');
    expect(utf8Hex('\u00E9')).toBe('C3 A9');
    expect(utf16Hex('\u00E9')).toBe('00E9');
    expect(utf8Hex('A')).toBe('41');
  });

  it('pads code points to at least four digits', () => {
    expect(formatCodePoint(0x0a)).toBe('U+000A');
    expect(formatCodePoint(0x1f600)).toBe('U+1F600');
  });
});

describe('inspectText', () => {
  it('walks by code point, not by UTF-16 unit', () => {
    const result = inspectText('a\u{1F600}');
    expect(result.chars).toHaveLength(2);
    expect(result.chars[1].codePoint).toBe(0x1f600);
    expect(result.chars[1].unitLength).toBe(2);
    expect(result.chars[1].byteLength).toBe(4);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('stops at the limit but still reports the true total', () => {
    const result = inspectText('a'.repeat(600), 500);
    expect(result.chars).toHaveLength(500);
    expect(result.total).toBe(600);
    expect(result.truncated).toBe(true);
  });

  it('gives invisible characters a printable stand-in', () => {
    const rows = inspectText(' \u00A0\u200B\n\u0007e\u0301').chars;
    expect(rows.map((r) => r.display)).toEqual(['\u2420', '\u2423', '', '\u240A', '\u2407', 'e', '\u25CC\u0301']);
    expect(rows[2].flag?.name).toBe('ZERO WIDTH SPACE');
    expect(rows[3].name).toBe('LINE FEED');
  });
});

describe('reportText', () => {
  it('produces a copyable table with the summary on top', () => {
    const text = 'a\u200B';
    const report = reportText(inspectText(text), summarize(text));
    expect(report).toMatch(/2 code points/);
    expect(report).toMatch(/U\+200B/);
    expect(report).toMatch(/ZERO WIDTH SPACE/);
    expect(report.split('\n')[2]).toMatch(/^#\s+Char\s+Code point/);
  });

  it('says when the table was cut short', () => {
    const long = 'x'.repeat(20);
    const result = inspectText(long, 5);
    expect(reportText(result, summarize(long))).toMatch(/first 5 of 20 code points/);
  });
});
