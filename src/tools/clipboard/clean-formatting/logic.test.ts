import { describe, it, expect } from 'vitest';
import { DEFAULT_OPTIONS, type CleanOptions, cleanText, unwrap } from './logic';

const NONE: CleanOptions = {
  straightQuotes: false,
  plainPunctuation: false,
  normalSpaces: false,
  removeInvisible: false,
  trimTrailing: false,
  unwrapLines: false,
  collapseBlankLines: false,
};

const countOf = (result: ReturnType<typeof cleanText>, id: string) =>
  result.changes.find((c) => c.id === id)?.count ?? 0;

describe('cleanText', () => {
  it('leaves text alone when every option is off', () => {
    const input = '“Hola” — café con leche…';
    const result = cleanText(input, NONE);
    expect(result.output).toBe(input);
    expect(result.changes).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('straightens curly quotes and primes, and counts them', () => {
    const result = cleanText('“He said ‘hi’” 5′ 10″', DEFAULT_OPTIONS);
    expect(result.output).toBe('"He said \'hi\'" 5\' 10"');
    expect(countOf(result, 'quotes')).toBe(6);
  });

  it('simplifies dashes and ellipses', () => {
    const result = cleanText('one — two – three…', DEFAULT_OPTIONS);
    expect(result.output).toBe('one - two - three...');
    expect(countOf(result, 'punctuation')).toBe(3);
  });

  it('turns non-breaking and narrow spaces into ordinary spaces', () => {
    const result = cleanText('10\u00A0kg\u2009/\u202Fm', DEFAULT_OPTIONS);
    expect(result.output).toBe('10 kg / m');
    expect(countOf(result, 'spaces')).toBe(3);
  });

  it('removes zero-width characters and soft hyphens', () => {
    const result = cleanText('in\u00ADvis\u200Bible\uFEFF', DEFAULT_OPTIONS);
    expect(result.output).toBe('invisible');
    expect(countOf(result, 'invisible')).toBe(3);
  });

  it('trims trailing spaces per line', () => {
    const result = cleanText('one   \ntwo\t\nthree', DEFAULT_OPTIONS);
    expect(result.output).toBe('one\ntwo\nthree');
    expect(countOf(result, 'trailing')).toBe(2);
  });

  it('collapses runs of blank lines and counts the removed ones', () => {
    const result = cleanText('a\n\n\n\nb', DEFAULT_OPTIONS);
    expect(result.output).toBe('a\n\nb');
    expect(countOf(result, 'blankLines')).toBe(2);
  });

  it('normalises Windows line endings whatever the options say', () => {
    const result = cleanText('a\r\nb\rc', NONE);
    expect(result.output).toBe('a\nb\nc');
    expect(countOf(result, 'lineEndings')).toBe(2);
  });

  it('reports the total number of edits', () => {
    const result = cleanText('“a” b  \n', DEFAULT_OPTIONS);
    expect(result.total).toBe(countOf(result, 'quotes') + countOf(result, 'spaces') + countOf(result, 'trailing'));
    expect(result.total).toBeGreaterThan(0);
  });
});

describe('unwrap', () => {
  it('joins a paragraph that was hard-wrapped mid-sentence', () => {
    const input = [
      'The quick brown fox jumps over the lazy dog and keeps',
      'running until it reaches the far side of the field.',
    ].join('\n');
    const { output, joins } = unwrap(input);
    expect(output).toBe(
      'The quick brown fox jumps over the lazy dog and keeps running until it reaches the far side of the field.',
    );
    expect(joins).toBe(1);
  });

  it('keeps paragraph breaks', () => {
    const input = [
      'The quick brown fox jumps over the lazy dog and keeps',
      'running to the field.',
      '',
      'A second paragraph that is quite long as well, long enough to wrap,',
      'continues here.',
    ].join('\n');
    const { output } = unwrap(input);
    expect(output.split('\n')).toHaveLength(3);
    expect(output).toContain('\n\n');
  });

  it('never joins list items or headings', () => {
    const input = [
      '# A heading that is long enough to look like a wrapped line of prose',
      '- a bullet item that is long enough to look like a wrapped line here',
      '- the following bullet, which must keep its own line no matter what',
      '1. a numbered item that is also long enough to look wrapped to us',
    ].join('\n');
    const { output, joins } = unwrap(input);
    expect(output).toBe(input);
    expect(joins).toBe(0);
  });

  it('leaves short lines alone, since the break was deliberate', () => {
    const input = 'Dear Ana,\nThank you.\nSee you soon.';
    expect(unwrap(input)).toEqual({ output: input, joins: 0 });
  });

  it('repairs a word broken by a hyphen at the end of a line', () => {
    const input = 'This paragraph was justified by the layout engine and hyphen-\nated across the break.';
    const { output, joins } = unwrap(input);
    expect(output).toBe('This paragraph was justified by the layout engine and hyphenated across the break.');
    expect(joins).toBe(1);
  });

  it('does not touch indented blocks such as code', () => {
    const input = 'This line is long enough to be considered a wrapped line of prose here\n    const x = 1;';
    expect(unwrap(input).joins).toBe(0);
  });
});
