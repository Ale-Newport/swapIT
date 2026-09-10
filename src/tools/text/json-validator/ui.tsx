import { useCallback, useRef } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { formatBytes } from '@/core/format';
import { Alert, Badge, EmptyState, Stat } from '@/components/ui';
import {
  analyzeJson,
  describeError,
  describeRelaxation,
  findDuplicateKeys,
  isRelaxed,
  stripJsonc,
  type DuplicateKey,
  type JsonError,
  type JsonStats,
} from './logic';

/** Beyond this the live re-check on every keystroke stops feeling instant. */
const MAX_CHARS = 5_000_000;

type Report =
  | { state: 'empty' }
  | { state: 'too-big'; chars: number }
  | { state: 'invalid'; error: JsonError }
  | {
      state: 'valid';
      stats: JsonStats;
      bytes: number;
      duplicates: DuplicateKey[];
      /** What had to be ignored to make it parse, e.g. "2 comments". */
      jsonc: string | null;
    };

const SAMPLE = `{
  "name": "Toolbox",
  "version": "0.1.0",
  "local": true,
  "limits": { "maxFiles": 500, "maxFiles": 1000 },
  "categories": ["images", "video", "pdf"]
}`;

type ParseAttempt = { ok: true; value: unknown } | { ok: false; message: string };

function tryParse(text: string): ParseAttempt {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * `scanned` is what actually parsed — the original for strict JSON, the blanked
 * text for JSONC. Its offsets and line breaks match the original either way.
 */
function validReport(input: string, scanned: string, value: unknown, jsonc: string | null): Report {
  let duplicates: DuplicateKey[] = [];
  try {
    duplicates = findDuplicateKeys(scanned);
  } catch {
    // The scanner is a bonus; a document that parses is still valid without it.
    duplicates = [];
  }
  return {
    state: 'valid',
    stats: analyzeJson(value),
    bytes: new TextEncoder().encode(input).byteLength,
    duplicates,
    jsonc,
  };
}

function buildReport(input: string): Report {
  if (!input.trim()) return { state: 'empty' };
  if (input.length > MAX_CHARS) return { state: 'too-big', chars: input.length };

  const strict = tryParse(input);
  if (strict.ok) return validReport(input, input, strict.value, null);

  // A .jsonc file carries comments and trailing commas by definition. Blank
  // them out and try again — the offsets are preserved, so a genuine error
  // further down still lands on the right line and column.
  const scan = stripJsonc(input);
  if (isRelaxed(scan)) {
    const relaxed = tryParse(scan.text);
    if (relaxed.ok) return validReport(input, scan.text, relaxed.value, describeRelaxation(scan));
    return { state: 'invalid', error: describeError(relaxed.message, input) };
  }
  return { state: 'invalid', error: describeError(strict.message, input) };
}

function reportToText(report: Report): string {
  if (report.state === 'empty') return '';
  if (report.state === 'too-big') {
    return `Not checked — ${report.chars.toLocaleString()} characters is too much to validate live.`;
  }
  if (report.state === 'invalid') {
    const { error } = report;
    return [
      'Invalid JSON',
      `${error.reason}`,
      `Line ${error.line}, column ${error.column}`,
      '',
      `${error.line} | ${error.lineText}`,
      `${' '.repeat(String(error.line).length)} | ${' '.repeat(Math.max(0, error.column - 1))}^`,
    ].join('\n');
  }
  const { stats, bytes, duplicates, jsonc } = report;
  const lines = [
    jsonc ? `Valid JSONC — ${jsonc} ignored, so this is not strict JSON` : 'Valid JSON',
    `Top-level type: ${stats.type}`,
    `Size: ${formatBytes(bytes)}`,
    `Nodes: ${stats.nodes.toLocaleString()}`,
    `Maximum depth: ${stats.depth}`,
    `Objects: ${stats.objects.toLocaleString()}`,
    `Arrays: ${stats.arrays.toLocaleString()}`,
    `Keys: ${stats.keys.toLocaleString()}`,
    `Strings: ${stats.strings.toLocaleString()}`,
    `Numbers: ${stats.numbers.toLocaleString()}`,
    `Booleans: ${stats.booleans.toLocaleString()}`,
    `Nulls: ${stats.nulls.toLocaleString()}`,
  ];
  if (duplicates.length > 0) {
    lines.push('', `Duplicate keys (${duplicates.length}):`);
    for (const d of duplicates) {
      lines.push(`  ${d.path} — "${d.key}" on line${d.lines.length === 1 ? '' : 's'} ${d.lines.join(', ')}`);
    }
  }
  return lines.join('\n');
}

function CodeFrame({ error, input }: { error: JsonError; input: string }) {
  const all = input.split('\n');
  const from = Math.max(1, error.line - 2);
  const to = Math.min(all.length, error.line + 2);
  const width = String(to).length;
  const rows: Array<{ key: string; gutter: string; text: string; caret: boolean }> = [];
  for (let n = from; n <= to; n++) {
    rows.push({ key: `l${n}`, gutter: String(n).padStart(width, ' '), text: all[n - 1] ?? '', caret: false });
    if (n === error.line) {
      rows.push({
        key: `c${n}`,
        gutter: ' '.repeat(width),
        text: `${' '.repeat(Math.max(0, error.column - 1))}^`,
        caret: true,
      });
    }
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[12px] leading-[1.6] selectable">
      {rows.map((row) => (
        <div key={row.key} className="flex gap-2 whitespace-pre">
          <span className="select-none text-ink-faint">{row.gutter} |</span>
          <span className={row.caret ? 'text-danger' : row.gutter.trim() === String(error.line) ? 'text-ink' : 'text-ink-soft'}>
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReportView({ report, input }: { report: Report; input: string }) {
  if (report.state === 'empty') {
    return (
      <EmptyState
        icon="Braces"
        title="Nothing to check yet"
        description="Paste JSON on the left, or drop a .json or .jsonc file onto it."
      />
    );
  }

  if (report.state === 'too-big') {
    return (
      <Alert tone="warn" title="This document is too large to check here">
        {report.chars.toLocaleString()} characters. Validate a smaller extract instead.
      </Alert>
    );
  }

  if (report.state === 'invalid') {
    const { error } = report;
    return (
      <div className="space-y-3">
        <Alert tone="danger" title="Not valid JSON">
          {error.reason} — line {error.line}, column {error.column}.
        </Alert>
        <CodeFrame error={error} input={input} />
      </div>
    );
  }

  const { stats, bytes, duplicates, jsonc } = report;
  return (
    <div className="space-y-3">
      <Alert tone="success" title={jsonc ? 'Valid JSONC' : 'Valid JSON'}>
        A {stats.type} of {stats.nodes.toLocaleString()} node{stats.nodes === 1 ? '' : 's'}, nested{' '}
        {stats.depth} level{stats.depth === 1 ? '' : 's'} deep.
      </Alert>

      {jsonc && (
        <Alert tone="warn" title={`${jsonc} ignored`}>
          Those are JSONC extensions, which .jsonc files may use but strict JSON parsers reject. The document
          underneath them is valid.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Top-level type" value={stats.type} />
        <Stat label="Size" value={formatBytes(bytes)} />
        <Stat label="Nodes" value={stats.nodes.toLocaleString()} />
        <Stat label="Max depth" value={stats.depth.toLocaleString()} />
        <Stat label="Objects" value={stats.objects.toLocaleString()} hint={`${stats.keys.toLocaleString()} keys`} />
        <Stat label="Arrays" value={stats.arrays.toLocaleString()} />
        <Stat label="Strings" value={stats.strings.toLocaleString()} />
        <Stat label="Numbers" value={stats.numbers.toLocaleString()} />
        <Stat
          label="Booleans / nulls"
          value={`${stats.booleans.toLocaleString()} / ${stats.nulls.toLocaleString()}`}
        />
      </div>

      {duplicates.length > 0 ? (
        <Alert
          tone="warn"
          title={`${duplicates.length} duplicate key${duplicates.length === 1 ? '' : 's'} — earlier values are lost`}
        >
          <ul className="mt-1 space-y-1">
            {duplicates.map((d) => (
              <li key={`${d.path}.${d.key}`} className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px]">
                <span className="text-ink-soft">{d.path}</span>
                <Badge tone="warn">&quot;{d.key}&quot;</Badge>
                <span className="text-ink-faint">
                  line{d.lines.length === 1 ? '' : 's'} {d.lines.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <p className="text-[11.5px] text-ink-faint">No duplicate keys — nothing was silently dropped by the parser.</p>
      )}
    </div>
  );
}

export default function JsonValidator() {
  // The report is built once per input and shared by the copyable text summary
  // and the rendered panel.
  const cache = useRef<{ key: string; value: Report } | null>(null);
  const reportFor = useCallback((input: string): Report => {
    if (cache.current?.key === input) return cache.current.value;
    const value = buildReport(input);
    cache.current = { key: input, value };
    return value;
  }, []);

  const transform = useCallback(
    (input: string): TextTransformResult => ({ output: reportToText(reportFor(input)) }),
    [reportFor],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="JSON"
      outputLabel="Report"
      saveExtension="txt"
      placeholder='{"hello": "world"}'
      sampleText={SAMPLE}
      minRows={16}
      renderOutput={(_output, input) => <ReportView report={reportFor(input)} input={input} />}
    />
  );
}
