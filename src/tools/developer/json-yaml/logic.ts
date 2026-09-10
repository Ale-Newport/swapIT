import { dump, load } from 'js-yaml';

export type Format = 'json' | 'yaml';
export type Direction = 'auto' | 'jsonToYaml' | 'yamlToJson';

export interface ConvertOptions {
  /** Spaces per indent level, 1–8. */
  indent: number;
  sortKeys: boolean;
  /** js-yaml flow level: -1 keeps everything in block style. */
  flowLevel: number;
}

export interface ConvertResult {
  output: string;
  from: Format;
  to: Format;
  /** Set when the conversion silently changed a value JSON cannot express. */
  warning?: string;
}

/** 1-based line and column of a character offset — what an editor shows. */
export function lineColumn(text: string, index: number): { line: number; column: number } {
  const bounded = Math.max(0, Math.min(index, text.length));
  const before = text.slice(0, bounded);
  const line = before.split('\n').length;
  const lastBreak = before.lastIndexOf('\n');
  return { line, column: bounded - lastBreak };
}

/**
 * V8 reports a character offset for most JSON syntax errors but falls back to a
 * quoted snippet for others. Turn whichever we get into a sentence with a
 * position when one is available, and never invent a position when it is not.
 */
export function describeJsonError(input: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const at = /at position (\d+)/.exec(message);
  if (at) {
    const { line, column } = lineColumn(input, Number(at[1]));
    const cleaned = message
      .replace(/\s*in JSON at position \d+.*$/, '')
      .replace(/\s*at position \d+.*$/, '')
      .replace(/[.\s]+$/, '');
    return `${cleaned} — line ${line}, column ${column}.`;
  }
  if (/Unexpected end of JSON input/i.test(message)) {
    const { line, column } = lineColumn(input, input.length);
    return `The JSON ends too early — a bracket, brace or quote was never closed (line ${line}, column ${column}).`;
  }
  const token = /Unexpected token '?(.)'?/.exec(message);
  if (token) {
    return `Unexpected “${token[1]}” in the JSON. Look for a trailing comma, a missing quote or a missing colon.`;
  }
  return message.replace(/[.\s]*$/, '.');
}

interface YamlMark {
  line?: number;
  column?: number;
}

/** js-yaml marks are 0-based; humans and editors count from 1. */
export function describeYamlError(err: unknown): string {
  const e = err as { reason?: string; message?: string; mark?: YamlMark } | null;
  const reason = e?.reason ?? (err instanceof Error ? err.message : String(err));
  const mark = e?.mark;
  if (mark && typeof mark.line === 'number') {
    const column = typeof mark.column === 'number' ? mark.column + 1 : 1;
    return `Line ${mark.line + 1}, column ${column}: ${reason}.`;
  }
  return `${reason}.`.replace(/\.+$/, '.');
}

/**
 * Which language the pasted text is written in. JSON is a subset of YAML, so
 * anything that parses as JSON is reported as JSON — the conversion is the same
 * either way, and the label matches what the user typed.
 */
export function detectFormat(text: string): Format {
  const trimmed = text.trim();
  if (!trimmed) return 'json';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // `{a: 1}` is a YAML flow mapping, not JSON.
      return 'yaml';
    }
  }
  if (/^---/m.test(trimmed) || trimmed.startsWith('%YAML') || trimmed.startsWith('#')) return 'yaml';
  try {
    JSON.parse(trimmed);
    return 'json';
  } catch {
    return 'yaml';
  }
}

/** Recursively order object keys; arrays keep their order, which is data. */
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortDeep(v)]));
  }
  return value;
}

/** Values YAML allows but JSON has no syntax for, so JSON.stringify drops them. */
export function findUnsupportedForJson(value: unknown, path = ''): string | null {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return `${path || 'The value'} is ${Number.isNaN(value) ? '.nan' : value > 0 ? '.inf' : '-.inf'}, which JSON cannot express — it became null.`;
  }
  if (typeof value === 'undefined') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findUnsupportedForJson(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value instanceof Date) return null;
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const found = findUnsupportedForJson(child, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

/**
 * True when a YAML document holds nothing but comments, document markers and
 * whitespace — js-yaml parses those to null, which is indistinguishable from an
 * explicit `~` unless we look at the source.
 */
export function isBlankYaml(text: string): boolean {
  return text.split('\n').every((line) => {
    const withoutComment = line.replace(/#.*$/, '').trim();
    return withoutComment === '' || withoutComment === '---' || withoutComment === '...';
  });
}

export function jsonToYaml(text: string, options: ConvertOptions): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`That is not valid JSON. ${describeJsonError(text, err)}`);
  }
  try {
    return dump(options.sortKeys ? sortDeep(parsed) : parsed, {
      indent: Math.min(8, Math.max(1, Math.round(options.indent) || 2)),
      // Sorting already happened above, deeply — js-yaml only sorts one level.
      sortKeys: false,
      flowLevel: options.flowLevel,
      noRefs: true,
      lineWidth: -1,
    });
  } catch (err) {
    throw new Error(`The JSON parsed but could not be written as YAML. ${describeYamlError(err)}`);
  }
}

export function yamlToJson(text: string, options: ConvertOptions): { output: string; warning?: string } {
  let parsed: unknown;
  try {
    parsed = load(text) as unknown;
  } catch (err) {
    throw new Error(`That is not valid YAML. ${describeYamlError(err)}`);
  }
  if (parsed === undefined || isBlankYaml(text)) {
    throw new Error('That YAML document is empty, so there is nothing to convert.');
  }
  const warning = findUnsupportedForJson(parsed) ?? undefined;
  const indent = Math.min(8, Math.max(0, Math.round(options.indent)));
  const output = JSON.stringify(options.sortKeys ? sortDeep(parsed) : parsed, null, indent);
  return warning ? { output, warning } : { output };
}

export function convert(text: string, direction: Direction, options: ConvertOptions): ConvertResult {
  const from = direction === 'auto' ? detectFormat(text) : direction === 'jsonToYaml' ? 'json' : 'yaml';
  if (from === 'json') {
    return { output: jsonToYaml(text, options), from: 'json', to: 'yaml' };
  }
  const { output, warning } = yamlToJson(text, options);
  return warning ? { output, from: 'yaml', to: 'json', warning } : { output, from: 'yaml', to: 'json' };
}
