import yaml from 'js-yaml';

export type YamlMode = 'format' | 'to-json' | 'from-json';

export interface YamlOptions {
  mode: YamlMode;
  /** Spaces per level of nesting in YAML output. */
  indent: number;
  /** Wrap column for YAML output; 0 or less never wraps. */
  lineWidth: number;
  sortKeys: boolean;
  quoting: 'auto' | 'single' | 'double';
  /** Inline collections — `{a: 1, b: [2, 3]}` — instead of block style. */
  flow: boolean;
}

export interface YamlResult {
  output: string;
  /** Number of `---` separated documents found in the input. */
  documents: number;
  warning?: string;
}

export const DEFAULT_YAML_OPTIONS: YamlOptions = {
  mode: 'format',
  indent: 2,
  lineWidth: 80,
  sortKeys: false,
  quoting: 'auto',
  flow: false,
};

interface YamlMark {
  line?: number;
  column?: number;
}

/** js-yaml marks are 0-based; people count from one. */
function rethrowYaml(err: unknown): never {
  if (err instanceof yaml.YAMLException) {
    const mark = (err as unknown as { mark?: YamlMark }).mark;
    const reason = err.reason || err.message;
    if (mark && typeof mark.line === 'number') {
      throw new Error(`${reason} — line ${mark.line + 1}, column ${(mark.column ?? 0) + 1}.`);
    }
    throw new Error(`${reason}.`);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

function rethrowJson(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`That is not valid JSON: ${message.replace(/^JSON\.parse:\s*/i, '')}`);
}

/**
 * js-yaml re-exports its individual types so a schema can be composed; the
 * bundled type definitions stop at the four ready-made schemas, hence the cast.
 */
const YAML_TYPES = (yaml as unknown as { types: Record<string, yaml.Type> }).types;

/**
 * The default schema minus two types that quietly rewrite a document:
 *
 * - `timestamp` turns `2024-01-15` into a JS `Date`, which dumps back as the
 *   ISO string `2024-01-15T00:00:00.000Z`.
 * - `merge` splices `<<: *base` into its parent, so the anchor and the merge
 *   key are both lost. Left alone, `<<` is an ordinary key holding an alias
 *   and survives the round trip untouched.
 *
 * Everything else the default schema knows — `!!binary`, `!!omap`, `!!pairs`,
 * `!!set` — is kept so documents that use those tags still load.
 */
const FORMATTING_SCHEMA = yaml.CORE_SCHEMA.extend({
  explicit: [YAML_TYPES.binary, YAML_TYPES.omap, YAML_TYPES.pairs, YAML_TYPES.set],
});

function dumpOptions(opts: YamlOptions): yaml.DumpOptions {
  return {
    schema: FORMATTING_SCHEMA,
    indent: Math.min(10, Math.max(1, Math.round(opts.indent) || 2)),
    lineWidth: opts.lineWidth > 0 ? Math.round(opts.lineWidth) : -1,
    sortKeys: opts.sortKeys,
    quotingType: opts.quoting === 'double' ? '"' : "'",
    forceQuotes: opts.quoting !== 'auto',
    flowLevel: opts.flow ? 0 : -1,
    // noRefs would expand every anchor into a duplicated copy, and
    // noCompatMode would unquote "yes"/"no"/"on"/"off" — which go-yaml,
    // PyYAML and Psych then read as booleans. Both defaults are left alone.
  };
}

/** A `#` that starts a comment, rather than one inside a quoted scalar. */
function commentStart(line: string): number {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return i;
  }
  return -1;
}

const BLOCK_SCALAR = /[|>][+-]?\d*\s*$/;

/**
 * The lines of a document that YAML reads as structure, with comments cut off.
 * Block scalars (`|` and `>`) are skipped whole: everything indented under them
 * is literal text, where a `#` is a hash and `1.10` is just characters.
 */
function structureLines(source: string): Array<{ code: string; comment: boolean }> {
  const out: Array<{ code: string; comment: boolean }> = [];
  let blockParent: number | null = null;

  for (const raw of source.split(/\r?\n/)) {
    const indent = raw.search(/\S/);
    if (blockParent !== null) {
      if (indent === -1 || indent > blockParent) continue;
      blockParent = null;
    }
    if (indent === -1) continue;
    const at = commentStart(raw);
    const code = at === -1 ? raw : raw.slice(0, at);
    out.push({ code, comment: at !== -1 });
    if (BLOCK_SCALAR.test(code)) blockParent = indent;
  }
  return out;
}

/** True when the source carries comments, which js-yaml cannot carry over. */
export function hasComments(source: string): boolean {
  return structureLines(source).some((line) => line.comment);
}

const NUMBER = /^[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][-+]?\d+)?$/;
const RADIX = /^[-+]?0[xXoObB][0-9a-fA-F_]+$/;

/** How js-yaml will spell this number back, or null when it leaves it alone. */
function respelled(token: string): string | null {
  if (!NUMBER.test(token) && !RADIX.test(token)) return null;
  const value = Number(token.replace(/_/g, ''));
  if (!Number.isFinite(value)) return null;
  const written = String(value);
  return written === token ? null : written;
}

/** The plain scalars on one structure line: `key: value`, `- value`, `[a, b]`. */
function scalarsOn(line: string): string[] {
  let text = line.trim();
  while (text.startsWith('- ')) text = text.slice(2).trim();
  const colon = text.search(/:(\s|$)/);
  if (colon !== -1) text = text.slice(colon + 1).trim();
  if (text === '' || /^["'&*!|>]/.test(text)) return [];
  if (/^[[{]/.test(text)) return text.split(/[[\]{},]/).map((part) => part.split(':').pop()?.trim() ?? '');
  return [text];
}

/**
 * The first number whose spelling changes when the document is written back.
 * js-yaml parses scalars into JS numbers and re-serialises those, so `1.10`,
 * `01234` and `+34600111222` all come out differently from how they went in.
 */
export function firstRespelledNumber(source: string): { source: string; written: string } | null {
  for (const { code } of structureLines(source)) {
    for (const token of scalarsOn(code)) {
      const written = respelled(token);
      if (written !== null) return { source: token, written };
    }
  }
  return null;
}

/** The warnings for things a js-yaml round trip cannot carry across. */
function roundTripWarnings(input: string, mode: YamlMode): string[] {
  const warnings: string[] = [];
  if (mode === 'format' && hasComments(input)) {
    warnings.push('Comments are not carried over — the reformatted document below has none.');
  }
  const number = firstRespelledNumber(input);
  if (number) {
    warnings.push(
      `Numbers are re-written in their shortest form, so ${number.source} becomes ${number.written}. Quote values such as version numbers, IDs and postcodes to keep them exactly as typed.`,
    );
  }
  return warnings;
}

function joinWarnings(warnings: string[]): string | undefined {
  return warnings.length > 0 ? warnings.join(' ') : undefined;
}

/** Sorts object keys on the way out, the JSON counterpart of dump's sortKeys. */
function sortingReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value;
}

/** Reformat YAML, or convert between YAML and JSON, in one pass. */
export function convertYaml(input: string, opts: YamlOptions): YamlResult {
  if (!input.trim()) return { output: '', documents: 0 };

  if (opts.mode === 'from-json') {
    let value: unknown;
    try {
      value = JSON.parse(input);
    } catch (err) {
      rethrowJson(err);
    }
    try {
      return { output: yaml.dump(value, dumpOptions(opts)).trimEnd(), documents: 1 };
    } catch (err) {
      rethrowYaml(err);
    }
  }

  let documents: unknown[];
  try {
    documents = yaml.loadAll(input, null, { schema: FORMATTING_SCHEMA });
  } catch (err) {
    rethrowYaml(err);
  }

  if (documents.length === 0) return { output: '', documents: 0 };

  const warnings = roundTripWarnings(input, opts.mode);

  if (opts.mode === 'to-json') {
    const indent = Math.min(10, Math.max(0, Math.round(opts.indent)));
    const value = documents.length === 1 ? documents[0] : documents;
    let output: string;
    try {
      output = JSON.stringify(value, opts.sortKeys ? sortingReplacer : undefined, indent) ?? 'null';
    } catch (err) {
      throw new Error(
        `This document cannot be written as JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (documents.length > 1) {
      warnings.unshift(`${documents.length} YAML documents were combined into a JSON array.`);
    }
    return { output, documents: documents.length, warning: joinWarnings(warnings) };
  }

  try {
    const parts = documents.map((doc) => yaml.dump(doc, dumpOptions(opts)).trimEnd());
    const output = parts.length === 1 ? parts[0] : parts.map((p) => `---\n${p}`).join('\n');
    return { output, documents: documents.length, warning: joinWarnings(warnings) };
  } catch (err) {
    rethrowYaml(err);
  }
}
