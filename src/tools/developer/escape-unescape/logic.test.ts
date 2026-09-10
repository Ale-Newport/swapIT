import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  escapeCsv,
  escapeJs,
  escapeJson,
  escapeRegex,
  escapeShell,
  escapeSql,
  escapeText,
  escapeXml,
  stripWrapping,
  transform,
  unescapeCsv,
  unescapeJs,
  unescapeJson,
  unescapeRegex,
  unescapeShell,
  unescapeSql,
  unescapeText,
  unescapeXml,
  type Mode,
} from './logic';

describe('stripWrapping', () => {
  it('removes a matching pair of quotes', () => {
    expect(stripWrapping('"abc"', ['"'])).toBe('abc');
  });

  it('leaves text whose quotes do not match up', () => {
    expect(stripWrapping('"abc', ['"'])).toBe('"abc');
    expect(stripWrapping('a"b"c', ['"'])).toBe('a"b"c');
  });

  it('does not eat a single quote character', () => {
    expect(stripWrapping('"', ['"'])).toBe('"');
  });
});

describe('escapeJson', () => {
  it('escapes quotes and backslashes', () => {
    expect(escapeJson('say "hi" \\ now')).toBe('say \\"hi\\" \\\\ now');
  });

  it('escapes the whitespace controls by name', () => {
    expect(escapeJson('a\nb\tc\rd')).toBe('a\\nb\\tc\\rd');
  });

  it('escapes other control characters as \\u', () => {
    expect(escapeJson('\u0001\u001f')).toBe('\\u0001\\u001f');
  });

  it('leaves unicode alone by default and escapes it on request', () => {
    expect(escapeJson('café 東京 🙂')).toBe('café 東京 🙂');
    expect(escapeJson('é')).toBe('é');
    expect(escapeJson('é', true)).toBe('\\u00e9');
    expect(escapeJson('🙂', true)).toBe('\\ud83d\\ude42');
  });

  it('escapes the line separators that break embedded JavaScript', () => {
    expect(escapeJson('a\u2028b')).toBe('a\\u2028b');
  });

  it('produces something JSON.parse accepts', () => {
    const source = 'quote " backslash \\ newline \n tab \t emoji 🙂';
    expect(JSON.parse(`"${escapeJson(source)}"`)).toBe(source);
  });
});

describe('unescapeJson', () => {
  it('reverses the standard escapes', () => {
    expect(unescapeJson('say \\"hi\\" \\\\ \\n\\t')).toBe('say "hi" \\ \n\t');
  });

  it('decodes \\u escapes including surrogate pairs', () => {
    expect(unescapeJson('\\u00e9')).toBe('é');
    expect(unescapeJson('\\ud83d\\ude42')).toBe('🙂');
  });

  it('drops one pair of wrapping quotes', () => {
    expect(unescapeJson('"already quoted"')).toBe('already quoted');
  });

  it('round-trips arbitrary text', () => {
    const source = 'a "b" \\ c\n\td 🙂 «é»';
    expect(unescapeJson(escapeJson(source))).toBe(source);
  });

  it('rejects an escape JSON does not define', () => {
    expect(() => unescapeJson('a\\qb')).toThrow(/not a JSON escape/);
  });

  it('rejects a truncated unicode escape', () => {
    expect(() => unescapeJson('\\u00')).toThrow(/needs 4 hexadecimal digits/);
  });

  it('rejects a trailing backslash', () => {
    expect(() => unescapeJson('abc\\')).toThrow(/lone backslash/);
  });
});

describe('escapeJs', () => {
  it('escapes all three quote characters', () => {
    expect(escapeJs(`' " \``)).toBe(`\\' \\" \\\``);
  });

  it('escapes control characters in JavaScript style', () => {
    expect(escapeJs('a\u0001b')).toBe('a\\x01b');
    expect(escapeJs('a\vb')).toBe('a\\vb');
  });

  it('escapes a template placeholder', () => {
    expect(escapeJs('cost: ${total}')).toBe('cost: \\${total}');
  });

  it('leaves a lone dollar alone', () => {
    expect(escapeJs('$5 and $')).toBe('$5 and $');
  });

  it('escapes non-ASCII only when asked', () => {
    expect(escapeJs('é')).toBe('é');
    expect(escapeJs('é', true)).toBe('\\u00e9');
  });

  it('produces a literal that evaluates back to the source', () => {
    const source = `it's a "test" \\ with \n newline and ${'${x}'}`;
    // Evaluating the literal is the only honest check that the escaping works.
    expect(eval(`'${escapeJs(source)}'`)).toBe(source);
  });
});

describe('unescapeJs', () => {
  it('reverses quote and control escapes', () => {
    expect(unescapeJs(`\\'a\\"b\\\`c\\n`)).toBe(`'a"b\`c\n`);
  });

  it('decodes hex, unicode and code-point escapes', () => {
    expect(unescapeJs('\\x41')).toBe('A');
    expect(unescapeJs('\\u00e9')).toBe('é');
    expect(unescapeJs('\\u{1f642}')).toBe('🙂');
  });

  it('treats an unknown escape as the character itself, like JavaScript does', () => {
    expect(unescapeJs('\\q')).toBe('q');
  });

  it('swallows a line continuation', () => {
    expect(unescapeJs('one\\\ntwo')).toBe('onetwo');
  });

  it('round-trips arbitrary text', () => {
    const source = `it's "quoted" \\ 🙂\n\tend`;
    expect(unescapeJs(escapeJs(source))).toBe(source);
  });

  it('rejects a broken hex escape and an unclosed code point', () => {
    expect(() => unescapeJs('\\xZZ')).toThrow(/needs 2 hexadecimal digits/);
    expect(() => unescapeJs('\\u{1f64')).toThrow(/closing brace/);
  });
});

describe('escapeSql', () => {
  it('doubles single quotes', () => {
    expect(escapeSql("O'Brien")).toBe("O''Brien");
  });

  it('leaves backslashes and newlines alone, as the standard says', () => {
    expect(escapeSql('C:\\path\nnext')).toBe('C:\\path\nnext');
  });

  it('round-trips', () => {
    const source = "it's 'quoted' twice''";
    expect(unescapeSql(escapeSql(source))).toBe(source);
  });
});

describe('unescapeSql', () => {
  it('halves doubled quotes and drops the wrapping ones', () => {
    expect(unescapeSql("'O''Brien'")).toBe("O'Brien");
  });
});

describe('escapeShell', () => {
  it('leaves ordinary text untouched', () => {
    expect(escapeShell('hello world')).toBe('hello world');
  });

  it('breaks out of the quotes to insert a quote', () => {
    expect(escapeShell("it's")).toBe(`it'\\''s`);
  });

  it('keeps dollars, backticks and backslashes literal', () => {
    expect(escapeShell('$HOME `cmd` \\n')).toBe('$HOME `cmd` \\n');
  });

  it('produces a wrapped argument that unescapes back', () => {
    const source = `it's $HOME "quoted" \\ end`;
    expect(unescapeShell(escapeText(source, 'shell', { ...DEFAULT_OPTIONS, wrap: true }))).toBe(source);
  });
});

describe('unescapeShell', () => {
  it('joins single-quoted runs together', () => {
    expect(unescapeShell(`'it'\\''s'`)).toBe("it's");
  });

  it('reads double-quoted sections with their escapes', () => {
    expect(unescapeShell('"a \\"b\\" $c"')).toBe('a "b" $c');
  });

  it('rejects an unterminated quote', () => {
    expect(() => unescapeShell("'oops")).toThrow(/never closed/);
    // Without its wrapping quotes the escaped form is an incomplete word.
    expect(() => unescapeShell(escapeShell("it's"))).toThrow(/never closed/);
  });
});

describe('escapeCsv', () => {
  it('leaves a plain field alone', () => {
    expect(escapeCsv('plain')).toBe('plain');
  });

  it('quotes a field holding the delimiter', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('a;b', ';')).toBe('"a;b"');
    expect(escapeCsv('a;b', ',')).toBe('a;b');
  });

  it('doubles quotes and quotes the field', () => {
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a field with a line break or edge spaces', () => {
    expect(escapeCsv('one\ntwo')).toBe('"one\ntwo"');
    expect(escapeCsv(' padded ')).toBe('" padded "');
  });

  it('always quotes when asked', () => {
    expect(escapeCsv('plain', ',', true)).toBe('"plain"');
  });

  it('round-trips', () => {
    const source = 'a,"b"\nc';
    expect(unescapeCsv(escapeCsv(source))).toBe(source);
  });
});

describe('escapeRegex', () => {
  it('escapes every metacharacter', () => {
    expect(escapeRegex('1+1=2 (really?) [yes] a|b {2} $x ^y .z /path \\')).toBe(
      '1\\+1=2 \\(really\\?\\) \\[yes\\] a\\|b \\{2\\} \\$x \\^y \\.z \\/path \\\\',
    );
  });

  it('escapes newlines and tabs by name', () => {
    expect(escapeRegex('a\nb\tc')).toBe('a\\nb\\tc');
  });

  it('produces a pattern that matches the original text and nothing clever', () => {
    const source = 'a.b*c(d)';
    expect(new RegExp(`^${escapeRegex(source)}$`).test(source)).toBe(true);
    expect(new RegExp(`^${escapeRegex(source)}$`).test('axbxxcd')).toBe(false);
  });

  it('round-trips', () => {
    const source = 'a.b*c(d)\n\t[e]';
    expect(unescapeRegex(escapeRegex(source))).toBe(source);
  });
});

describe('unescapeRegex', () => {
  it('removes the backslash before a metacharacter', () => {
    expect(unescapeRegex('a\\.b\\*c')).toBe('a.b*c');
  });

  it('decodes hex and unicode escapes', () => {
    expect(unescapeRegex('\\x41\\u00e9')).toBe('Aé');
  });

  it('drops the slashes around a literal', () => {
    expect(unescapeRegex('/a\\.b/')).toBe('a.b');
  });

  it('refuses to pretend a character class is a literal', () => {
    expect(() => unescapeRegex('\\d+')).toThrow(/character class/);
    expect(() => unescapeRegex('a\\sb')).toThrow(/character class/);
  });
});

describe('escapeXml', () => {
  it('escapes the five markup characters', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('escapes whitespace an attribute would otherwise lose', () => {
    expect(escapeXml('a\nb\tc')).toBe('a&#10;b&#9;c');
  });

  it('leaves unicode as it is', () => {
    expect(escapeXml('café 🙂')).toBe('café 🙂');
  });

  it('round-trips', () => {
    const source = `<tag attr="v"> & 'x' \n end`;
    expect(unescapeXml(escapeXml(source))).toBe(source);
  });
});

describe('unescapeXml', () => {
  it('decodes named, decimal and hex references', () => {
    expect(unescapeXml('&lt;b&gt; &amp; &#39;x&#39; &#x41;')).toBe("<b> & 'x' A");
  });

  it('decodes a few common HTML entities', () => {
    expect(unescapeXml('caf&eacute;')).toBe('caf&eacute;');
    expect(unescapeXml('a&nbsp;b &copy; &hellip;')).toBe('a\u00a0b © …');
  });

  it('does not double-decode', () => {
    expect(unescapeXml('&amp;lt;')).toBe('&lt;');
  });

  it('leaves an unknown entity untouched', () => {
    expect(unescapeXml('&unknown; &notanentity')).toBe('&unknown; &notanentity');
  });
});

describe('escapeText and unescapeText', () => {
  const modes: Mode[] = ['json', 'js', 'sql', 'shell', 'csv', 'regex', 'xml'];
  const source = `mixed 'quotes' "and" \\ backslash\ntab\there é🙂`;

  it('round-trips every mode', () => {
    for (const mode of modes) {
      const escaped = escapeText(source, mode, DEFAULT_OPTIONS);
      // Unwrapped shell escaping is a fragment: the '\'' trick only reads back
      // once the surrounding single quotes are there.
      const complete = mode === 'shell' ? `'${escaped}'` : escaped;
      expect(unescapeText(complete, mode)).toBe(source);
    }
  });

  it('round-trips every mode with the wrapper on', () => {
    for (const mode of modes) {
      const wrapped = escapeText(source, mode, { ...DEFAULT_OPTIONS, wrap: true });
      expect(unescapeText(wrapped, mode)).toBe(source);
    }
  });

  it('wraps in the syntax the mode belongs to', () => {
    const options = { ...DEFAULT_OPTIONS, wrap: true };
    expect(escapeText('x', 'json', options)).toBe('"x"');
    expect(escapeText('x', 'sql', options)).toBe("'x'");
    expect(escapeText('x', 'regex', options)).toBe('/x/');
    expect(escapeText('x', 'csv', options)).toBe('"x"');
  });

  it('routes through transform in both directions', () => {
    expect(transform('a"b', 'json', 'escape', DEFAULT_OPTIONS)).toBe('a\\"b');
    expect(transform('a\\"b', 'json', 'unescape', DEFAULT_OPTIONS)).toBe('a"b');
  });
});
