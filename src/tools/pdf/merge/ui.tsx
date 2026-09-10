import clsx from 'clsx';
import { PDFDocument } from 'pdf-lib';
import { useEffect, useRef, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { useDropTarget } from '@/core/dnd';
import { dirname, formatBytes } from '@/core/format';
import { usePrefs } from '@/core/prefs';
import { readBytes, saveBytes } from '@/core/save';
import { useSettings } from '@/core/settings';
import type { BatchResult, FileFailure, FileResult, OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Badge, Button, Field, Icon, IconButton, Input, Progress, Section } from '@/components/ui';

const TOOL_ID = 'pdf/merge';
const TOOL_NAME = 'Merge PDFs';

/** Open a PDF with pdf-lib, turning its internal failures into readable sentences. */
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
      throw new Error(`“${name}” is password protected. Unlock it with the Decrypt PDF tool first.`);
    }
    throw new Error(`“${name}” could not be opened — it may be damaged or not a real PDF.`);
  }
}

/** Write bytes through the shared output policy, honouring a "skip" collision choice. */
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

type Count = { pages: number } | { error: string };

export default function MergePdfs() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDFs' });
  const { spec, update } = useOutputSpec();
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const recentHistory = useSettings((s) => s.settings.recentHistory);

  const [name, setName] = useState('merged');
  const [counts, setCounts] = useState<Record<string, Count>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const cancelRef = useRef(false);
  const countsRef = useRef(counts);
  countsRef.current = counts;

  const { ref: dropRef, isOver } = useDropTarget((paths) => void files.add(paths), { priority: 5 });

  // Page counts are read one file at a time so a large batch stays responsive.
  const pathsKey = files.paths.join('\n');
  useEffect(() => {
    const paths = pathsKey ? pathsKey.split('\n') : [];
    let cancelled = false;
    void (async () => {
      for (const path of paths) {
        if (cancelled) return;
        if (countsRef.current[path]) continue;
        let entry: Count;
        try {
          const doc = await loadPdf(path, path.split('/').pop() ?? path);
          entry = { pages: doc.getPageCount() };
        } catch (err) {
          entry = { error: err instanceof Error ? err.message : 'This file could not be read.' };
        }
        if (cancelled) return;
        setCounts((c) => ({ ...c, [path]: entry }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathsKey]);

  const readable = files.files.filter((f) => {
    const c = counts[f.path];
    return !c || 'pages' in c;
  });
  const totalPages = files.files.reduce((sum, f) => {
    const c = counts[f.path];
    return sum + (c && 'pages' in c ? c.pages : 0);
  }, 0);
  const locked = files.files.filter((f) => {
    const c = counts[f.path];
    return c && 'error' in c;
  });

  const canRun = files.files.length >= 2 && readable.length >= 1 && !busy;

  const runMerge = async () => {
    setError(null);
    setResult(null);
    cancelRef.current = false;
    setBusy(true);
    setDone(0);
    markUsed(TOOL_ID);
    const started = Date.now();
    const failures: FileFailure[] = [];
    try {
      const out = await PDFDocument.create();
      let copied = 0;
      for (const [index, file] of files.files.entries()) {
        if (cancelRef.current) break;
        setDone(index);
        setCurrent(file.name);
        try {
          const src = await loadPdf(file.path, file.name);
          const pages = await out.copyPages(src, src.getPageIndices());
          for (const page of pages) out.addPage(page);
          copied += pages.length;
        } catch (err) {
          failures.push({
            path: file.path,
            name: file.name,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (cancelRef.current) {
        setResult({ results: [], failures, cancelled: true, elapsedMs: Date.now() - started });
        return;
      }
      if (copied === 0) {
        throw new Error('None of the selected PDFs could be read, so there was nothing to merge.');
      }
      setDone(files.files.length);
      setCurrent('Writing the merged document…');
      const bytes = await out.save();
      const saved = await savePdf(bytes, files.paths[0], {
        ...spec,
        filename: name.trim() || 'merged',
      });
      const withSource: FileResult = { ...saved, sourceSize: files.totalSize };
      setResult({ results: [withSource], failures, cancelled: false, elapsedMs: Date.now() - started });
      if (recentHistory) {
        addHistory({
          toolId: TOOL_ID,
          toolName: TOOL_NAME,
          inputs: files.files.map((f) => f.name).slice(0, 20),
          outputDir: dirname(saved.path),
          outputCount: 1,
        });
      }
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setBusy(false);
      setCurrent(null);
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= files.files.length) return;
    files.reorder(from, to);
  };

  return (
    <ToolShell
      main={
        <>
          {files.isEmpty ? (
            <FileDropZone
              files={files}
              label="Drop PDFs here"
              hint="Add two or more — they are combined in the order you arrange them"
              accept="Folders are expanded automatically"
              allowFolders
            />
          ) : (
            <div>
              <div
                ref={dropRef}
                className={clsx(
                  'rounded-card border bg-panel transition-colors',
                  isOver ? 'border-accent ring-2 ring-accent/15' : 'border-line',
                )}
              >
                <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[12.5px] font-medium text-ink">
                      {files.files.length} PDF{files.files.length === 1 ? '' : 's'}
                    </span>
                    <Badge tone="accent">{totalPages} page{totalPages === 1 ? '' : 's'}</Badge>
                    <Badge>{formatBytes(files.totalSize)}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" icon="Plus" onClick={() => void files.browse()}>
                      Add
                    </Button>
                    <IconButton icon="Trash2" label="Remove all files" size="sm" onClick={files.clear} />
                  </div>
                </header>
                <ul className="max-h-80 overflow-y-auto py-1">
                  {files.files.map((file, index) => {
                    const count = counts[file.path];
                    return (
                      <li
                        key={file.path}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(index));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(index);
                        }}
                        onDragLeave={() => setDragOver((v) => (v === index ? null : v))}
                        onDragEnd={() => setDragOver(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(null);
                          const from = Number(e.dataTransfer.getData('text/plain'));
                          if (!Number.isNaN(from)) files.reorder(from, index);
                        }}
                        className={clsx(
                          'group flex items-center gap-2.5 px-3 py-1.5 hover:bg-canvas',
                          dragOver === index && 'bg-accent-soft',
                        )}
                      >
                        <Icon name="GripVertical" size={13} className="shrink-0 cursor-grab text-ink-faint" />
                        <span className="w-4 shrink-0 text-right text-[11.5px] tabular-nums text-ink-faint">
                          {index + 1}
                        </span>
                        <Icon name="FileText" size={14} className="shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={file.path}>
                          {file.name}
                        </span>
                        {count && 'error' in count ? (
                          <Badge tone="danger" className="shrink-0">
                            Unreadable
                          </Badge>
                        ) : (
                          <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">
                            {count ? `${count.pages} pp` : '…'}
                          </span>
                        )}
                        <span className="hidden shrink-0 text-[11.5px] text-ink-faint sm:inline">
                          {formatBytes(file.size)}
                        </span>
                        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton
                            icon="ChevronUp"
                            label={`Move ${file.name} up`}
                            size="sm"
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                          />
                          <IconButton
                            icon="ChevronDown"
                            label={`Move ${file.name} down`}
                            size="sm"
                            disabled={index === files.files.length - 1}
                            onClick={() => move(index, index + 1)}
                          />
                          <IconButton
                            icon="X"
                            label={`Remove ${file.name}`}
                            size="sm"
                            onClick={() => files.remove(file.path)}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {files.error && (
                <p className="mt-2 text-[11.5px] text-warn">{files.error}</p>
              )}
              {locked.length > 0 && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  {locked.length} file{locked.length === 1 ? '' : 's'} cannot be read and will be skipped:{' '}
                  {locked.map((f) => f.name).join(', ')}
                </p>
              )}
            </div>
          )}
          {error && <ErrorDisplay error={error} onRetry={() => void runMerge()} />}
          {result && (
            <ResultPanel
              result={result}
              title="Merged"
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
          <Section title="Merged document">
            <div className="space-y-3">
              <Field label="File name" hint="The .pdf extension is added for you.">
                <Input value={name} placeholder="merged" onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[12px] text-ink-soft">
                {files.isEmpty ? (
                  'Add PDFs to see what the result will contain.'
                ) : (
                  <>
                    {files.files.length} document{files.files.length === 1 ? '' : 's'} ·{' '}
                    <span className="font-medium text-ink">{totalPages}</span> page
                    {totalPages === 1 ? '' : 's'} in the merged file
                  </>
                )}
              </div>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} />
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
                <Button variant="primary" size="lg" icon="Combine" disabled={!canRun} onClick={() => void runMerge()}>
                  Merge {files.files.length > 1 ? `${files.files.length} PDFs` : 'PDFs'}
                </Button>
              )}
            </div>
            {busy && (
              <div className="space-y-1">
                <Progress value={files.files.length ? done / files.files.length : null} />
                <p className="truncate text-[11.5px] text-ink-faint">
                  {done} of {files.files.length} · {current ?? 'Working…'}
                </p>
              </div>
            )}
            {!busy && !canRun && (
              <p className="text-[11.5px] text-ink-faint">Add at least two PDFs to merge.</p>
            )}
          </div>
        </>
      }
    />
  );
}
