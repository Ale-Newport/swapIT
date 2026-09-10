import { describe, it, expect } from 'vitest';
import { removeEmptyLines } from './logic';

describe('removeEmptyLines', () => {
  it('removes every blank line', () => {
    const r = removeEmptyLines('a\n\n\nb\n\nc', { mode: 'remove', whitespaceIsBlank: true });
    expect(r.output).toBe('a\nb\nc');
    expect(r.removed).toBe(3);
  });

  it('collapses runs into a single blank line', () => {
    expect(removeEmptyLines('a\n\n\n\nb', { mode: 'collapse', whitespaceIsBlank: true }).output).toBe('a\n\nb');
  });

  it('leaves a single blank line alone when collapsing', () => {
    expect(removeEmptyLines('a\n\nb', { mode: 'collapse', whitespaceIsBlank: true }).output).toBe('a\n\nb');
  });

  it('treats whitespace-only lines as blank when asked', () => {
    expect(removeEmptyLines('a\n   \nb', { mode: 'remove', whitespaceIsBlank: true }).output).toBe('a\nb');
    expect(removeEmptyLines('a\n   \nb', { mode: 'remove', whitespaceIsBlank: false }).output).toBe('a\n   \nb');
  });

  it('counts a whitespace run as one run when collapsing', () => {
    expect(removeEmptyLines('a\n \n\t\n\nb', { mode: 'collapse', whitespaceIsBlank: true }).output).toBe('a\n\nb');
  });

  it('leaves a truly blank line behind, not the spaces it collapsed', () => {
    expect(removeEmptyLines('a\n   \n\nb', { mode: 'collapse', whitespaceIsBlank: true }).output).toBe('a\n\nb');
  });

  it('keeps a whitespace line verbatim when it does not count as blank', () => {
    expect(removeEmptyLines('a\n \n\n\nb', { mode: 'collapse', whitespaceIsBlank: false }).output).toBe('a\n \n\nb');
  });

  it('keeps a trailing newline', () => {
    expect(removeEmptyLines('a\n\nb\n', { mode: 'remove', whitespaceIsBlank: true }).output).toBe('a\nb\n');
  });

  it('drops leading blank lines too', () => {
    expect(removeEmptyLines('\n\na', { mode: 'remove', whitespaceIsBlank: true }).output).toBe('a');
  });

  it('returns an empty string when everything was blank', () => {
    expect(removeEmptyLines('\n \n\n', { mode: 'remove', whitespaceIsBlank: true }).output).toBe('');
  });
});
