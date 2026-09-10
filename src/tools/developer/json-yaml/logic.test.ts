import { describe, expect, it } from 'vitest';
import {
  convert,
  describeJsonError,
  describeYamlError,
  detectFormat,
  isBlankYaml,
  findUnsupportedForJson,
  jsonToYaml,
  lineColumn,
  sortDeep,
  yamlToJson,
} from './logic';

const OPTS = { indent: 2, sortKeys: false, flowLevel: -1 };

describe('lineColumn', () => {
  it('counts from one on the first line', () => {
    expect(lineColumn('abc', 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumn('abc', 2)).toEqual({ line: 1, column: 3 });
  });

  it('resets the column after each newline', () => {
    const text = 'one\ntwo\nthree';
    expect(lineColumn(text, 4)).toEqual({ line: 2, column: 1 });
    expect(lineColumn(text, 8)).toEqual({ line: 3, column: 1 });
  });

  it('clamps an offset past the end to the end', () => {
    expect(lineColumn('ab', 99)).toEqual({ line: 1, column: 3 });
  });
});

describe('describeJsonError', () => {
  it('turns a V8 position into a line and column', () => {
    const input = '{\n  "a": 1,\n}';
    let message = '';
    try {
      JSON.parse(input);
    } catch (err) {
      message = describeJsonError(input, err);
    }
    expect(message).toMatch(/line 3, column 1/);
    expect(message).not.toMatch(/at position/);
  });

  it('explains an unterminated document', () => {
    let message = '';
    try {
      JSON.parse('[1, 2,');
    } catch (err) {
      message = describeJsonError('[1, 2,', err);
    }
    expect(message).toMatch(/ends too early/);
    expect(message).toMatch(/line 1, column 7/);
  });

  it('names the offending character when V8 gives no position', () => {
    const message = describeJsonError('{}', new Error('Unexpected token \'x\', "…" is not valid JSON'));
    expect(message).toContain('“x”');
  });
});

describe('describeYamlError', () => {
  it('reports a one-based line and column', () => {
    let message = '';
    try {
      yamlToJson('a: [1,\n', OPTS);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/Line \d+, column \d+:/);
  });

  it('falls back to the plain reason without a mark', () => {
    expect(describeYamlError(new Error('something broke'))).toBe('something broke.');
  });
});

describe('detectFormat', () => {
  it('recognises JSON objects and arrays', () => {
    expect(detectFormat('{"a": 1}')).toBe('json');
    expect(detectFormat('  [1, 2, 3]  ')).toBe('json');
  });

  it('treats a YAML flow mapping as YAML, not JSON', () => {
    expect(detectFormat('{a: 1, b: two}')).toBe('yaml');
  });

  it('recognises block YAML, documents and comments', () => {
    expect(detectFormat('name: Toolbox\nversion: 1')).toBe('yaml');
    expect(detectFormat('---\nfoo: bar')).toBe('yaml');
    expect(detectFormat('# a comment\nfoo: bar')).toBe('yaml');
  });

  it('defaults empty input to JSON rather than guessing', () => {
    expect(detectFormat('   ')).toBe('json');
  });
});

describe('sortDeep', () => {
  it('orders nested object keys but keeps array order', () => {
    const sorted = sortDeep({ b: 1, a: { d: [3, 1, 2], c: 4 } });
    expect(JSON.stringify(sorted)).toBe('{"a":{"c":4,"d":[3,1,2]},"b":1}');
  });

  it('leaves primitives alone', () => {
    expect(sortDeep(null)).toBeNull();
    expect(sortDeep('x')).toBe('x');
  });
});

describe('jsonToYaml', () => {
  it('writes block style by default', () => {
    expect(jsonToYaml('{"a":1,"b":["x","z"]}', OPTS)).toBe('a: 1\nb:\n  - x\n  - z\n');
  });

  it('honours the indent setting', () => {
    expect(jsonToYaml('{"a":{"b":1}}', { ...OPTS, indent: 4 })).toBe('a:\n    b: 1\n');
  });

  it('inlines collections at or below the flow level', () => {
    expect(jsonToYaml('{"a":{"b":1}}', { ...OPTS, flowLevel: 1 })).toBe('a: {b: 1}\n');
  });

  it('sorts keys deeply when asked', () => {
    expect(jsonToYaml('{"b":1,"a":{"d":2,"c":3}}', { ...OPTS, sortKeys: true })).toBe('a:\n  c: 3\n  d: 2\nb: 1\n');
  });

  it('reports where invalid JSON went wrong', () => {
    expect(() => jsonToYaml('{"a": 1,}', OPTS)).toThrow(/not valid JSON/);
    expect(() => jsonToYaml('{"a": 1,}', OPTS)).toThrow(/line 1, column 9/);
  });

  it('keeps long strings on one line instead of folding them', () => {
    const long = 'x'.repeat(300);
    expect(jsonToYaml(JSON.stringify({ a: long }), OPTS)).toBe(`a: ${long}\n`);
  });
});

describe('yamlToJson', () => {
  it('converts block YAML into indented JSON', () => {
    expect(yamlToJson('a: 1\nb:\n  - x\n  - y\n', OPTS).output).toBe('{\n  "a": 1,\n  "b": [\n    "x",\n    "y"\n  ]\n}');
  });

  it('minifies when the indent is zero', () => {
    expect(yamlToJson('a: 1', { ...OPTS, indent: 0 }).output).toBe('{"a":1}');
  });

  it('turns YAML nulls and booleans into JSON ones', () => {
    expect(yamlToJson('a: ~\nb: true\nc: "true"', { ...OPTS, indent: 0 }).output).toBe('{"a":null,"b":true,"c":"true"}');
  });

  it('keeps YAML 1.2 core-schema strings as strings', () => {
    // js-yaml 4 follows YAML 1.2, where `yes` and `off` are plain words.
    expect(yamlToJson('a: yes\nb: off', { ...OPTS, indent: 0 }).output).toBe('{"a":"yes","b":"off"}');
  });

  it('warns that infinity cannot survive the trip', () => {
    const result = yamlToJson('a: .inf', { ...OPTS, indent: 0 });
    expect(result.output).toBe('{"a":null}');
    expect(result.warning).toMatch(/JSON cannot express/);
  });

  it('rejects an empty document with a readable message', () => {
    expect(() => yamlToJson('# only a comment\n', OPTS)).toThrow(/empty/);
    expect(() => yamlToJson('---\n', OPTS)).toThrow(/empty/);
  });

  it('still converts an explicit null document', () => {
    expect(yamlToJson('~', OPTS).output).toBe('null');
  });

  it('rejects duplicate keys', () => {
    expect(() => yamlToJson('a: 1\na: 2\n', OPTS)).toThrow(/duplicated mapping key/);
  });
});

describe('isBlankYaml', () => {
  it('sees through comments and document markers', () => {
    expect(isBlankYaml('# hello\n---\n\n...')).toBe(true);
  });

  it('does not call a real document blank', () => {
    expect(isBlankYaml('a: 1 # trailing comment')).toBe(false);
  });
});

describe('findUnsupportedForJson', () => {
  it('finds a non-finite number deep inside a structure', () => {
    expect(findUnsupportedForJson({ a: [{ b: Number.NaN }] })).toMatch(/a\[0\].b/);
  });

  it('passes clean data', () => {
    expect(findUnsupportedForJson({ a: [1, 'two', null, true] })).toBeNull();
  });
});

describe('convert', () => {
  it('round-trips a document through YAML and back', () => {
    const source = { name: 'Toolbox', tags: ['a', 'b'], nested: { on: true, count: 3, empty: null } };
    const yaml = convert(JSON.stringify(source), 'auto', OPTS);
    expect(yaml.to).toBe('yaml');
    const back = convert(yaml.output, 'auto', { ...OPTS, indent: 0 });
    expect(back.to).toBe('json');
    expect(JSON.parse(back.output)).toEqual(source);
  });

  it('follows an explicit direction even when detection would disagree', () => {
    const result = convert('a: 1', 'yamlToJson', { ...OPTS, indent: 0 });
    expect(result.output).toBe('{"a":1}');
    expect(() => convert('a: 1', 'jsonToYaml', OPTS)).toThrow(/not valid JSON/);
  });
});
