import { describe, expect, it } from 'vitest';
import { SAMPLE_SVG, byteLength, countLines, formatSvg, indentString } from './logic';

const MINIFIED =
  '<?xml version="1.0" encoding="UTF-8"?><!-- a note --><svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><g id="a" transform="translate(2 2)"><rect x="1" y="2" width="3" height="4" fill="url(#g)"/><text x="5" y="6">Hello &amp; bye</text></g></svg>';

describe('indentString', () => {
  it('maps each choice to real whitespace', () => {
    expect(indentString('2')).toBe('  ');
    expect(indentString('4')).toBe('    ');
    expect(indentString('tab')).toBe('\t');
  });
});

describe('formatSvg', () => {
  const output = formatSvg(MINIFIED, { indent: '2' });

  it('puts every element on its own line, indented by depth', () => {
    const lines = output.split('\n');
    expect(lines).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">');
    expect(lines).toContain('  <defs>');
    expect(lines).toContain('    <linearGradient id="g">');
    expect(lines).toContain('      <stop offset="0" stop-color="#fff"/>');
  });

  it('keeps attributes in their original order', () => {
    expect(output).toContain('<rect x="1" y="2" width="3" height="4" fill="url(#g)"/>');
  });

  it('keeps the XML declaration and comments', () => {
    expect(output.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(output).toContain('<!-- a note -->');
  });

  it('keeps text content and its escaping intact', () => {
    expect(output).toContain('<text x="5" y="6">Hello &amp; bye</text>');
  });

  it('keeps empty elements self-closing rather than expanding them', () => {
    expect(output).not.toContain('</rect>');
  });

  it('honours the indent width', () => {
    expect(formatSvg(MINIFIED, { indent: '4' })).toContain('\n    <defs>');
    expect(formatSvg(MINIFIED, { indent: 'tab' })).toContain('\n\t<defs>');
  });

  it('ends with exactly one newline', () => {
    expect(output.endsWith('>\n')).toBe(true);
    expect(output.endsWith('\n\n')).toBe(false);
  });

  it('is stable: formatting an already formatted file changes nothing', () => {
    expect(formatSvg(output, { indent: '2' })).toBe(output);
  });

  it('re-indents a file that was indented differently', () => {
    const wide = formatSvg(MINIFIED, { indent: '4' });
    expect(formatSvg(wide, { indent: '2' })).toBe(output);
  });

  it('keeps CDATA blocks whole', () => {
    const withCdata =
      '<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[.a{fill:red}]]></style></svg>';
    expect(formatSvg(withCdata, { indent: '2' })).toContain('<![CDATA[.a{fill:red}]]>');
  });

  it('returns nothing for an empty input instead of failing', () => {
    expect(formatSvg('   ', { indent: '2' })).toBe('');
  });

  it('reports where broken markup goes wrong', () => {
    expect(() => formatSvg('<svg><g></svg>', { indent: '2' })).toThrow(/not valid XML/);
    expect(() => formatSvg('<svg><g></svg>', { indent: '2' })).toThrow(/line 1/);
  });

  it('formats the built-in sample', () => {
    expect(formatSvg(SAMPLE_SVG, { indent: '2' })).toContain('\n  <rect width="48" height="48" rx="10" fill="url(#g)"/>');
  });
});

describe('byteLength and countLines', () => {
  it('measures UTF-8 bytes, not characters', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('★')).toBe(3);
  });

  it('ignores the trailing newline when counting lines', () => {
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('')).toBe(0);
  });
});
