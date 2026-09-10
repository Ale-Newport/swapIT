// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_HTML_OPTIONS, htmlToMarkdown, type HtmlToMarkdownOptions } from './logic';

const opts = (patch: Partial<HtmlToMarkdownOptions> = {}): HtmlToMarkdownOptions => ({
  ...DEFAULT_HTML_OPTIONS,
  ...patch,
});

describe('htmlToMarkdown', () => {
  it('returns nothing for blank input', () => {
    expect(htmlToMarkdown('   ', opts())).toBe('');
  });

  it('converts headings in ATX style', () => {
    expect(htmlToMarkdown('<h2>Title</h2>', opts())).toBe('## Title');
  });

  it('converts headings in setext style', () => {
    const out = htmlToMarkdown('<h1>Title</h1>', opts({ headingStyle: 'setext' }));
    expect(out.split('\n')[0]).toBe('Title');
    expect(out.split('\n')[1]).toMatch(/^=+$/);
  });

  it('uses the chosen bullet marker', () => {
    expect(htmlToMarkdown('<ul><li>one</li></ul>', opts())).toMatch(/^- {2,}one$|^-\s+one$/);
    expect(htmlToMarkdown('<ul><li>one</li></ul>', opts({ bullet: '*' })).trimStart()[0]).toBe('*');
    expect(htmlToMarkdown('<ul><li>one</li></ul>', opts({ bullet: '+' })).trimStart()[0]).toBe('+');
  });

  it('fences or indents code blocks', () => {
    const fenced = htmlToMarkdown('<pre><code>let a = 1;</code></pre>', opts());
    expect(fenced).toContain('```');
    expect(fenced).toContain('let a = 1;');
    const indented = htmlToMarkdown('<pre><code>let a = 1;</code></pre>', opts({ codeBlockStyle: 'indented' }));
    expect(indented).not.toContain('```');
    expect(indented).toContain('    let a = 1;');
  });

  it('switches the emphasis delimiters', () => {
    expect(htmlToMarkdown('<p><em>a</em> <strong>b</strong></p>', opts())).toBe('*a* **b**');
    expect(htmlToMarkdown('<p><em>a</em> <strong>b</strong></p>', opts({ emphasis: 'underscore' }))).toBe(
      '_a_ __b__',
    );
  });

  it('keeps links and images', () => {
    expect(htmlToMarkdown('<a href="https://x.test">go</a>', opts())).toBe('[go](https://x.test)');
    expect(htmlToMarkdown('<img src="a.png" alt="pic">', opts())).toBe('![pic](a.png)');
  });

  it('turns a table into a pipe table', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><em>2</em></td></tr></tbody></table>';
    expect(htmlToMarkdown(html, opts())).toBe('| A | B |\n| --- | --- |\n| 1 | *2* |');
  });

  it('pads a ragged table and escapes pipes inside cells', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>a|b</td></tr></table>';
    expect(htmlToMarkdown(html, opts())).toBe('| A | B |\n| --- | --- |\n| a\\|b |  |');
  });

  it('flattens a multi-line cell onto one row', () => {
    const html = '<table><tr><th>A</th></tr><tr><td><p>one</p><p>two</p></td></tr></table>';
    expect(htmlToMarkdown(html, opts())).toBe('| A |\n| --- |\n| one two |');
  });

  it('always drops script and style content', () => {
    const html = '<p>keep</p><script>alert(1)</script><style>p{color:red}</style>';
    const out = htmlToMarkdown(html, opts());
    expect(out).toBe('keep');
  });

  it('converts the contents of an unknown tag by default', () => {
    expect(htmlToMarkdown('<p>a <custom-badge>beta</custom-badge> b</p>', opts())).toBe('a beta b');
  });

  it('keeps an unknown tag as HTML when asked', () => {
    const out = htmlToMarkdown('<p>a <custom-badge>beta</custom-badge> b</p>', opts({ unknownTags: 'keep' }));
    expect(out).toContain('<custom-badge>beta</custom-badge>');
  });

  it('removes an unknown tag entirely when asked', () => {
    const out = htmlToMarkdown('<p>a <custom-badge>beta</custom-badge> b</p>', opts({ unknownTags: 'remove' }));
    expect(out).not.toContain('beta');
    expect(out).toContain('a');
  });

  it('never keeps ordinary wrappers as raw HTML', () => {
    const out = htmlToMarkdown('<div><section><p>text</p></section></div>', opts({ unknownTags: 'keep' }));
    expect(out).toBe('text');
  });

  it('collapses runs of blank lines', () => {
    const out = htmlToMarkdown('<p>a</p><p></p><p></p><p>b</p>', opts());
    expect(out).toBe('a\n\nb');
  });
});
