import { describe, it, expect } from 'vitest';
import { naturalCompare, shuffle, sortLines, type SortOptions } from './logic';

const base: SortOptions = {
  mode: 'az',
  caseSensitive: false,
  ignoreLeadingWhitespace: false,
  removeDuplicates: false,
  seed: 1,
};

const sortedLines = (text: string, opts: Partial<SortOptions> = {}) =>
  sortLines(text, { ...base, ...opts }).output.split('\n');

describe('naturalCompare', () => {
  it('orders embedded numbers by value, not by digit', () => {
    expect(['item10', 'item2', 'item1'].sort((a, b) => naturalCompare(a, b))).toEqual([
      'item1',
      'item2',
      'item10',
    ]);
  });

  it('compares plain numbers numerically including sign and decimals', () => {
    expect(['10', '-3', '2.5', '2'].sort((a, b) => naturalCompare(a, b))).toEqual(['-3', '2', '2.5', '10']);
  });

  it('keeps zero-padded numbers next to their bare form, shortest first', () => {
    expect(naturalCompare('7', '007')).toBeLessThan(0);
  });

  it('sorts version-like strings sensibly', () => {
    expect(['v1.10.0', 'v1.2.0', 'v1.9.3'].sort((a, b) => naturalCompare(a, b))).toEqual([
      'v1.2.0',
      'v1.9.3',
      'v1.10.0',
    ]);
  });

  it('puts a leading number before a leading word', () => {
    expect(naturalCompare('3 apples', 'apples')).toBeLessThan(0);
  });

  it('is symmetric', () => {
    expect(naturalCompare('file2', 'file10')).toBeLessThan(0);
    expect(naturalCompare('file10', 'file2')).toBeGreaterThan(0);
    expect(naturalCompare('file2', 'file2')).toBe(0);
  });
});

describe('sortLines', () => {
  it('sorts case-insensitively by default', () => {
    expect(sortedLines('Banana\napple\ncherry')).toEqual(['apple', 'Banana', 'cherry']);
  });

  it('sorts uppercase first when case matters', () => {
    expect(sortedLines('banana\nApple', { caseSensitive: true })).toEqual(['Apple', 'banana']);
  });

  it('reverses without sorting', () => {
    expect(sortedLines('b\na\nc', { mode: 'reverse' })).toEqual(['c', 'a', 'b']);
  });

  it('sorts by length with an alphabetical tie-break', () => {
    expect(sortedLines('ccc\nb\naa\nbb', { mode: 'length-asc' })).toEqual(['b', 'aa', 'bb', 'ccc']);
    expect(sortedLines('ccc\nb\naa', { mode: 'length-desc' })).toEqual(['ccc', 'aa', 'b']);
  });

  it('can ignore indentation when comparing', () => {
    expect(sortedLines('    beta\nalpha', { ignoreLeadingWhitespace: true })).toEqual(['alpha', '    beta']);
    expect(sortedLines('    beta\nalpha', { ignoreLeadingWhitespace: false })).toEqual(['    beta', 'alpha']);
  });

  it('removes duplicates while sorting and reports the count', () => {
    const r = sortLines('b\na\nb\nB', { ...base, removeDuplicates: true });
    expect(r.output).toBe('a\nb');
    expect(r.linesIn).toBe(4);
    expect(r.removed).toBe(2);
  });

  it('dedupes on the same key it sorts on, so indentation only counts when asked', () => {
    // Indentation-insensitive: the indented copy is a duplicate.
    expect(sortLines('a\n  a\nb', { ...base, ignoreLeadingWhitespace: true, removeDuplicates: true }).output).toBe(
      'a\nb',
    );
    // Indentation-sensitive: it is a different line and has to survive.
    expect(sortLines('a\n  a\nb', { ...base, ignoreLeadingWhitespace: false, removeDuplicates: true }).output).toBe(
      '  a\na\nb',
    );
  });

  it('keeps case-sensitive duplicates apart', () => {
    expect(sortLines('a\nA', { ...base, caseSensitive: true, removeDuplicates: true }).output).toBe('A\na');
    expect(sortLines('a\nA', { ...base, caseSensitive: false, removeDuplicates: true }).output).toBe('a');
  });

  it('keeps a trailing newline out of the sort', () => {
    expect(sortLines('b\na\n', base).output).toBe('a\nb\n');
  });

  it('shuffles deterministically for a given seed and differently for another', () => {
    const items = ['1', '2', '3', '4', '5', '6', '7', '8'];
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42));
    expect(shuffle(items, 42)).not.toEqual(shuffle(items, 43));
    expect([...shuffle(items, 42)].sort()).toEqual([...items].sort());
  });

  it('handles an empty document', () => {
    expect(sortLines('', base).output).toBe('');
  });
});
