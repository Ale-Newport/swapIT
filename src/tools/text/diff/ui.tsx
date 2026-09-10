import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useDropTarget } from '@/core/dnd';
import { Alert, Badge, Button, Checkbox, CopyButton, EmptyState, Field, IconButton, Section, Segmented, Textarea } from '@/components/ui';
import {
  diffInline,
  diffTextLines,
  highlightPair,
  toUnifiedPatch,
  type DiffMode,
  type DiffRow,
  type InlineSegment,
  type NumberedLine,
} from './logic';

/** Past this the comparison stops being interactive, so we ask before trying. */
const MAX_CHARS = 400_000;
/** Rows actually painted; the summary still counts the whole diff. */
const MAX_ROWS = 1500;

interface UnifiedLine {
  kind: 'context' | 'del' | 'add';
  oldNum: number | null;
  newNum: number | null;
  text: string;
}

const SAMPLE_LEFT = `Toolbox release notes
- Convert HEIC photos to JPG
- Compress PDFs
- Extract audio from video
Built with Rust and React.`;

const SAMPLE_RIGHT = `Toolbox release notes
- Convert HEIC photos to JPG or WebP
- Compress PDFs
- Split and merge PDFs
- Extract audio from video
Built with Rust, React and Tailwind.`;

function InlineText({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'equal' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <span
            key={i}
            className={clsx(
              'rounded-[3px]',
              seg.type === 'add' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger',
            )}
          >
            {seg.value}
          </span>
        ),
      )}
    </>
  );
}

const CELL_TONE: Record<string, string> = {
  equal: '',
  add: 'bg-success-soft',
  remove: 'bg-danger-soft',
  empty: 'bg-canvas',
};

function SideCell({
  line,
  tone,
  segments,
}: {
  line: NumberedLine | null;
  tone: 'equal' | 'add' | 'remove' | 'empty';
  segments?: InlineSegment[] | null;
}) {
  return (
    <div className={clsx('flex min-w-0 gap-2 px-2 py-[1px]', CELL_TONE[tone])}>
      <span className="w-9 shrink-0 select-none text-right text-ink-faint">{line ? line.num : ''}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">
        {!line ? '\u00a0' : segments && line.text ? <InlineText segments={segments} /> : line.text || '\u00a0'}
      </span>
    </div>
  );
}

function TextPane({
  label,
  value,
  onChange,
  onFileError,
  placeholder,
  actions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFileError: (message: string | null) => void;
  placeholder: string;
  actions?: React.ReactNode;
}) {
  const { ref, isOver } = useDropTarget(
    (paths) => {
      const first = paths[0];
      if (!first) return;
      void (async () => {
        try {
          onChange(await readTextFile(first));
          onFileError(null);
        } catch {
          onFileError(`${first.split('/').pop()} could not be read as text.`);
        }
      })();
    },
    { priority: 6 },
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-medium text-ink-soft">{label}</label>
        <div className="flex items-center gap-1">
          {actions}
          <Button
            size="sm"
            variant="ghost"
            icon="ClipboardPaste"
            onClick={async () => {
              try {
                onChange(await navigator.clipboard.readText());
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            Paste
          </Button>
          <IconButton icon="X" label={`Clear ${label.toLowerCase()}`} size="sm" onClick={() => onChange('')} />
        </div>
      </div>
      <div ref={ref} className={isOver ? 'rounded-lg ring-2 ring-accent/40' : ''}>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isOver ? 'Release to load this file' : placeholder}
          rows={12}
          className="w-full"
        />
      </div>
      <p className="text-[11px] text-ink-faint">
        {value.split('\n').length.toLocaleString()} lines · {value.length.toLocaleString()} characters
      </p>
    </div>
  );
}

export default function TextDiff() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [mode, setMode] = useState<DiffMode>('line');
  const [view, setView] = useState<'split' | 'unified'>('split');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreBlankLines, setIgnoreBlankLines] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Files handed over by the Home quick actions fill the panes: one file on the
  // left, a second one on the right.
  const location = useLocation();
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const incoming = (location.state as { files?: string[] } | null)?.files;
    if (!incoming?.length) return;
    const key = incoming.join('|');
    if (consumed.current === key) return;
    consumed.current = key;
    void (async () => {
      try {
        setLeft(await readTextFile(incoming[0]));
        if (incoming[1]) setRight(await readTextFile(incoming[1]));
        setFileError(null);
      } catch {
        setFileError('Those files could not be read as text.');
      }
    })();
  }, [location.state]);

  const opts = useMemo(
    () => ({ ignoreCase, ignoreWhitespace, ignoreBlankLines }),
    [ignoreCase, ignoreWhitespace, ignoreBlankLines],
  );

  const tooBig = left.length + right.length > MAX_CHARS;
  const hasInput = left.length > 0 || right.length > 0;

  const lines = useMemo(
    () => (mode === 'line' && hasInput && !tooBig ? diffTextLines(left, right, opts) : null),
    [mode, hasInput, tooBig, left, right, opts],
  );

  const inline = useMemo(
    () => (mode !== 'line' && hasInput && !tooBig ? diffInline(left, right, mode, opts) : null),
    [mode, hasInput, tooBig, left, right, opts],
  );

  const painted = useMemo(() => {
    const rows: DiffRow[] = lines?.rows ?? [];
    const shown = rows.slice(0, MAX_ROWS);
    const marks = shown.map((row) =>
      row.type === 'replace' && row.left && row.right && row.left.text.length < 600 && row.right.text.length < 600
        ? highlightPair(row.left.text, row.right.text, { ignoreCase })
        : null,
    );
    // The unified view groups a run of changes into all removals then all
    // additions, exactly like the patch the Copy button produces.
    const unified: UnifiedLine[] = [];
    for (let i = 0; i < shown.length; i++) {
      const row = shown[i];
      if (row.type === 'equal') {
        unified.push({ kind: 'context', oldNum: row.left?.num ?? null, newNum: row.right?.num ?? null, text: row.left?.text ?? '' });
        continue;
      }
      let j = i;
      while (j < shown.length && shown[j].type !== 'equal') j++;
      const run = shown.slice(i, j);
      for (const r of run) if (r.left) unified.push({ kind: 'del', oldNum: r.left.num, newNum: null, text: r.left.text });
      for (const r of run) if (r.right) unified.push({ kind: 'add', oldNum: null, newNum: r.right.num, text: r.right.text });
      i = j - 1;
    }
    return { total: rows.length, shown, marks, unified };
  }, [lines, ignoreCase]);

  const patch = useMemo(() => (lines ? toUnifiedPatch(lines.rows) : ''), [lines]);
  const summary = lines?.summary ?? inline?.summary ?? null;
  const identical = summary !== null && summary.additions === 0 && summary.deletions === 0;
  const unit = mode === 'line' ? 'lines' : mode === 'word' ? 'words' : 'characters';

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-panel p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Compare by">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'line', label: 'Line' },
                { value: 'word', label: 'Word' },
                { value: 'char', label: 'Character' },
              ]}
            />
          </Field>
          {mode === 'line' && (
            <Field label="View">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'split', label: 'Side by side' },
                  { value: 'unified', label: 'Unified' },
                ]}
              />
            </Field>
          )}
          <Field label="Ignore">
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Checkbox checked={ignoreCase} onCheckedChange={setIgnoreCase} label="Case" />
              {mode !== 'char' && (
                <Checkbox checked={ignoreWhitespace} onCheckedChange={setIgnoreWhitespace} label="Whitespace" />
              )}
              {mode === 'line' && (
                <Checkbox checked={ignoreBlankLines} onCheckedChange={setIgnoreBlankLines} label="Blank lines" />
              )}
            </div>
          </Field>
        </div>
        {mode === 'line' && ignoreBlankLines && (
          <p className="mt-2 text-[11.5px] text-ink-faint">
            Blank lines are left out of the comparison, so they do not appear below.
          </p>
        )}
      </div>

      {fileError && <Alert tone="danger">{fileError}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <TextPane
          label="Original"
          value={left}
          onChange={setLeft}
          onFileError={setFileError}
          placeholder="Paste the original text, or drop a text file here…"
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLeft(SAMPLE_LEFT);
                setRight(SAMPLE_RIGHT);
              }}
            >
              Sample
            </Button>
          }
        />
        <TextPane
          label="Changed"
          value={right}
          onChange={setRight}
          onFileError={setFileError}
          placeholder="Paste the changed text, or drop a text file here…"
          actions={
            <Button
              size="sm"
              variant="ghost"
              icon="Repeat"
              onClick={() => {
                setLeft(right);
                setRight(left);
              }}
            >
              Swap
            </Button>
          }
        />
      </div>

      <Section
        title="Differences"
        actions={
          <>
            {summary && (
              <div className="flex items-center gap-1.5">
                <Badge tone="success">+{summary.additions.toLocaleString()}</Badge>
                <Badge tone="danger">−{summary.deletions.toLocaleString()}</Badge>
                <Badge>{summary.unchanged.toLocaleString()} unchanged</Badge>
              </div>
            )}
            {mode === 'line' && (
              <CopyButton value={() => patch} label="Copy patch" size="sm" disabled={!patch} />
            )}
          </>
        }
        description={summary ? `Counted in ${unit}` : undefined}
        dense
      >
        {tooBig ? (
          <Alert tone="warn" title="These texts are too large to compare here">
            Together they are {(left.length + right.length).toLocaleString()} characters. Compare a smaller
            portion, or split the files first.
          </Alert>
        ) : !hasInput ? (
          <EmptyState
            icon="GitCompare"
            title="Nothing to compare yet"
            description="Paste text into both panes, or drop a text file onto either one."
          />
        ) : identical ? (
          <Alert tone="success" title="The two texts are identical">
            {ignoreCase || ignoreWhitespace || ignoreBlankLines
              ? 'No differences remain once the ignored details are set aside.'
              : 'Every character matches.'}
          </Alert>
        ) : inline ? (
          <div className="max-h-[560px] overflow-auto rounded-lg border border-line bg-panel p-3 font-mono text-[12px] leading-[1.7] whitespace-pre-wrap break-words selectable">
            <InlineText segments={inline.segments} />
          </div>
        ) : view === 'split' ? (
          <div className="overflow-auto rounded-lg border border-line">
            <div className="min-w-[560px] font-mono text-[12px] leading-[1.6] selectable">
              <div className="grid grid-cols-2 border-b border-line bg-canvas text-[11px] font-sans font-medium text-ink-faint">
                <span className="border-r border-line px-3 py-1">Original</span>
                <span className="px-3 py-1">Changed</span>
              </div>
              <div className="max-h-[520px] overflow-auto">
                {painted.shown.map((row, i) => (
                  <div key={i} className="grid grid-cols-2">
                    <div className="border-r border-line">
                      <SideCell
                        line={row.left}
                        tone={row.left ? (row.type === 'equal' ? 'equal' : 'remove') : 'empty'}
                        segments={painted.marks[i]?.left}
                      />
                    </div>
                    <SideCell
                      line={row.right}
                      tone={row.right ? (row.type === 'equal' ? 'equal' : 'add') : 'empty'}
                      segments={painted.marks[i]?.right}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-lg border border-line font-mono text-[12px] leading-[1.6] selectable">
            {painted.unified.map((line, i) => (
              <div
                key={i}
                className={clsx(
                  'flex gap-2 px-2 py-[1px]',
                  line.kind === 'del' ? 'bg-danger-soft' : line.kind === 'add' ? 'bg-success-soft' : '',
                )}
              >
                <span className="w-9 shrink-0 select-none text-right text-ink-faint">{line.oldNum ?? ''}</span>
                <span className="w-9 shrink-0 select-none text-right text-ink-faint">{line.newNum ?? ''}</span>
                <span
                  className={clsx(
                    'min-w-0 flex-1 whitespace-pre-wrap break-words',
                    line.kind === 'del' ? 'text-danger' : line.kind === 'add' ? 'text-success' : 'text-ink',
                  )}
                >
                  {line.kind === 'del' ? '-' : line.kind === 'add' ? '+' : '\u00a0'}
                  {line.text || '\u00a0'}
                </span>
              </div>
            ))}
          </div>
        )}
        {painted.total > painted.shown.length && (
          <p className="mt-2 text-[11.5px] text-ink-faint">
            Showing the first {painted.shown.length.toLocaleString()} of {painted.total.toLocaleString()} rows. Copy
            the patch to get the whole diff.
          </p>
        )}
      </Section>
    </div>
  );
}
