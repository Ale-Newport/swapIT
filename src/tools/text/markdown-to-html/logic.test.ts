import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MD_OPTIONS,
  documentTitle,
  escapeHtml,
  markdownToHtml,
  slugify,
  type MarkdownToHtmlOptions,
} from './logic';

const opts = (patch: Partial<MarkdownToHtmlOptions> = {}): MarkdownToHtmlOptions => ({
  ...DEFAULT_MD_OPTIONS,
  ...patch,
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Getting Started')).toBe('getting-started');
  });

  it('drops punctuation', () => {
    expect(slugify('Hello, World! & more')).toBe('hello-world-more');
  });

  it('keeps letters from other alphabets', () => {
    expect(slugify('Año nuevo')).toBe('año-nuevo');
  });

  it('strips inline HTML', () => {
    expect(slugify('A <em>fancy</em> title')).toBe('a-fancy-title');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes the dangerous four', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('documentTitle', () => {
  it('uses the first level-one heading', () => {
    expect(documentTitle('# Release notes\n\nBody')).toBe('Release notes');
  });

  it('understands setext headings', () => {
    expect(documentTitle('Release notes\n=============\n\nBody')).toBe('Release notes');
  });

  it('strips inline markdown from the title', () => {
    expect(documentTitle('# The **big** [release](https://x.test)')).toBe('The big release');
  });

  it('falls back when there is no heading', () => {
    expect(documentTitle('just a paragraph')).toBe('Document');
  });
});

describe('markdownToHtml', () => {
  it('returns nothing for blank input', () => {
    expect(markdownToHtml('   \n', opts())).toBe('');
  });

  it('converts basic markdown', () => {
    expect(markdownToHtml('Some **bold** text', opts({ headerIds: false }))).toBe(
      '<p>Some <strong>bold</strong> text</p>',
    );
  });

  it('renders GitHub tables when GFM is on', () => {
    const md = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    expect(markdownToHtml(md, opts())).toContain('<table>');
    expect(markdownToHtml(md, opts({ gfm: false }))).not.toContain('<table>');
  });

  it('honours the line-breaks option', () => {
    expect(markdownToHtml('one\ntwo', opts())).not.toContain('<br>');
    expect(markdownToHtml('one\ntwo', opts({ breaks: true }))).toContain('<br>');
  });

  it('adds heading ids', () => {
    expect(markdownToHtml('## Getting Started', opts())).toContain('<h2 id="getting-started">');
  });

  it('omits heading ids when asked', () => {
    expect(markdownToHtml('## Getting Started', opts({ headerIds: false }))).toBe('<h2>Getting Started</h2>');
  });

  it('keeps inline markup inside a heading with an id', () => {
    const out = markdownToHtml('## A *fancy* title', opts());
    expect(out).toContain('id="a-fancy-title"');
    expect(out).toContain('<em>fancy</em>');
  });

  it('makes repeated headings unique', () => {
    const out = markdownToHtml('## Overview\n\n## Overview\n\n## Overview', opts());
    expect(out).toContain('id="overview"');
    expect(out).toContain('id="overview-1"');
    expect(out).toContain('id="overview-2"');
  });

  it('gives an unslugifiable heading a fallback id', () => {
    expect(markdownToHtml('## !!!', opts())).toContain('id="section"');
  });

  it('wraps a full document with a title and stylesheet', () => {
    const out = markdownToHtml('# Release notes\n\nBody', opts({ fullDocument: true }));
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<title>Release notes</title>');
    expect(out).toContain('<style>');
    expect(out).toContain('</html>');
    expect(out).toContain('<h1 id="release-notes">Release notes</h1>');
  });

  it('escapes the title it puts in the document head', () => {
    const out = markdownToHtml('# A & B <c>', opts({ fullDocument: true }));
    expect(out).toContain('<title>A &amp; B &lt;c&gt;</title>');
  });

  it('produces a fragment when full document mode is off', () => {
    const out = markdownToHtml('# Title', opts());
    expect(out).not.toContain('<html');
  });
});
