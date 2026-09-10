import { describe, it, expect } from 'vitest';
import {
  decodeUrl,
  encodeForm,
  encodeFullUri,
  encodeComponent,
  encodeUrl,
  escapedCount,
  findDecodeProblem,
  looksDoubleEncoded,
} from './logic';

describe('encoding variants', () => {
  it('escapes the structural characters in a component but keeps them in a full URI', () => {
    const url = 'https://example.com/a b?q=1&x=2#top';
    expect(encodeComponent(url)).toBe('https%3A%2F%2Fexample.com%2Fa%20b%3Fq%3D1%26x%3D2%23top');
    expect(encodeFullUri(url)).toBe('https://example.com/a%20b?q=1&x=2#top');
  });

  it('matches URLSearchParams for form encoding, including the + for a space', () => {
    const value = "a b*!'()~-_.$&+,/:;=?@";
    const expected = new URLSearchParams({ k: value }).toString().slice(2);
    expect(encodeForm(value)).toBe(expected);
    expect(encodeForm('hello world')).toBe('hello+world');
  });

  it('encodes multi-byte characters as their UTF-8 bytes', () => {
    expect(encodeComponent('café')).toBe('caf%C3%A9');
    expect(encodeComponent('😀')).toBe('%F0%9F%98%80');
    expect(encodeForm('a+b')).toBe('a%2Bb');
  });

  it('explains an unpaired surrogate instead of throwing URIError', () => {
    expect(() => encodeUrl('bad \uD83D end', 'component')).toThrow(/unpaired surrogate/i);
  });
});

describe('decodeUrl', () => {
  it('round-trips every encoder', () => {
    const original = 'Ünicode / spaces & symbols 😀?';
    expect(decodeUrl(encodeComponent(original), false)).toBe(original);
    expect(decodeUrl(encodeFullUri(original), false)).toBe(original);
    expect(decodeUrl(encodeForm(original), true)).toBe(original);
  });

  it('only turns + into a space when form decoding is on', () => {
    expect(decodeUrl('a+b', true)).toBe('a b');
    expect(decodeUrl('a+b', false)).toBe('a+b');
    expect(decodeUrl('1%2B1', true)).toBe('1+1');
  });

  it('names the offending sequence when a % is not followed by hex digits', () => {
    expect(() => decodeUrl('one%zztwo', false)).toThrow(/%zz/);
    expect(() => decodeUrl('one%zztwo', false)).toThrow(/character 4/);
  });

  it('reports a trailing % with nothing after it', () => {
    expect(() => decodeUrl('100%', false)).toThrow(/hexadecimal/);
  });

  it('reports escapes that are not valid UTF-8', () => {
    expect(() => decodeUrl('%C3%28', false)).toThrow(/UTF-8/);
    expect(() => decodeUrl('%E2%82', false)).toThrow(/UTF-8/);
  });

  it('leaves valid text alone', () => {
    expect(findDecodeProblem('100%25 sure%20now')).toBeNull();
    expect(decodeUrl('100%25 sure%20now', false)).toBe('100% sure now');
  });

  it('finds the first problem, not a later one', () => {
    const problem = findDecodeProblem('ok%20 then %g1 then %h2');
    expect(problem?.snippet).toBe('%g1');
    expect(problem?.index).toBe(11);
  });
});

describe('helpers', () => {
  it('spots text that was encoded twice', () => {
    expect(looksDoubleEncoded(decodeUrl(encodeComponent(encodeComponent('a b')), false))).toBe(true);
    expect(looksDoubleEncoded('a b')).toBe(false);
  });

  it('counts escaped characters by code point', () => {
    expect(escapedCount('a b', encodeComponent)).toBe(1);
    expect(escapedCount('😀', encodeComponent)).toBe(1);
    expect(escapedCount('abc', encodeComponent)).toBe(0);
    expect(escapedCount('a b', encodeForm)).toBe(1);
  });
});
