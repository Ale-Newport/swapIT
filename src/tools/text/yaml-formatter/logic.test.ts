import { describe, expect, it } from 'vitest';
import {
  DEFAULT_YAML_OPTIONS,
  convertYaml,
  firstRespelledNumber,
  hasComments,
  type YamlOptions,
} from './logic';

const opts = (patch: Partial<YamlOptions> = {}): YamlOptions => ({ ...DEFAULT_YAML_OPTIONS, ...patch });

describe('convertYaml — formatting', () => {
  it('returns nothing for blank input', () => {
    expect(convertYaml('  \n\n', opts())).toEqual({ output: '', documents: 0 });
  });

  it('normalises indentation', () => {
    const out = convertYaml('a:\n        b: 1\n', opts()).output;
    expect(out).toBe('a:\n  b: 1');
  });

  it('honours a wider indent', () => {
    expect(convertYaml('a:\n  b: 1\n', opts({ indent: 4 })).output).toBe('a:\n    b: 1');
  });

  it('sorts keys on request', () => {
    const out = convertYaml('b: 2\na: 1\n', opts({ sortKeys: true })).output;
    expect(out).toBe('a: 1\nb: 2');
  });

  it('leaves key order alone by default', () => {
    expect(convertYaml('b: 2\na: 1\n', opts()).output).toBe('b: 2\na: 1');
  });

  it('quotes every string when asked', () => {
    expect(convertYaml('a: hello\n', opts({ quoting: 'double' })).output).toBe('a: "hello"');
    expect(convertYaml('a: hello\n', opts({ quoting: 'single' })).output).toBe("a: 'hello'");
    expect(convertYaml('a: hello\n', opts()).output).toBe('a: hello');
  });

  it('writes flow style when asked', () => {
    const out = convertYaml('a:\n  - 1\n  - 2\n', opts({ flow: true })).output;
    expect(out).toBe('{a: [1, 2]}');
  });

  it('never wraps when the line width is zero', () => {
    const long = `a: ${'word '.repeat(40).trim()}\n`;
    expect(convertYaml(long, opts({ lineWidth: 0 })).output.split('\n')).toHaveLength(1);
    expect(convertYaml(long, opts({ lineWidth: 40 })).output.split('\n').length).toBeGreaterThan(1);
  });

  it('keeps a date as the text that was written', () => {
    expect(convertYaml('date: 2024-01-15\n', opts()).output).toBe('date: 2024-01-15');
    expect(convertYaml('date: 2024-01-15\n', opts({ mode: 'to-json' })).output).toContain('"2024-01-15"');
  });

  it('keeps anchors and aliases instead of duplicating the block', () => {
    const out = convertYaml('base: &b\n  x: 1\nuse: *b\n', opts()).output;
    expect(out).toMatch(/^base: &\w+\n {2}x: 1\nuse: \*\w+$/);
  });

  it('keeps a merge key as a merge key', () => {
    const out = convertYaml('.base: &base\n  image: x\njob:\n  <<: *base\n  script: y\n', opts()).output;
    expect(out).toContain('<<: *');
    expect(out.match(/image: x/g)).toHaveLength(1);
  });

  it('keeps yes and no quoted so YAML 1.1 readers still see strings', () => {
    expect(convertYaml('s: "yes"\nt: "no"\nu: "on"\n', opts()).output).toBe("s: 'yes'\nt: 'no'\nu: 'on'");
  });

  it('warns that comments are dropped', () => {
    const result = convertYaml('# stack\nservices:\n  web: nginx # frontend\n', opts());
    expect(result.warning).toMatch(/[Cc]omments/);
    expect(convertYaml('services:\n  web: nginx\n', opts()).warning).toBeUndefined();
  });

  it('warns when a number will be spelled differently', () => {
    const result = convertYaml('version: 1.10\n', opts());
    expect(result.output).toBe('version: 1.1');
    expect(result.warning).toContain('1.10');
    expect(result.warning).toContain('1.1');
  });

  it('keeps multiple documents separate', () => {
    const result = convertYaml('a: 1\n---\nb: 2\n', opts());
    expect(result.documents).toBe(2);
    expect(result.output).toBe('---\na: 1\n---\nb: 2');
  });
});

describe('convertYaml — conversion', () => {
  it('turns YAML into JSON', () => {
    const out = convertYaml('name: Toolbox\ntools:\n  - a\n  - b\n', opts({ mode: 'to-json' })).output;
    expect(JSON.parse(out)).toEqual({ name: 'Toolbox', tools: ['a', 'b'] });
    expect(out).toContain('\n  "name"');
  });

  it('combines multiple YAML documents into a JSON array', () => {
    const result = convertYaml('a: 1\n---\nb: 2\n', opts({ mode: 'to-json' }));
    expect(JSON.parse(result.output)).toEqual([{ a: 1 }, { b: 2 }]);
    expect(result.warning).toMatch(/2 YAML documents/);
  });

  it('sorts keys in JSON output too', () => {
    const out = convertYaml('b: 2\na: 1\n', opts({ mode: 'to-json', sortKeys: true })).output;
    expect(out.indexOf('"a"')).toBeLessThan(out.indexOf('"b"'));
  });

  it('turns JSON into YAML', () => {
    const out = convertYaml('{"name":"Toolbox","tools":["a","b"]}', opts({ mode: 'from-json' })).output;
    expect(out).toBe('name: Toolbox\ntools:\n  - a\n  - b');
  });

  it('round-trips YAML through JSON and back', () => {
    const source = 'name: Toolbox\ncount: 3\nnested:\n  flag: true\n';
    const json = convertYaml(source, opts({ mode: 'to-json' })).output;
    const back = convertYaml(json, opts({ mode: 'from-json' })).output;
    expect(back).toBe('name: Toolbox\ncount: 3\nnested:\n  flag: true');
  });
});

describe('round-trip warnings', () => {
  it('spots a comment but not a hash inside a value or a block scalar', () => {
    expect(hasComments('a: 1 # why')).toBe(true);
    expect(hasComments('# leading')).toBe(true);
    expect(hasComments('url: http://x/#frag')).toBe(false);
    expect(hasComments('text: "a # b"')).toBe(false);
    expect(hasComments('note: |\n  # not a comment\n')).toBe(false);
  });

  it('spots exactly the numbers js-yaml re-spells', () => {
    expect(firstRespelledNumber('version: 1.10')).toEqual({ source: '1.10', written: '1.1' });
    expect(firstRespelledNumber('zip: 01234')?.written).toBe('1234');
    expect(firstRespelledNumber('phone: +34600111222')?.written).toBe('34600111222');
    expect(firstRespelledNumber('- 007')?.written).toBe('7');
    expect(firstRespelledNumber('flow: [01, 2]')?.source).toBe('01');
    expect(firstRespelledNumber('n: 1.5\nm: 2024\nz: 0\nneg: -3')).toBeNull();
    expect(firstRespelledNumber('version: "1.10"')).toBeNull();
    expect(firstRespelledNumber('note: |\n  1.10 is text\n')).toBeNull();
    expect(firstRespelledNumber('name: 1.10 beta')).toBeNull();
  });
});

describe('convertYaml — errors', () => {
  it('reports a YAML syntax error with a line number', () => {
    expect(() => convertYaml('a: 1\n b: 2\n', opts())).toThrow(/line 2, column \d+/);
  });

  it('reports an unclosed flow sequence', () => {
    expect(() => convertYaml('a: [1, 2\n', opts())).toThrow(/line \d+/);
  });

  it('explains an invalid JSON input in JSON mode', () => {
    expect(() => convertYaml('{ oops }', opts({ mode: 'from-json' }))).toThrow(/not valid JSON/);
  });
});
