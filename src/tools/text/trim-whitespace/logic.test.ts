import { describe, it, expect } from 'vitest';
import { trimWhitespace, type TrimOptions } from './logic';

const ZWSP = String.fromCharCode(0x200b);
const NBSP = String.fromCharCode(0x00a0);
const BOM = String.fromCharCode(0xfeff);

const base: TrimOptions = {
  trim: 'none',
  collapseSpaces: false,
  tabs: 'keep',
  tabWidth: 2,
  lineEndings: 'keep',
  stripInvisible: false,
};

describe('trimWhitespace', () => {
  it('trims only the requested side', () => {
    expect(trimWhitespace('  hi  ', { ...base, trim: 'leading' }).output).toBe('hi  ');
    expect(trimWhitespace('  hi  ', { ...base, trim: 'trailing' }).output).toBe('  hi');
    expect(trimWhitespace('  hi  ', { ...base, trim: 'both' }).output).toBe('hi');
  });

  it('counts the lines it actually changed', () => {
    const r = trimWhitespace('a  \nb\nc  ', { ...base, trim: 'trailing' });
    expect(r.linesTrimmed).toBe(2);
  });

  it('collapses internal runs but keeps indentation', () => {
    const r = trimWhitespace('    keep   this    tidy', { ...base, collapseSpaces: true });
    expect(r.output).toBe('    keep this tidy');
    expect(r.runsCollapsed).toBe(2);
  });

  it('expands tabs to the chosen width', () => {
    expect(trimWhitespace('\tone', { ...base, tabs: 'tabs-to-spaces', tabWidth: 4 }).output).toBe('    one');
  });

  it('turns leading spaces into tabs and leaves the remainder', () => {
    expect(trimWhitespace('     one', { ...base, tabs: 'spaces-to-tabs', tabWidth: 2 }).output).toBe('\t\t one');
  });

  it('does not turn spaces inside a line into tabs', () => {
    expect(trimWhitespace('a    b', { ...base, tabs: 'spaces-to-tabs', tabWidth: 2 }).output).toBe('a    b');
  });

  it('normalises line endings both ways', () => {
    expect(trimWhitespace('a\r\nb', { ...base, lineEndings: 'lf' }).output).toBe('a\nb');
    expect(trimWhitespace('a\nb', { ...base, lineEndings: 'crlf' }).output).toBe('a\r\nb');
    expect(trimWhitespace('a\r\nb', { ...base, lineEndings: 'keep' }).output).toBe('a\r\nb');
  });

  it('removes zero-width characters and counts them', () => {
    const r = trimWhitespace(`${BOM}he${ZWSP}llo${ZWSP}`, { ...base, stripInvisible: true });
    expect(r.output).toBe('hello');
    expect(r.zeroWidth).toBe(3);
  });

  it('turns non-breaking spaces into ordinary ones', () => {
    const r = trimWhitespace(`a${NBSP}b`, { ...base, stripInvisible: true });
    expect(r.output).toBe('a b');
    expect(r.exoticSpaces).toBe(1);
  });

  it('leaves invisible characters alone when the option is off', () => {
    const r = trimWhitespace(`a${NBSP}b`, base);
    expect(r.output).toBe(`a${NBSP}b`);
    expect(r.exoticSpaces).toBe(0);
  });

  it('lets a trimmed non-breaking space disappear once converted', () => {
    const r = trimWhitespace(`hi${NBSP} `, { ...base, stripInvisible: true, trim: 'trailing' });
    expect(r.output).toBe('hi');
  });
});
