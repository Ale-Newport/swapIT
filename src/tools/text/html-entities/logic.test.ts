import { describe, it, expect } from 'vitest';
import {
  countEntities,
  decodeEntities,
  encodeEntities,
  findMissingSemicolons,
  NAMED_COUNT,
  resolveNamed,
} from './logic';

describe('encodeEntities', () => {
  const sample = `<a href="x">Tom & Jerry's café — 5€</a>`;

  it('essential mode touches only the five that change parsing', () => {
    expect(encodeEntities(sample, 'essential')).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s café — 5€&lt;/a&gt;',
    );
  });

  it('named mode uses the table where it can and leaves the rest alone', () => {
    expect(encodeEntities('café — 5€ ± ½', 'named')).toBe('caf&eacute; &mdash; 5&euro; &plusmn; &frac12;');
    // No named entity exists for CJK, so those characters stay as they are.
    expect(encodeEntities('日本', 'named')).toBe('日本');
  });

  it('numeric modes escape everything outside printable ASCII', () => {
    expect(encodeEntities('A & é', 'decimal')).toBe('A &#38; &#233;');
    expect(encodeEntities('A & é', 'hex')).toBe('A &#x26; &#xE9;');
    expect(encodeEntities('line\nbreak\ttab', 'decimal')).toBe('line\nbreak\ttab');
    expect(encodeEntities('\u0007', 'decimal')).toBe('&#7;');
  });

  it('non-ASCII mode leaves markup characters intact', () => {
    expect(encodeEntities('<b>café</b>', 'nonAscii')).toBe('<b>caf&eacute;</b>');
    expect(encodeEntities('日', 'nonAscii')).toBe('&#26085;');
  });

  it('treats astral characters as one code point, not two surrogates', () => {
    expect(encodeEntities('😀', 'decimal')).toBe('&#128512;');
    expect(encodeEntities('😀', 'hex')).toBe('&#x1F600;');
    expect(decodeEntities('&#128512;').output).toBe('😀');
  });

  it('round-trips through decode in every mode', () => {
    for (const mode of ['essential', 'named', 'decimal', 'hex', 'nonAscii'] as const) {
      expect(decodeEntities(encodeEntities(sample, mode)).output).toBe(sample);
    }
  });

  it('ships a table worth calling a table', () => {
    expect(NAMED_COUNT).toBeGreaterThan(200);
  });
});

describe('decodeEntities', () => {
  it('handles named, decimal and hexadecimal in one pass', () => {
    const report = decodeEntities('&lt;p&gt;caf&eacute; &#38; cr&#xE8;me&lt;/p&gt;');
    expect(report.output).toBe('<p>café & crème</p>');
    expect(report.decoded).toBe(7);
    expect(report.unknown).toEqual([]);
  });

  it('leaves surrounding markup untouched instead of flattening it', () => {
    expect(decodeEntities('<b>a &amp; b</b>').output).toBe('<b>a & b</b>');
  });

  it('reports unknown entities rather than deleting them', () => {
    const report = decodeEntities('&notanentity; stays');
    expect(report.output).toBe('&notanentity; stays');
    expect(report.unknown).toEqual(['&notanentity;']);
    expect(report.decoded).toBe(0);
  });

  it('flags entities written without their semicolon', () => {
    expect(findMissingSemicolons('10&nbsp&times20')).toEqual(['&nbsp', '&times']);
    expect(findMissingSemicolons('10&nbsp;')).toEqual([]);
    expect(decodeEntities('a&nbsp b').missingSemicolon).toEqual(['&nbsp']);
  });

  it('rejects numbers that are not characters', () => {
    expect(() => decodeEntities('&#1114112;')).toThrow(/1114111/);
    expect(() => decodeEntities('&#xD800;')).toThrow(/surrogate/);
    expect(() => decodeEntities('&#0;')).toThrow(/null character/);
  });

  it('decodes a double-encoded ampersand one layer at a time', () => {
    const once = decodeEntities('&amp;lt;').output;
    expect(once).toBe('&lt;');
    expect(decodeEntities(once).output).toBe('<');
  });

  it('resolves table names without a DOM', () => {
    expect(typeof DOMParser).toBe('undefined');
    expect(resolveNamed('nbsp')).toBe('\u00A0');
    expect(resolveNamed('hearts')).toBe('♥');
    expect(resolveNamed('Sigma')).toBe('Σ');
    expect(resolveNamed('omega')).toBe('ω');
    expect(resolveNamed('nope')).toBeNull();
  });
});

describe('countEntities', () => {
  it('counts every entity token', () => {
    expect(countEntities('&amp; &#38; &#x26; plain')).toBe(3);
    expect(countEntities('nothing here')).toBe(0);
  });
});
