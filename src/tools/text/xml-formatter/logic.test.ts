import { describe, expect, it } from 'vitest';
import { DEFAULT_XML_OPTIONS, countElements, formatXml } from './logic';

const opts = (patch: Partial<typeof DEFAULT_XML_OPTIONS> = {}) => ({ ...DEFAULT_XML_OPTIONS, ...patch });

describe('formatXml', () => {
  it('returns nothing for empty input', () => {
    expect(formatXml('   \n ', opts())).toBe('');
  });

  it('indents nested elements', () => {
    const out = formatXml('<a><b><c>1</c></b></a>', opts());
    expect(out).toBe('<a>\n  <b>\n    <c>1</c>\n  </b>\n</a>');
  });

  it('honours a custom indent', () => {
    expect(formatXml('<a><b>1</b></a>', opts({ indent: '\t' }))).toBe('<a>\n\t<b>1</b>\n</a>');
    expect(formatXml('<a><b>1</b></a>', opts({ indent: '    ' }))).toBe('<a>\n    <b>1</b>\n</a>');
  });

  it('minifies onto one line', () => {
    const out = formatXml('<a>\n  <b>1</b>\n  <b>2</b>\n</a>', opts({ minify: true }));
    expect(out).toBe('<a><b>1</b><b>2</b></a>');
  });

  it('keeps attributes and repeated siblings in order', () => {
    const out = formatXml('<r><i id="2">b</i><i id="1">a</i></r>', opts({ minify: true }));
    expect(out).toBe('<r><i id="2">b</i><i id="1">a</i></r>');
  });

  it('preserves the XML declaration', () => {
    const out = formatXml('<?xml version="1.0" encoding="UTF-8"?><a>1</a>', opts());
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('preserves CDATA verbatim', () => {
    const out = formatXml('<a><![CDATA[x < y & z]]></a>', opts({ minify: true }));
    expect(out).toBe('<a><![CDATA[x < y & z]]></a>');
  });

  it('never wraps CDATA in indentation of its own', () => {
    expect(formatXml('<d><![CDATA[a<b]]></d>', opts())).toBe('<d><![CDATA[a<b]]></d>');
  });

  it('keeps the DOCTYPE, before the root and after the declaration', () => {
    const out = formatXml('<?xml version="1.0"?><!DOCTYPE note SYSTEM "note.dtd"><note><to>x</to></note>', opts());
    expect(out).toBe('<?xml version="1.0"?>\n<!DOCTYPE note SYSTEM "note.dtd">\n<note>\n  <to>x</to>\n</note>');
  });

  it('keeps a DOCTYPE with an internal subset, brackets and all', () => {
    const source = '<!DOCTYPE root [\n<!ELEMENT root (#PCDATA)>\n<!ENTITY x "yes">\n]>\n<root>&x;</root>';
    const out = formatXml(source, opts());
    expect(out).toContain('<!ENTITY x "yes">');
    expect(out.endsWith('<root>&x;</root>')).toBe(true);
  });

  it('leaves mixed content on one line instead of indenting its words apart', () => {
    const out = formatXml('<svg><text x="0">Hello <tspan>big</tspan> world</text></svg>', opts());
    expect(out).toBe('<svg>\n  <text x="0">Hello <tspan>big</tspan> world</text>\n</svg>');
  });

  it('keeps the spacing of mixed content when minifying too', () => {
    expect(formatXml('<p>a <b>c</b> d</p>', opts({ minify: true }))).toBe('<p>a <b>c</b> d</p>');
  });

  it('honours xml:space="preserve"', () => {
    expect(formatXml('<r xml:space="preserve"><t>  keep  me  </t></r>', opts())).toBe(
      '<r xml:space="preserve"><t>  keep  me  </t></r>',
    );
  });

  it('trims the author\'s indentation around ordinary text', () => {
    expect(formatXml('<a>\n   <b>  spaced  </b>\n</a>', opts())).toBe('<a>\n  <b>spaced</b>\n</a>');
  });

  it('leaves entities exactly as they were written', () => {
    expect(formatXml('<a>caf&#233; &amp; more</a>', opts())).toBe('<a>caf&#233; &amp; more</a>');
  });

  it('is idempotent — formatting the output changes nothing', () => {
    const source = '<?xml version="1.0"?><!DOCTYPE d><d><p>a <b>c</b> d</p><e/><![CDATA[x]]></d>';
    const once = formatXml(source, opts());
    expect(formatXml(once, opts())).toBe(once);
  });

  it('keeps comments by default and drops them on request', () => {
    expect(formatXml('<a><!-- hi --><b/></a>', opts({ minify: true }))).toContain('<!-- hi -->');
    expect(formatXml('<a><!-- hi --><b/></a>', opts({ minify: true, keepComments: false }))).toBe('<a><b/></a>');
  });

  it('collapses or expands empty elements', () => {
    expect(formatXml('<a><b></b></a>', opts({ minify: true }))).toBe('<a><b/></a>');
    expect(formatXml('<a><b/></a>', opts({ minify: true, collapseEmpty: false }))).toBe('<a><b></b></a>');
  });

  it('reports a mismatched closing tag with a line and column', () => {
    expect(() => formatXml('<a><b></a>', opts())).toThrow(/line 1, column \d+/);
  });

  it('reports an unclosed root element', () => {
    expect(() => formatXml('<a><b>1</b>', opts())).toThrow(/a/);
  });

  it('rejects plain text that is not XML at all', () => {
    expect(() => formatXml('hello world', opts())).toThrow();
  });
});

describe('countElements', () => {
  it('counts opening tags only', () => {
    expect(countElements('<a><b/><b>1</b></a>')).toBe(3);
  });

  it('ignores declarations and comments', () => {
    expect(countElements('<?xml version="1.0"?><!-- c --><a/>')).toBe(1);
  });
});
