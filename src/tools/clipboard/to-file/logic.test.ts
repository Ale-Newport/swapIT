import { describe, it, expect } from 'vitest';
import {
  analyseCsv,
  detectFormat,
  escapeHtml,
  isJson,
  looksLikeCsv,
  looksLikeHtml,
  prepare,
  suggestFilename,
  wrapInHtmlDocument,
} from './logic';

const OPTIONS = { indent: 2, wrapHtml: true, title: 'Clipboard' };

describe('detectFormat', () => {
  it('recognises JSON', () => {
    expect(detectFormat('{"a": 1}')).toBe('json');
    expect(detectFormat('[1, 2, 3]')).toBe('json');
  });

  it('does not call a broken object JSON', () => {
    expect(detectFormat('{a: 1,}')).not.toBe('json');
  });

  it('recognises HTML and Markdown', () => {
    expect(detectFormat('<div>hi</div>')).toBe('html');
    expect(detectFormat('# Title\n\nSome prose.')).toBe('md');
    expect(detectFormat('- one\n- two')).toBe('md');
  });

  it('recognises a rectangular comma table', () => {
    expect(detectFormat('name,age\nana,32\nluis,41')).toBe('csv');
  });

  it('falls back to plain text', () => {
    expect(detectFormat('just a sentence')).toBe('txt');
    expect(detectFormat('   ')).toBe('txt');
  });
});

describe('looksLikeCsv', () => {
  it('rejects a single line and ragged rows', () => {
    expect(looksLikeCsv('a,b,c')).toBe(false);
    expect(looksLikeCsv('a,b\nc,d,e')).toBe(false);
  });
});

describe('analyseCsv', () => {
  it('counts rows and columns and spots ragged rows', () => {
    expect(analyseCsv('name,age\nana,32\nluis,41')).toMatchObject({ rows: 3, columns: 2, ragged: false });
    expect(analyseCsv('a,b\nc,d,e').ragged).toBe(true);
  });

  it('detects a semicolon table', () => {
    expect(analyseCsv('a;b\nc;d').delimiter).toBe(';');
  });
});

describe('isJson / looksLikeHtml', () => {
  it('only treats object and array text as JSON', () => {
    expect(isJson('"a string"')).toBe(false);
    expect(isJson(' {"a":1} ')).toBe(true);
  });

  it('spots a fragment as well as a document', () => {
    expect(looksLikeHtml('<p>hello</p>')).toBe(true);
    expect(looksLikeHtml('less < than')).toBe(false);
  });
});

describe('prepare', () => {
  it('refuses an empty clipboard with a sentence you can act on', () => {
    expect(() => prepare('  ', 'txt', OPTIONS)).toThrow(/nothing on the clipboard/i);
  });

  it('pretty-prints valid JSON and ends with a newline', () => {
    expect(prepare('{"b":2,"a":[1]}', 'json', OPTIONS)).toBe('{\n  "b": 2,\n  "a": [\n    1\n  ]\n}\n');
  });

  it('honours the indent setting', () => {
    expect(prepare('{"a":1}', 'json', { ...OPTIONS, indent: 0 })).toBe('{"a":1}\n');
  });

  it('explains why invalid JSON cannot be saved as .json', () => {
    expect(() => prepare('{nope}', 'json', OPTIONS)).toThrow(/not valid JSON/i);
  });

  it('wraps plain text as HTML but leaves real HTML alone', () => {
    const wrapped = prepare('hello\n\nworld', 'html', OPTIONS);
    expect(wrapped).toContain('<!doctype html>');
    expect(wrapped).toContain('<p>hello</p>');
    expect(prepare('<p>hi</p>', 'html', OPTIONS)).toBe('<p>hi</p>\n');
  });

  it('does not wrap when wrapping is switched off', () => {
    expect(prepare('hello', 'html', { ...OPTIONS, wrapHtml: false })).toBe('hello\n');
  });

  it('leaves text and markdown untouched apart from a final newline', () => {
    expect(prepare('line', 'txt', OPTIONS)).toBe('line\n');
    expect(prepare('line\n', 'md', OPTIONS)).toBe('line\n');
  });
});

describe('wrapInHtmlDocument', () => {
  it('escapes the text and the title', () => {
    const html = wrapInHtmlDocument('a < b & "c"', '<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &lt; b &amp; &quot;c&quot;');
    expect(html).not.toContain('<script>');
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(wrapInHtmlDocument('one\ntwo', 'x')).toContain('<br />');
  });
});

describe('escapeHtml', () => {
  it('escapes every dangerous character', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});

describe('suggestFilename', () => {
  it('uses the first meaningful line', () => {
    expect(suggestFilename('# Quarterly Report\n\ntext', 'md')).toBe('quarterly-report');
  });

  it('strips characters a file name cannot hold', () => {
    expect(suggestFilename('Invoice #42: Acme/Corp', 'txt')).toBe('invoice-42-acme-corp');
  });

  it('falls back when there is no usable text', () => {
    expect(suggestFilename('!!!', 'txt')).toBe('clipboard');
    expect(suggestFilename('', 'csv')).toBe('clipboard-table');
  });

  it('keeps names short', () => {
    expect(suggestFilename('a'.repeat(200), 'txt').length).toBeLessThanOrEqual(48);
  });
});
