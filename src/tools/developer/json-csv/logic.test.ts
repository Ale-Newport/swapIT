import { describe, expect, it } from 'vitest';
import {
  coerceValue,
  collectColumns,
  csvToJson,
  detectFormat,
  flatten,
  jsonToCsv,
  toRows,
  unflatten,
} from './logic';

const CSV_OPTS = { delimiter: ',' };
const JSON_OPTS = { header: true, inferTypes: true, empty: 'null' as const, indent: 0, delimiter: ',' };

describe('flatten', () => {
  it('joins nested object keys with dots', () => {
    expect(flatten({ a: { b: { c: 1 } }, d: 2 })).toEqual({ 'a.b.c': 1, d: 2 });
  });

  it('indexes arrays', () => {
    expect(flatten({ tags: ['x', 'y'] })).toEqual({ 'tags.0': 'x', 'tags.1': 'y' });
  });

  it('indexes objects inside arrays', () => {
    expect(flatten({ users: [{ name: 'Ada' }, { name: 'Linus' }] })).toEqual({
      'users.0.name': 'Ada',
      'users.1.name': 'Linus',
    });
  });

  it('keeps null as a value rather than descending into it', () => {
    expect(flatten({ a: null, b: { c: null } })).toEqual({ a: null, 'b.c': null });
  });

  it('drops empty objects and arrays, which a CSV cell cannot hold', () => {
    expect(flatten({ a: {}, b: [], c: 1 })).toEqual({ c: 1 });
  });

  it('keeps booleans and zero', () => {
    expect(flatten({ a: false, b: 0, c: '' })).toEqual({ a: false, b: 0, c: '' });
  });
});

describe('unflatten', () => {
  it('rebuilds nested objects', () => {
    expect(unflatten({ 'a.b.c': 1, d: 2 })).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });

  it('rebuilds arrays from numeric segments', () => {
    expect(unflatten({ 'tags.0': 'x', 'tags.1': 'y' })).toEqual({ tags: ['x', 'y'] });
  });

  it('fills gaps in array indices with null', () => {
    expect(unflatten({ 'tags.0': 'x', 'tags.2': 'z' })).toEqual({ tags: ['x', null, 'z'] });
  });

  it('is the inverse of flatten for a mixed structure', () => {
    const source = { id: 7, user: { name: 'Ada', langs: ['en', 'fr'] }, active: true, note: null };
    expect(unflatten(flatten(source))).toEqual(source);
  });

  it('leaves a key containing no dot untouched', () => {
    expect(unflatten({ plain: 'value' })).toEqual({ plain: 'value' });
  });
});

describe('collectColumns', () => {
  it('unions keys in first-seen order', () => {
    expect(collectColumns([{ a: 1, b: 2 }, { b: 3, c: 4 }])).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for no rows', () => {
    expect(collectColumns([])).toEqual([]);
  });
});

describe('toRows', () => {
  it('treats a lone object as a single row', () => {
    expect(toRows({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it('wraps primitives in a value column', () => {
    expect(toRows(['x', 2])).toEqual([{ value: 'x' }, { value: 2 }]);
  });
});

describe('jsonToCsv', () => {
  it('writes a header and one line per object', () => {
    const result = jsonToCsv('[{"a":1,"b":"x"},{"a":2,"b":"y"}]', CSV_OPTS);
    expect(result.output).toBe('a,b\n1,x\n2,y');
    expect(result.rowCount).toBe(2);
  });

  it('leaves a missing key as an empty cell', () => {
    expect(jsonToCsv('[{"a":1,"b":2},{"a":3}]', CSV_OPTS).output).toBe('a,b\n1,2\n3,');
  });

  it('flattens nested objects into dotted columns', () => {
    expect(jsonToCsv('[{"user":{"name":"Ada"}}]', CSV_OPTS).output).toBe('user.name\nAda');
  });

  it('quotes cells containing the delimiter, quotes or newlines', () => {
    expect(jsonToCsv('[{"a":"x,y","b":"say \\"hi\\"","c":"one\\ntwo"}]', CSV_OPTS).output).toBe(
      'a,b,c\n"x,y","say ""hi""","one\ntwo"',
    );
  });

  it('honours a semicolon or tab delimiter', () => {
    expect(jsonToCsv('[{"a":1,"b":2}]', { delimiter: ';' }).output).toBe('a;b\n1;2');
    expect(jsonToCsv('[{"a":1,"b":2}]', { delimiter: '\t' }).output).toBe('a\tb\n1\t2');
  });

  it('reports where the JSON is malformed', () => {
    expect(() => jsonToCsv('[{"a":1,}]', CSV_OPTS)).toThrow(/line 1, column 9/);
  });

  it('refuses data with no fields at all', () => {
    expect(() => jsonToCsv('[{},{}]', CSV_OPTS)).toThrow(/no values/);
  });
});

describe('coerceValue', () => {
  it('reads numbers, booleans and null', () => {
    expect(coerceValue('42')).toBe(42);
    expect(coerceValue('-3.5')).toBe(-3.5);
    expect(coerceValue('1e3')).toBe(1000);
    expect(coerceValue('true')).toBe(true);
    expect(coerceValue('null')).toBeNull();
  });

  it('keeps identifiers that merely look numeric', () => {
    expect(coerceValue('007')).toBe('007');
    expect(coerceValue('+1 555 0100')).toBe('+1 555 0100');
    expect(coerceValue('1234567890123456789')).toBe('1234567890123456789');
  });

  it('keeps the original spacing of a string', () => {
    expect(coerceValue('  hello ')).toBe('  hello ');
  });
});

describe('csvToJson', () => {
  it('uses the header row as keys', () => {
    expect(csvToJson('a,b\n1,x\n2,y', JSON_OPTS).output).toBe('[{"a":1,"b":"x"},{"a":2,"b":"y"}]');
  });

  it('keeps everything as strings when inference is off', () => {
    expect(csvToJson('a,b\n1,true', { ...JSON_OPTS, inferTypes: false }).output).toBe('[{"a":"1","b":"true"}]');
  });

  it('rebuilds nesting from dotted headers', () => {
    expect(csvToJson('user.name,user.tags.0\nAda,en', JSON_OPTS).output).toBe('[{"user":{"name":"Ada","tags":["en"]}}]');
  });

  it('applies the empty-cell policy', () => {
    expect(csvToJson('a,b\n1,', JSON_OPTS).output).toBe('[{"a":1,"b":null}]');
    expect(csvToJson('a,b\n1,', { ...JSON_OPTS, empty: 'string' }).output).toBe('[{"a":1,"b":""}]');
    expect(csvToJson('a,b\n1,', { ...JSON_OPTS, empty: 'omit' }).output).toBe('[{"a":1}]');
  });

  it('returns rows of values when there is no header', () => {
    expect(csvToJson('1,x\n2,y', { ...JSON_OPTS, header: false }).output).toBe('[[1,"x"],[2,"y"]]');
  });

  it('sniffs the delimiter when none is given', () => {
    const result = csvToJson('a;b\n1;2', { ...JSON_OPTS, delimiter: '' });
    expect(result.delimiter).toBe(';');
    expect(result.output).toBe('[{"a":1,"b":2}]');
  });

  it('reads quoted cells containing commas and newlines', () => {
    const result = csvToJson('a,b\n"x,y","one\ntwo"', JSON_OPTS);
    expect(JSON.parse(result.output)).toEqual([{ a: 'x,y', b: 'one\ntwo' }]);
  });

  it('complains about ragged rows instead of silently dropping data', () => {
    expect(() => csvToJson('a,b,c\n1,2', JSON_OPTS)).toThrow(/same number of values/);
  });

  it('rejects a header with no rows under it', () => {
    expect(() => csvToJson('a,b', JSON_OPTS)).toThrow(/no data rows/);
  });

  it('round-trips objects through CSV and back', () => {
    const source = [
      { id: 1, user: { name: 'Ada', langs: ['en', 'fr'] }, active: true },
      { id: 2, user: { name: 'Linus', langs: ['fi'] }, active: false },
    ];
    const csv = jsonToCsv(JSON.stringify(source), CSV_OPTS);
    const back = csvToJson(csv.output, { ...JSON_OPTS, empty: 'omit' });
    expect(JSON.parse(back.output)).toEqual(source);
  });
});

describe('detectFormat', () => {
  it('spots JSON by its opening brace or bracket', () => {
    expect(detectFormat('  {"a":1}')).toBe('json');
    expect(detectFormat('[1,2]')).toBe('json');
  });

  it('treats anything else as CSV', () => {
    expect(detectFormat('a,b\n1,2')).toBe('csv');
  });
});
