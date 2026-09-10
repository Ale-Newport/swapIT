import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { formatBytes } from '@/core/format';
import { saveTextAs } from '@/core/save';
import { useToolFiles } from '@/core/useToolFiles';
import { FileDropZone, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  Input,
  Section,
  Select,
  Spinner,
  Stat,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  DELIMITER_LABELS,
  compareCells,
  filterRows,
  parseTable,
  toDelimited,
  toJsonText,
  type ColumnType,
} from './logic';

/** Rows painted at once; sorting and exporting still see the whole file. */
const MAX_VISIBLE = 500;
/** Parsing happens on the UI thread, so very large files are refused. */
const MAX_CHARS = 20_000_000;

const DELIMITERS = [
  { value: '', label: 'Detect automatically' },
  { value: ',', label: 'Comma  ,' },
  { value: ';', label: 'Semicolon  ;' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe  |' },
];

const TYPE_TONE: Record<ColumnType, string> = {
  number: 'text-accent',
  date: 'text-accent',
  text: 'text-ink-faint',
};

export default function CsvViewer() {
  const files = useToolFiles({ extensions: ['csv', 'tsv'], filterName: 'CSV & TSV', multiple: false });
  const [text, setText] = useState('');
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [delimiter, setDelimiter] = useState('');
  const [header, setHeader] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: number; direction: 'asc' | 'desc' } | null>(null);

  const path = files.paths[0] ?? null;
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    readTextFile(path)
      .then((content) => {
        if (cancelled) return;
        setText(content);
        setShowPaste(false);
        setSort(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError('That file could not be read as text. It may be binary or use an unusual encoding.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const source = path ? text : pasted;
  const tooBig = source.length > MAX_CHARS;
  const sourceBytes = useMemo(() => new TextEncoder().encode(source).byteLength, [source]);

  const table = useMemo(
    () => (tooBig ? null : parseTable(source, { delimiter, header })),
    [source, delimiter, header, tooBig],
  );

  const filtered = useMemo(() => (table ? filterRows(table.rows, query) : []), [table, query]);

  const sorted = useMemo(() => {
    if (!table || !sort) return filtered;
    const type = table.types[sort.column] ?? 'text';
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort(
      (a, b) => factor * compareCells(a[sort.column] ?? '', b[sort.column] ?? '', type),
    );
  }, [table, filtered, sort]);

  const visible = sorted.slice(0, MAX_VISIBLE);
  const hasTable = Boolean(table && table.fields.length > 0 && table.rows.length > 0);

  const toggleSort = (column: number) => {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: 'asc' };
      if (current.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  };

  const exportAs = async (kind: 'csv' | 'tsv' | 'json') => {
    if (!table) return;
    const base = (path?.split('/').pop() ?? 'table').replace(/\.[^.]+$/, '');
    const content =
      kind === 'json'
        ? toJsonText(table.fields, sorted, header)
        : toDelimited(table.fields, sorted, kind === 'tsv' ? '\t' : ',', header);
    await saveTextAs(content, `${base}.${kind}`);
  };

  const clearAll = () => {
    files.clear();
    setText('');
    setPasted('');
    setQuery('');
    setSort(null);
    setLoadError(null);
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a CSV or TSV file here"
            hint="Comma, semicolon, tab or pipe separated — the delimiter is detected for you"
          />

          {!path && (
            <div className="space-y-1.5">
              {showPaste ? (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-medium text-ink-soft">Pasted rows</label>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="ClipboardPaste"
                      onClick={async () => {
                        try {
                          setPasted(await navigator.clipboard.readText());
                        } catch {
                          /* clipboard unavailable */
                        }
                      }}
                    >
                      Paste
                    </Button>
                  </div>
                  <Textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    rows={6}
                    placeholder={'name,age\nAda,36\nAlan,41'}
                  />
                </>
              ) : (
                <Button size="sm" variant="ghost" icon="ClipboardPaste" onClick={() => setShowPaste(true)}>
                  Or paste rows instead
                </Button>
              )}
            </div>
          )}

          {loadError && <Alert tone="danger">{loadError}</Alert>}
          {files.error && <Alert tone="warn">{files.error}</Alert>}

          {tooBig && (
            <Alert tone="warn" title="This file is too large to open here">
              {source.length.toLocaleString()} characters ({formatBytes(sourceBytes)}), over the{' '}
              {MAX_CHARS.toLocaleString()} character limit. Split it first, or work on an extract.
            </Alert>
          )}

          {table && table.errors.length > 0 && (
            <Alert tone="warn" title="The parser had trouble with some rows">
              <ul className="mt-0.5 list-disc pl-4">
                {table.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Section
            title="Table"
            description={
              hasTable
                ? `${table!.rows.length.toLocaleString()} rows × ${table!.fields.length.toLocaleString()} columns · ${
                    DELIMITER_LABELS[table!.delimiter] ?? 'custom'
                  } separated`
                : undefined
            }
            actions={
              hasTable ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter rows…"
                    className="h-7 w-44 text-[12px]"
                  />
                  {sort && (
                    <Button size="sm" variant="ghost" icon="X" onClick={() => setSort(null)}>
                      Clear sort
                    </Button>
                  )}
                </div>
              ) : undefined
            }
            dense
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-ink-faint">
                <Spinner /> Reading the file…
              </div>
            ) : !hasTable ? (
              <EmptyState
                icon="Table"
                title="No rows yet"
                description="Drop a CSV or TSV file above, or paste a few rows."
              />
            ) : sorted.length === 0 ? (
              <EmptyState
                icon="SearchX"
                title="No rows match this filter"
                description={`Nothing in the ${table!.rows.length.toLocaleString()} rows contains "${query.trim()}".`}
                action={
                  <Button size="sm" onClick={() => setQuery('')}>
                    Clear filter
                  </Button>
                }
              />
            ) : (
              <>
                <div className="max-h-[560px] overflow-auto rounded-lg border border-line">
                  <table className="w-full border-separate border-spacing-0 text-left text-[12.5px]">
                    <thead>
                      <tr>
                        <th className="sticky top-0 z-10 border-b border-r border-line bg-canvas px-2 py-1.5 text-right text-[11px] font-medium text-ink-faint">
                          #
                        </th>
                        {table!.fields.map((name, i) => (
                          <th
                            key={i}
                            className="sticky top-0 z-10 cursor-pointer border-b border-line bg-canvas px-2.5 py-1.5 align-top transition-colors hover:bg-ink/5"
                            onClick={() => toggleSort(i)}
                            title={`Sort by ${name}`}
                          >
                            <div className="flex items-center gap-1 whitespace-nowrap font-medium text-ink">
                              {name}
                              {sort?.column === i && (
                                <Icon name={sort.direction === 'asc' ? 'ArrowUp' : 'ArrowDown'} size={12} />
                              )}
                            </div>
                            <div className={clsx('text-[11px] font-normal', TYPE_TONE[table!.types[i] ?? 'text'])}>
                              {table!.types[i] ?? 'text'}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="selectable">
                      {visible.map((row, r) => (
                        <tr key={r} className="group">
                          <td className="border-b border-r border-line px-2 py-1 text-right text-[11px] text-ink-faint tabular-nums group-hover:bg-ink/4">
                            {r + 1}
                          </td>
                          {row.map((cell, c) => (
                            <td
                              key={c}
                              className={clsx(
                                'max-w-[320px] truncate border-b border-line px-2.5 py-1 text-ink group-hover:bg-ink/4',
                                table!.types[c] === 'number' && 'text-right tabular-nums',
                              )}
                              title={cell.length > 40 ? cell : undefined}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  {sorted.length > MAX_VISIBLE
                    ? `Showing ${MAX_VISIBLE.toLocaleString()} of ${sorted.length.toLocaleString()} rows. Exports include every row.`
                    : `Showing all ${sorted.length.toLocaleString()} rows.`}
                  {query.trim() && ` Filtered from ${table!.rows.length.toLocaleString()}.`}
                </p>
              </>
            )}
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Reading">
            <div className="space-y-3">
              <Field label="Separator" hint={table?.delimiter ? `Using ${DELIMITER_LABELS[table.delimiter] ?? 'a custom separator'}` : undefined}>
                <Select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} options={DELIMITERS} />
              </Field>
              <Field inline label="First row is a header" hint="Otherwise columns are numbered">
                <Switch checked={header} onCheckedChange={setHeader} />
              </Field>
            </div>
          </Section>

          {hasTable && (
            <Section title="Summary">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Rows" value={table!.rows.length.toLocaleString()} />
                <Stat label="Columns" value={table!.fields.length.toLocaleString()} />
                <Stat label="Text size" value={formatBytes(sourceBytes)} />
                <Stat
                  label="Shown"
                  value={Math.min(sorted.length, MAX_VISIBLE).toLocaleString()}
                  hint={query.trim() ? 'after filtering' : undefined}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {table!.types.map((type, i) => (
                  <Badge key={i} tone={type === 'text' ? 'neutral' : 'accent'}>
                    {table!.fields[i]}: {type}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          <Section title="Export" description="Filtered and sorted rows, in the order shown">
            <div className="flex flex-wrap gap-2">
              <Button icon="Download" disabled={!hasTable} onClick={() => void exportAs('csv')}>
                CSV
              </Button>
              <Button icon="Download" disabled={!hasTable} onClick={() => void exportAs('tsv')}>
                TSV
              </Button>
              <Button icon="Download" disabled={!hasTable} onClick={() => void exportAs('json')}>
                JSON
              </Button>
            </div>
            <Button className="mt-3" variant="ghost" icon="Trash2" full onClick={clearAll}>
              Clear
            </Button>
          </Section>
        </>
      }
    />
  );
}
