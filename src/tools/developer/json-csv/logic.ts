import Papa from 'papaparse';

export type Format = 'json' | 'csv';
export type Direction = 'auto' | 'jsonToCsv' | 'csvToJson';
/** What an empty CSV cell becomes on the way back to JSON. */
export type EmptyPolicy = 'null' | 'string' | 'omit';

export interface CsvOptions {
  /** '' means "let Papa Parse sniff the delimiter". */
  delimiter: string;
}

export interface JsonOptions {
  header: boolean;
  inferTypes: boolean;
  empty: EmptyPolicy;
  indent: number;
  delimiter: string;
}

export type Row = Record<string, unknown>;

/** Compact position reporting for JSON syntax errors. */
export function jsonErrorMessage(input: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const at = /at position (\d+)/.exec(message);
  if (at) {
    const before = input.slice(0, Number(at[1]));
    const line = before.split('\n').length;
    const column = before.length - before.lastIndexOf('\n');
    const cleaned = message.replace(/\s*(in JSON)?\s*at position \d+.*$/, '').replace(/[.\s]+$/, '');
    return `${cleaned} — line ${line}, column ${column}.`;
  }
  if (/Unexpected end of JSON input/i.test(message)) {
    return 'The JSON ends too early — a bracket, brace or quote was never closed.';
  }
  return message.replace(/[.\s]*$/, '.');
}

export function detectFormat(text: string): Format {
  const trimmed = text.trim();
  if (!trimmed) return 'json';
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'csv';
}

/**
 * Collapse nested objects and arrays into dotted column names: `{a:{b:1}}`
 * becomes `a.b`, `{tags:['x']}` becomes `tags.0`. Empty objects and empty
 * arrays produce no column at all — a CSV cell has nowhere to put them.
 */
export function flatten(value: unknown, prefix = '', out: Row = {}): Row {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, prefix ? `${prefix}.${index}` : String(index), out));
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Row)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  if (prefix) out[prefix] = value;
  return out;
}

/**
 * The inverse of `flatten`: a numeric path segment rebuilds an array, anything
 * else rebuilds an object. Gaps in indices become nulls, since JSON has no
 * notion of a hole.
 */
export function unflatten(row: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const parts = key.split('.');
    let cursor: Row = result;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      const childIsIndex = /^\d+$/.test(parts[i + 1]);
      const existing = cursor[part];
      if (existing === null || typeof existing !== 'object') {
        cursor[part] = childIsIndex ? [] : {};
      }
      cursor = cursor[part] as Row;
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return normalizeHoles(result) as Row;
}

/** Arrays built by index can contain holes; JSON.stringify writes those as null anyway. */
function normalizeHoles(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Array.from(value, (item) => (item === undefined ? null : normalizeHoles(item)));
  }
  if (value !== null && typeof value === 'object') {
    const out: Row = {};
    for (const [key, child] of Object.entries(value as Row)) out[key] = normalizeHoles(child);
    return out;
  }
  return value;
}

/** Every column any row uses, in the order the rows introduce them. */
export function collectColumns(rows: Row[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

/** Normalise whatever the JSON holds into a list of flat rows. */
export function toRows(parsed: unknown): Row[] {
  const asRow = (item: unknown): Row => {
    if (item !== null && typeof item === 'object') return flatten(item);
    return { value: item };
  };
  if (Array.isArray(parsed)) return parsed.map(asRow);
  return [asRow(parsed)];
}

export function jsonToCsv(text: string, options: CsvOptions): { output: string; columns: string[]; rowCount: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`That is not valid JSON. ${jsonErrorMessage(text, err)}`);
  }
  const rows = toRows(parsed);
  const columns = collectColumns(rows);
  if (columns.length === 0) {
    throw new Error('There are no values to put in a CSV — the JSON has no fields, only empty objects or arrays.');
  }
  const matrix = rows.map((row) => columns.map((column) => (row[column] === undefined ? '' : row[column])));
  const output = Papa.unparse(
    { fields: columns, data: matrix },
    { delimiter: options.delimiter || ',', newline: '\n' },
  );
  return { output, columns, rowCount: rows.length };
}

/** Turn one CSV cell into the JSON value it most likely represents. */
export function coerceValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return raw;
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  if (trimmed === 'null') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    // Long digit strings are identifiers far more often than they are numbers,
    // and turning them into doubles would silently corrupt them.
    if (/^-?\d{16,}$/.test(trimmed)) return raw;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return raw;
}

function applyEmpty(value: string, policy: EmptyPolicy): unknown | undefined {
  if (value !== '') return value;
  if (policy === 'omit') return undefined;
  return policy === 'null' ? null : '';
}

export function csvToJson(
  text: string,
  options: JsonOptions,
): { output: string; rowCount: number; columns: string[]; delimiter: string } {
  const parsed = Papa.parse<string[] | Record<string, string>>(text, {
    header: options.header,
    delimiter: options.delimiter || undefined,
    skipEmptyLines: 'greedy',
  });

  const fatal = parsed.errors.find((e) => e.code !== 'UndetectableDelimiter');
  if (fatal) {
    const where = typeof fatal.row === 'number' ? ` on row ${fatal.row + 1}` : '';
    if (fatal.code === 'TooFewFields' || fatal.code === 'TooManyFields') {
      throw new Error(
        `The rows do not all have the same number of values${where}. ${fatal.message} Check that the delimiter is right.`,
      );
    }
    throw new Error(`This CSV could not be read${where}. ${fatal.message}`);
  }

  const delimiter = parsed.meta.delimiter || options.delimiter || ',';

  if (!options.header) {
    // 'omit' means "leave the key out", and an array of arrays has no keys —
    // dropping a cell would shift every later value into the wrong column. The
    // UI disables that option while the header switch is off; a direct caller
    // gets the closest honest behaviour instead of a hole in the row.
    const policy: EmptyPolicy = options.empty === 'omit' ? 'string' : options.empty;
    const matrix = (parsed.data as string[][]).map((row) =>
      row.map((cell) => {
        const emptied = applyEmpty(cell, policy);
        return options.inferTypes && typeof emptied === 'string' && emptied !== '' ? coerceValue(emptied) : emptied;
      }),
    );
    if (matrix.length === 0) throw new Error('That CSV has no rows to convert.');
    return {
      output: JSON.stringify(matrix, null, clampIndent(options.indent)),
      rowCount: matrix.length,
      columns: [],
      delimiter,
    };
  }

  const raw = parsed.data as Record<string, string>[];
  if (raw.length === 0) throw new Error('That CSV has a header but no data rows.');
  const columns = (parsed.meta.fields ?? []).filter((f) => f !== '');
  if (columns.length === 0) throw new Error('The first line is empty, so there are no column names to use.');

  const rows = raw.map((row) => {
    const flat: Row = {};
    for (const column of columns) {
      const cell = row[column];
      if (cell === undefined) continue;
      const emptied = applyEmpty(cell, options.empty);
      if (emptied === undefined) continue;
      flat[column] = options.inferTypes && typeof emptied === 'string' && emptied !== '' ? coerceValue(emptied) : emptied;
    }
    return unflatten(flat);
  });

  return {
    output: JSON.stringify(rows, null, clampIndent(options.indent)),
    rowCount: rows.length,
    columns,
    delimiter,
  };
}

function clampIndent(indent: number): number {
  return Math.min(8, Math.max(0, Math.round(indent) || 0));
}
