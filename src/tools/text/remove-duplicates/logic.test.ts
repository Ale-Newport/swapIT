import { describe, it, expect } from 'vitest';
import { removeDuplicates, type DedupeOptions } from './logic';

const base: DedupeOptions = { caseSensitive: true, trimForCompare: false, keep: 'first', mode: 'unique' };

describe('removeDuplicates', () => {
  it('keeps the first occurrence in its original position', () => {
    const r = removeDuplicates('b\na\nb\nc\na', base);
    expect(r.output).toBe('b\na\nc');
    expect(r.linesIn).toBe(5);
    expect(r.linesOut).toBe(3);
    expect(r.removed).toBe(2);
  });

  it('keeps the last occurrence, which reorders the survivors', () => {
    expect(removeDuplicates('b\na\nb\nc\na', { ...base, keep: 'last' }).output).toBe('b\nc\na');
  });

  it('folds case when case sensitivity is off', () => {
    expect(removeDuplicates('Apple\napple\nAPPLE', { ...base, caseSensitive: false }).output).toBe('Apple');
  });

  it('respects case when case sensitivity is on', () => {
    expect(removeDuplicates('Apple\napple', base).output).toBe('Apple\napple');
  });

  it('can ignore surrounding whitespace while keeping the original text', () => {
    const r = removeDuplicates('  cat\ncat  \ndog', { ...base, trimForCompare: true });
    expect(r.output).toBe('  cat\ndog');
  });

  it('lists only repeated values in duplicates mode', () => {
    const r = removeDuplicates('a\nb\na\nc\nb\nb', { ...base, mode: 'duplicates' });
    expect(r.output).toBe('a\nb');
    expect(r.duplicateValues).toBe(2);
  });

  it('returns nothing when duplicates mode finds no repeats', () => {
    expect(removeDuplicates('a\nb\nc', { ...base, mode: 'duplicates' }).output).toBe('');
  });

  it('preserves a trailing newline instead of turning it into a blank line', () => {
    expect(removeDuplicates('a\nb\na\n', base).output).toBe('a\nb\n');
  });

  it('handles CRLF input', () => {
    expect(removeDuplicates('a\r\nb\r\na', base).output).toBe('a\nb');
  });

  it('treats an empty document as empty', () => {
    const r = removeDuplicates('', base);
    expect(r.output).toBe('');
    expect(r.linesIn).toBe(0);
  });
});
