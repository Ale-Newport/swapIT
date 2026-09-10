import { describe, expect, it } from 'vitest';
import {
  analyzeJson,
  cleanErrorMessage,
  describeError,
  findDuplicateKeys,
  indexFromLineColumn,
  lineColumnFromIndex,
  parseErrorLocation,
} from './logic';

describe('lineColumnFromIndex', () => {
  it('reports 1-based line and column', () => {
    expect(lineColumnFromIndex('abc', 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnFromIndex('abc', 2)).toEqual({ line: 1, column: 3 });
  });

  it('counts newlines', () => {
    expect(lineColumnFromIndex('a\nbc\nd', 2)).toEqual({ line: 2, column: 1 });
    expect(lineColumnFromIndex('a\nbc\nd', 3)).toEqual({ line: 2, column: 2 });
    expect(lineColumnFromIndex('a\nbc\nd', 5)).toEqual({ line: 3, column: 1 });
  });

  it('clamps out-of-range offsets', () => {
    expect(lineColumnFromIndex('ab', 99)).toEqual({ line: 1, column: 3 });
    expect(lineColumnFromIndex('ab', -5)).toEqual({ line: 1, column: 1 });
  });
});

describe('indexFromLineColumn', () => {
  it('round-trips with lineColumnFromIndex', () => {
    const text = '{\n  "a": 1,\n  "b": 2\n}';
    for (const index of [0, 1, 5, 12, 20]) {
      const { line, column } = lineColumnFromIndex(text, index);
      expect(indexFromLineColumn(text, line, column)).toBe(index);
    }
  });
});

describe('parseErrorLocation', () => {
  const text = '{\n  "a": 1,\n  "b" 2\n}';

  it('reads the V8 "position" phrasing', () => {
    const loc = parseErrorLocation('Unexpected number in JSON at position 18', text);
    expect(loc).toEqual({ line: 3, column: 7, index: 18 });
  });

  it('prefers an explicit line and column when both are given', () => {
    const loc = parseErrorLocation(
      "Expected ':' after property name in JSON at position 18 (line 3 column 7)",
      text,
    );
    expect(loc?.line).toBe(3);
    expect(loc?.column).toBe(7);
    expect(loc?.index).toBe(18);
  });

  it('reads the Firefox phrasing', () => {
    const loc = parseErrorLocation(
      "JSON.parse: expected ':' after property name at line 3 column 7 of the JSON data",
      text,
    );
    expect(loc?.line).toBe(3);
    expect(loc?.column).toBe(7);
  });

  it('returns null when the engine says nothing useful', () => {
    expect(parseErrorLocation("JSON Parse error: Expected '}'", text)).toBeNull();
  });
});

describe('cleanErrorMessage', () => {
  it('drops the position clause', () => {
    expect(cleanErrorMessage("Expected ',' or '}' after property value in JSON at position 42 (line 3 column 5)")).toBe(
      "Expected ',' or '}' after property value",
    );
  });

  it('drops the Firefox prefix and suffix', () => {
    expect(
      cleanErrorMessage("JSON.parse: expected ':' after property name at line 3 column 7 of the JSON data"),
    ).toBe("expected ':' after property name");
  });

  it('drops the Safari prefix', () => {
    expect(cleanErrorMessage("JSON Parse error: Expected '}'")).toBe("Expected '}'");
  });
});

describe('describeError', () => {
  it('picks out the offending line', () => {
    const text = '{\n  "a": 1,\n  "b" 2\n}';
    const err = describeError("Expected ':' after property name in JSON at position 18 (line 3 column 7)", text);
    expect(err.line).toBe(3);
    expect(err.lineText).toBe('  "b" 2');
    expect(err.reason).toBe("Expected ':' after property name");
  });

  it('falls back to line 1 when there is no position', () => {
    const err = describeError('Unexpected end of JSON input', 'oops');
    expect(err.line).toBe(1);
    expect(err.lineText).toBe('oops');
  });
});

describe('analyzeJson', () => {
  it('describes a scalar', () => {
    const stats = analyzeJson(42);
    expect(stats.type).toBe('number');
    expect(stats.nodes).toBe(1);
    expect(stats.depth).toBe(1);
  });

  it('counts every node type', () => {
    const stats = analyzeJson({ a: [1, 'two', true, null], b: { c: {} } });
    expect(stats.type).toBe('object');
    expect(stats.objects).toBe(3);
    expect(stats.arrays).toBe(1);
    expect(stats.numbers).toBe(1);
    expect(stats.strings).toBe(1);
    expect(stats.booleans).toBe(1);
    expect(stats.nulls).toBe(1);
    expect(stats.keys).toBe(3);
  });

  it('measures nesting depth', () => {
    expect(analyzeJson({ a: { b: { c: 1 } } }).depth).toBe(4);
    expect(analyzeJson([[[1]]]).depth).toBe(4);
    expect(analyzeJson([]).depth).toBe(1);
  });

  it('treats null as its own type, not an object', () => {
    const stats = analyzeJson(null);
    expect(stats.type).toBe('null');
    expect(stats.objects).toBe(0);
    expect(stats.nulls).toBe(1);
  });
});

describe('findDuplicateKeys', () => {
  it('finds nothing in a clean document', () => {
    expect(findDuplicateKeys('{"a": 1, "b": 2}')).toEqual([]);
  });

  it('reports a repeated key with every line it appears on', () => {
    const text = '{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}';
    expect(findDuplicateKeys(text)).toEqual([{ path: '$', key: 'a', lines: [2, 4] }]);
  });

  it('reports the path of a nested object', () => {
    const text = '{\n  "user": {\n    "id": 1,\n    "id": 2\n  }\n}';
    expect(findDuplicateKeys(text)).toEqual([{ path: '$.user', key: 'id', lines: [3, 4] }]);
  });

  it('indexes objects inside arrays', () => {
    const text = '{"items": [\n {"x": 1},\n {"y": 1, "y": 2}\n]}';
    expect(findDuplicateKeys(text)).toEqual([{ path: '$.items[1]', key: 'y', lines: [3, 3] }]);
  });

  it('does not mistake string values for keys', () => {
    expect(findDuplicateKeys('{"a": "a", "b": "a"}')).toEqual([]);
  });

  it('does not mistake array strings for keys', () => {
    expect(findDuplicateKeys('{"tags": ["x", "x", "x"]}')).toEqual([]);
  });

  it('handles escaped quotes inside keys', () => {
    const text = '{"a\\"b": 1, "a\\"b": 2}';
    expect(findDuplicateKeys(text)).toEqual([{ path: '$', key: 'a"b', lines: [1, 1] }]);
  });

  it('counts three occurrences', () => {
    const text = '{"k":1,"k":2,"k":3}';
    expect(findDuplicateKeys(text)[0].lines).toHaveLength(3);
  });

  it('survives truncated input without hanging', () => {
    expect(() => findDuplicateKeys('{"a": {"b": [1, 2')).not.toThrow();
    expect(() => findDuplicateKeys('')).not.toThrow();
  });
});
