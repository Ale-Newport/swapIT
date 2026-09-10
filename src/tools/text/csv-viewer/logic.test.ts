import { describe, expect, it } from 'vitest';
import {
  compareCells,
  filterRows,
  inferColumnType,
  parseDate,
  parseNumber,
  parseTable,
  toDelimited,
  toJsonText,
} from './logic';

describe('parseNumber', () => {
  it('accepts the usual shapes', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber(' -3.5 ')).toBe(-3.5);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('1.2e3')).toBe(1200);
  });

  it('accepts grouped thousands', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('1,234,567.89')).toBeCloseTo(1234567.89);
  });

  it('rejects anything else', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('12px')).toBeNull();
    expect(parseNumber('1,23')).toBeNull();
    expect(parseNumber('NaN')).toBeNull();
    expect(parseNumber('Infinity')).toBeNull();
    expect(parseNumber('0x10')).toBeNull();
  });
});

describe('parseDate', () => {
  it('accepts unambiguous date shapes', () => {
    expect(parseDate('2024-03-05')).not.toBeNull();
    expect(parseDate('2024-03-05T10:30:00Z')).not.toBeNull();
    expect(parseDate('2024/03/05')).not.toBeNull();
    expect(parseDate('03/05/2024')).not.toBeNull();
  });

  it('rejects bare numbers and prose', () => {
    expect(parseDate('5')).toBeNull();
    expect(parseDate('2024')).toBeNull();
    expect(parseDate('March 2024')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('rejects impossible dates that match the shape', () => {
    expect(parseDate('2024-13-45')).toBeNull();
  });
});

describe('inferColumnType', () => {
  it('needs every filled cell to agree', () => {
    expect(inferColumnType(['1', '2', '3'])).toBe('number');
    expect(inferColumnType(['1', 'two', '3'])).toBe('text');
  });

  it('ignores blank cells', () => {
    expect(inferColumnType(['1', '', '  ', '3'])).toBe('number');
  });

  it('falls back to text for an empty column', () => {
    expect(inferColumnType(['', '  '])).toBe('text');
    expect(inferColumnType([])).toBe('text');
  });

  it('detects dates', () => {
    expect(inferColumnType(['2024-01-01', '2023-12-31'])).toBe('date');
  });

  it('prefers number when a column of years could be either', () => {
    expect(inferColumnType(['1815', '1912'])).toBe('number');
  });
});

describe('compareCells', () => {
  it('sorts numbers numerically, not lexically', () => {
    expect(compareCells('9', '10', 'number')).toBeLessThan(0);
    expect(compareCells('9', '10', 'text')).toBeLessThan(0);
    expect(compareCells('90', '100', 'number')).toBeLessThan(0);
  });

  it('sorts dates chronologically', () => {
    expect(compareCells('2024-01-02', '2024-01-10', 'date')).toBeLessThan(0);
  });

  it('always pushes blanks to the end', () => {
    expect(compareCells('', 'a', 'text')).toBeGreaterThan(0);
    expect(compareCells('a', '', 'text')).toBeLessThan(0);
    expect(compareCells('', '', 'number')).toBe(0);
  });
});

describe('filterRows', () => {
  const rows = [
    ['Ada', 'London'],
    ['Alan', 'Wilmslow'],
  ];

  it('matches any cell, case-insensitively', () => {
    expect(filterRows(rows, 'ada')).toHaveLength(1);
    expect(filterRows(rows, 'LONDON')).toHaveLength(1);
    expect(filterRows(rows, 'a')).toHaveLength(2);
  });

  it('returns everything for a blank query', () => {
    expect(filterRows(rows, '   ')).toBe(rows);
  });
});

describe('parseTable', () => {
  it('reads a comma file with a header row', () => {
    const table = parseTable('name,age\nAda,36\nAlan,41\n', { delimiter: '', header: true });
    expect(table.fields).toEqual(['name', 'age']);
    expect(table.rows).toEqual([
      ['Ada', '36'],
      ['Alan', '41'],
    ]);
    expect(table.types).toEqual(['text', 'number']);
    expect(table.delimiter).toBe(',');
  });

  it('detects tabs on its own', () => {
    const table = parseTable('a\tb\n1\t2\n', { delimiter: '', header: true });
    expect(table.delimiter).toBe('\t');
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('honours a manual delimiter', () => {
    const table = parseTable('a;b\n1;2\n', { delimiter: ';', header: true });
    expect(table.fields).toEqual(['a', 'b']);
  });

  it('numbers the columns when there is no header row', () => {
    const table = parseTable('Ada,36\nAlan,41\n', { delimiter: ',', header: false });
    expect(table.fields).toEqual(['Column 1', 'Column 2']);
    expect(table.rows).toHaveLength(2);
  });

  it('pads ragged rows to the widest one', () => {
    const table = parseTable('a,b,c\n1,2\n3,4,5,6\n', { delimiter: ',', header: true });
    expect(table.fields).toHaveLength(4);
    expect(table.rows[0]).toEqual(['1', '2', '', '']);
    expect(table.rows[1]).toEqual(['3', '4', '5', '6']);
  });

  it('keeps quoted delimiters inside a cell', () => {
    const table = parseTable('name,city\n"Smith, J",London\n', { delimiter: ',', header: true });
    expect(table.rows[0][0]).toBe('Smith, J');
  });

  it('names blank and duplicate headers uniquely', () => {
    const table = parseTable('a,,a\n1,2,3\n', { delimiter: ',', header: true });
    expect(table.fields).toEqual(['a', 'Column 2', 'a (2)']);
  });

  it('returns an empty table for blank input', () => {
    expect(parseTable('  \n', { delimiter: '', header: true })).toEqual({
      fields: [],
      rows: [],
      types: [],
      delimiter: '',
      errors: [],
    });
  });
});

describe('exports', () => {
  const fields = ['name', 'city'];
  const rows = [['Smith, J', 'London']];

  it('round-trips through CSV', () => {
    const csv = toDelimited(fields, rows, ',', true);
    expect(csv).toBe('name,city\n"Smith, J",London');
    expect(parseTable(csv, { delimiter: ',', header: true }).rows).toEqual(rows);
  });

  it('writes TSV', () => {
    expect(toDelimited(fields, rows, '\t', true)).toBe('name\tcity\nSmith, J\tLondon');
  });

  it('omits the header row when there is none', () => {
    expect(toDelimited(fields, rows, ',', false)).toBe('"Smith, J",London');
  });

  it('writes objects when a header row exists and arrays otherwise', () => {
    expect(JSON.parse(toJsonText(fields, rows, true))).toEqual([{ name: 'Smith, J', city: 'London' }]);
    expect(JSON.parse(toJsonText(fields, rows, false))).toEqual(rows);
  });
});
