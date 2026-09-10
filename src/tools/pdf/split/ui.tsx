import { exists } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { useEffect, useRef, useState } from 'react';
import { asToolboxError, ensureDir, planOutput } from '@/core/bridge';
import { dirname, formatBytes } from '@/core/format';
import { usePrefs } from '@/core/prefs';
import { readBytes, saveBytes } from '@/core/save';
import { useSettings } from '@/core/settings';
import type { BatchResult, FileResult, OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Badge, Button, Field, Icon, Input, NumberInput, Progress, Section, Segmented, Spinner } from '@/components/ui';
import { chunkRanges, parsePageRanges, rangeLabel, rangeSize, singlePageRanges, type PageRange } from './logic';

const TOOL_ID = 'pdf/split';
const TOOL_NAME = 'Split PDF';

type Mode = 'pages' | 'ranges' | 'chunks';

async function loadPdf(path: string, name: string): Promise<PDFDocument> {
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(path);
  } catch {
    throw new Error(`Could not read “${name}”. Check that the file is still where it was and that you can open it.`);
  }
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(message)) {
      throw new Error('This PDF is password protected. Unlock it with the Decrypt PDF tool first.');
    }
    throw new Error('This PDF could not be opened — it may be damaged or not a real PDF.');
  }
}

async function savePdf(bytes: Uint8Array, source: string, output: OutputSpec): Promise<FileResult> {
  const planned = await planOutput(source, output, 'pdf');
  if (planned.disposition === 'skipped') {
    return {
      path: planned.path,
      name: planned.name,
      size: 0,
      source,
      sourceSize: null,
      disposition: 'skipped',
      note: 'Kept the existing file',
    };
  }
  return saveBytes(bytes, { source, output, ext: 'pdf' });
}

/** A folder next to the source that does not clobber a previous split. */
async function uniqueFolder(parent: string, base: string): Promise<string> {
  let candidate = `${parent}/${base}`;
  try {
    for (let n = 2; n < 500 && (await exists(candidate)); n += 1) {
      candidate = `${parent}/${base}-${n}`;
    }
  } catch {
    /* exists() unavailable — ensureDir still creates the folder, and file
       collisions inside it are handled by the collision policy. */
  }
  await ensureDir(candidate);
  return candidate;
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

function describe(range: PageRange): string {
  return range.start === range.end ? `Page ${range.start}` : `Pages ${range.start}–${range.end}`;
}

export default function SplitPdf() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], multiple: false, filterName: 'PDFs' });
  const { spec, update } = useOutputSpec();
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const recentHistory = useSettings((s) => s.settings.recentHistory);

  const [mode, setMode] = useState<Mode>('pages');
  const [rangeText, setRangeText] = useState('1-3, 5');
  const [chunkSize, setChunkSize] = useState(2);

  const [pages, setPages] = useState(0);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const cancelRef = useRef(false);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;
  const fileName = file?.name ?? '';

  useEffect(() => {
    if (!path) {
      setPages(0);
      setReadError(null);
      return;
    }
    let cancelled = false;
    setReading(true);
    setReadError(null);
    setPages(0);
    void (async () => {
      try {
        const doc = await loadPdf(path, fileName);
        if (!cancelled) setPages(doc.getPageCount());
      } catch (err) {
        if (!cancelled) setReadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setReading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, fileName]);

  let outputs: PageRange[] = [];
  let rangeError: string | null = null;
  if (pages > 0) {
    if (mode === 'pages') {
      outputs = singlePageRanges(pages);
    } else if (mode === 'chunks') {
      outputs = chunkRanges(pages, chunkSize);
    } else {
      try {
        outputs = parsePageRanges(rangeText, pages);
      } catch (err) {
        rangeError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const folderName = file ? `${file.stem}-split` : '';
  const needsFolder = spec.mode === 'custom' && !spec.dir?.trim();
  const canRun = Boolean(file) && pages > 0 && outputs.length > 0 && !needsFolder && !busy && !reading;

  const runSplit = async () => {
    if (!file || outputs.length === 0) return;
    setError(null);
    setResult(null);
    cancelRef.current = false;
    setBusy(true);
    setDone(0);
    markUsed(TOOL_ID);
    const started = Date.now();
    const results: FileResult[] = [];
    try {
      // Same message the backend gives every other tool, rather than quietly
      // writing the parts somewhere the user did not choose.
      if (spec.mode === 'custom' && !spec.dir?.trim()) {
        throw new Error('Choose an output folder first.');
      }
      const parent = spec.mode === 'custom' && spec.dir ? spec.dir : dirname(file.path);
      const folder = await uniqueFolder(parent, folderName);
      const src = await loadPdf(file.path, file.name);
      for (const [index, range] of outputs.entries()) {
        if (cancelRef.current) break;
        setDone(index);
        setCurrent(describe(range));
        const out = await PDFDocument.create();
        const indices = Array.from({ length: rangeSize(range) }, (_, k) => range.start - 1 + k);
        const copied = await out.copyPages(src, indices);
        for (const page of copied) out.addPage(page);
        const bytes = await out.save();
        const saved = await savePdf(bytes, file.path, {
          mode: 'custom',
          dir: folder,
          suffix: null,
          collision: spec.collision,
          filename: `${file.stem}-${rangeLabel(range, pages)}`,
        });
        results.push({ ...saved, note: describe(range) });
        await yieldToUi();
      }
      setDone(results.length);
      setResult({
        results,
        failures: [],
        cancelled: cancelRef.current,
        elapsedMs: Date.now() - started,
      });
      if (recentHistory && results.length > 0) {
        addHistory({
          toolId: TOOL_ID,
          toolName: TOOL_NAME,
          inputs: [file.name],
          outputDir: folder,
          outputCount: results.length,
        });
      }
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setBusy(false);
      setCurrent(null);
    }
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a PDF here"
            hint="One document at a time — the parts are written into a new folder beside it"
          />

          {file && (
            <Section
              title="Document"
              description={`${file.name} · ${formatBytes(file.size)}`}
              actions={reading ? <Spinner /> : <Badge tone="accent">{pages} page{pages === 1 ? '' : 's'}</Badge>}
            >
              {readError ? (
                <p className="text-[12.5px] text-danger">{readError}</p>
              ) : outputs.length === 0 ? (
                <p className="text-[12.5px] text-ink-faint">
                  {reading ? 'Reading the document…' : rangeError ?? 'Choose how to split this document.'}
                </p>
              ) : (
                <>
                  <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
                    <Icon name="Folder" size={13} className="text-ink-faint" />
                    <span className="font-medium text-ink">{folderName}/</span>
                    <span className="text-ink-faint">
                      {outputs.length} file{outputs.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {outputs.slice(0, 10).map((range, index) => (
                      <li
                        key={`${index}:${range.start}-${range.end}`}
                        className="flex items-center gap-2.5 bg-panel px-3 py-1.5"
                      >
                        <Icon name="FileText" size={13} className="shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {file.stem}-{rangeLabel(range, pages)}.pdf
                        </span>
                        <span className="shrink-0 text-[11.5px] text-ink-faint">{describe(range)}</span>
                      </li>
                    ))}
                  </ul>
                  {outputs.length > 10 && (
                    <p className="mt-2 text-[11.5px] text-ink-faint">
                      …and {outputs.length - 10} more file{outputs.length - 10 === 1 ? '' : 's'}.
                    </p>
                  )}
                </>
              )}
            </Section>
          )}

          {error && <ErrorDisplay error={error} onRetry={() => void runSplit()} />}
          {result && (
            <ResultPanel
              result={result}
              title="Split"
              onProcessAgain={() => {
                setResult(null);
                setError(null);
              }}
            />
          )}
        </>
      }
      aside={
        <>
          <Section title="How to split">
            <div className="space-y-3">
              <Field label="Split by">
                <Segmented
                  value={mode}
                  onChange={setMode}
                  className="w-full"
                  options={[
                    { value: 'pages', label: 'Each page', title: 'One file per page' },
                    { value: 'ranges', label: 'Ranges', title: 'One file per page range' },
                    { value: 'chunks', label: 'Blocks', title: 'One file per N pages' },
                  ]}
                />
              </Field>

              {mode === 'ranges' && (
                <Field
                  label="Page ranges"
                  hint="Each range becomes its own file. 3- means “3 to the end”."
                  error={rangeError ?? undefined}
                >
                  <Input
                    value={rangeText}
                    placeholder="1-3, 5, 8-10"
                    onChange={(e) => setRangeText(e.target.value)}
                    spellCheck={false}
                  />
                </Field>
              )}

              {mode === 'chunks' && (
                <Field label="Pages per file" hint="The last file keeps whatever is left over.">
                  <NumberInput
                    value={chunkSize}
                    onValueChange={(v) => setChunkSize(Math.max(1, Math.round(v)))}
                    min={1}
                    max={Math.max(1, pages)}
                    suffix="pp"
                  />
                </Field>
              )}

              {mode === 'pages' && (
                <p className="text-[12px] text-ink-faint">
                  Every page is written as its own PDF, numbered so they stay in order.
                </p>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <div className="space-y-2.5">
              <OutputSettings spec={spec} onChange={update} showSuffix={false} />
              <p className="text-[11.5px] text-ink-faint">
                The parts go into a new <span className="text-ink-soft">{folderName || 'name-split'}</span> folder
                there, so nothing existing is touched.
              </p>
            </div>
          </Section>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {busy ? (
                <Button
                  variant="secondary"
                  size="lg"
                  icon="Square"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  Cancel
                </Button>
              ) : (
                <Button variant="primary" size="lg" icon="Split" disabled={!canRun} onClick={() => void runSplit()}>
                  {outputs.length > 0 ? `Split into ${outputs.length} files` : 'Split PDF'}
                </Button>
              )}
            </div>
            {busy && (
              <div className="space-y-1">
                <Progress value={outputs.length ? done / outputs.length : null} />
                <p className="truncate text-[11.5px] text-ink-faint">
                  {done} of {outputs.length} · {current ?? 'Working…'}
                </p>
              </div>
            )}
            {!busy && !canRun && (
              <p className="text-[11.5px] text-ink-faint">
                {!file
                  ? 'Add a PDF first.'
                  : (rangeError ??
                    readError ??
                    (needsFolder ? 'Choose an output folder first.' : 'Choose how to split this document.'))}
              </p>
            )}
          </div>
        </>
      }
    />
  );
}
