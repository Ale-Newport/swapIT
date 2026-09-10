import Papa from 'papaparse';

export type ColumnType = 'number' | 'date' | 'text';

export interface ParseOptions {
  /** Empty means "detect it from the file". */
  delimiter: string;
  /** Treat the first row as column names. */
  header: boolean;
}

export interface Table {
  fields: string[];
  rows: string[][];
  types: ColumnType[];
  delimiter: string;
  errors: string[];
}

/** Rows sampled when guessing a column's type. */
const TYPE_SAMPLE = 500;

const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const GROUPED_NUMBER = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;

/** Parse a cell as a number, tolerating 1,234.56 style grouping. */
export function parseNumber(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (GROUPED_NUMBER.test(text)) {
    const n = Number(text.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (!PLAIN_NUMBER.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const DATE_SHAPES = [
  /^\d{4}-\d{1,2}-\d{1,2}([T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/,
  /^\d{4}\/\d{1,2}\/\d{1,2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,
];

/**
 * Only shapes that are unambiguously dates count. `Date.parse` alone is far too
 * eager — it happily turns "5" and "abc 2020" into dates.
 */
export function parseDate(value: string): number | null {
  const text = value.trim();
  if (!DATE_SHAPES.some((re) => re.test(text))) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : time;
}

/** A column is only a number or date column when every filled cell agrees. */
export function inferColumnType(values: string[]): ColumnType {
  let seen = 0;
  let numbers = 0;
  let dates = 0;
  for (const value of values) {
    if (!value || !value.trim()) continue;
    seen++;
    if (parseNumber(value) !== null) numbers++;
    if (parseDate(value) !== null) dates++;
    if (seen >= TYPE_SAMPLE) break;
  }
  if (seen === 0) return 'text';
  if (numbers === seen) return 'number';
  if (dates === seen) return 'date';
  return 'text';
}

/** Sort comparator for a column, with blank cells always pushed to the end. */
export function compareCells(a: string, b: string, type: ColumnType): number {
  const emptyA = !a || !a.trim();
  const emptyB = !b || !b.trim();
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;
  if (type === 'number') {
    const na = parseNumber(a);
    const nb = parseNumber(b);
    if (na !== null && nb !== null) return na - nb;
  }
  if (type === 'date') {
    const da = parseDate(a);
    const db = parseDate(b);
    if (da !== null && db !== null) return da - db;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Keep rows where any cell contains the query, case-insensitively. */
export function filterRows(rows: string[][], query: string): string[][] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(needle)));
}

export function parseTable(text: string, opts: ParseOptions): Table {
  if (!text.trim()) {
    return { fields: [], rows: [], types: [], delimiter: opts.delimiter, errors: [] };
  }

  const parsed = Papa.parse<string[]>(text, {
    delimiter: opts.delimiter,
    skipEmptyLines: 'greedy',
  });

  const data = (parsed.data ?? []).filter((row) => Array.isArray(row) && row.length > 0);
  const errors = [...new Set((parsed.errors ?? []).map((e) => e.message))].slice(0, 3);

  let fields: string[];
  let rows: string[][];
  if (opts.header && data.length > 0) {
    fields = data[0].map((name, i) => (name ?? '').trim() || `Column ${i + 1}`);
    rows = data.slice(1);
  } else {
    fields = [];
    rows = data;
  }

  // A loop, not `Math.max(...rows.map(…))`: spreading one argument per row
  // blows the call stack somewhere above 100k rows, well inside the sizes this
  // tool accepts.
  let width = fields.length;
  for (const row of rows) {
    if (row.length > width) width = row.length;
  }
  for (let i = fields.length; i < width; i++) fields.push(`Column ${i + 1}`);
  // Duplicate header names would make the JSON export lose columns.
  const used = new Map<string, number>();
  fields = fields.map((name) => {
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });

  const normalised = rows.map((row) => {
    if (row.length === width) return row.map((cell) => cell ?? '');
    const next = new Array<string>(width);
    for (let i = 0; i < width; i++) next[i] = row[i] ?? '';
    return next;
  });

  const sample = normalised.slice(0, TYPE_SAMPLE);
  const types = fields.map((_, i) => inferColumnType(sample.map((row) => row[i])));

  return {
    fields,
    rows: normalised,
    types,
    delimiter: parsed.meta?.delimiter || opts.delimiter,
    errors,
  };
}

export function toDelimited(fields: string[], rows: string[][], delimiter: string, header: boolean): string {
  const config = { delimiter, newline: '\n' };
  return header ? Papa.unparse({ fields, data: rows }, config) : Papa.unparse(rows, config);
}

export function toJsonText(fields: string[], rows: string[][], header: boolean): string {
  const value = header
    ? rows.map((row) => Object.fromEntries(fields.map((name, i) => [name, row[i] ?? ''])))
    : rows;
  return JSON.stringify(value, null, 2);
}

export const DELIMITER_LABELS: Record<string, string> = {
  ',': 'Comma',
  ';': 'Semicolon',
  '\t': 'Tab',
  '|': 'Pipe',
  ' ': 'Space',
};
