// optional-dependency: Page thumbnails come from Poppler; without it the tool falls back to numbered cards and still works.
import clsx from 'clsx';
import { PDFDocument, degrees } from 'pdf-lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { asToolboxError, call, planOutput } from '@/core/bridge';
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
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Badge, Button, Icon, IconButton, Section, Spinner } from '@/components/ui';

const TOOL_ID = 'pdf/reorder';
const TOOL_NAME = 'Reorder Pages';
const THUMB_WIDTH = 200;

// ------------------------------------------------------------------ pdf work

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

// ------------------------------------------------------------------ thumbnails

const thumbCache = new Map<string, string>();
const withoutThumbs = new Set<string>();
let active = 0;
const waiting: Array<() => void> = [];

/** Poppler renders one page per process, so keep a few in flight, not hundreds. */
function acquire(): Promise<void> {
  if (active < 3) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  waiting.shift()?.();
}

function PageThumb({
  path,
  page,
  rotation,
  onUnavailable,
}: {
  path: string;
  page: number;
  rotation: number;
  onUnavailable: () => void;
}) {
  const key = `${path}|${page}`;
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(key) ?? null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = thumbCache.get(key);
    if (cached) {
      setSrc(cached);
      return;
    }
    setSrc(null);
    if (withoutThumbs.has(path)) {
      onUnavailable();
      return;
    }
    const element = holder.current;
    if (!element) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void (async () => {
          await acquire();
          try {
            if (cancelled || withoutThumbs.has(path)) return;
            const produced = await call<string>('pdf_page_preview', { input: path, page, width: THUMB_WIDTH });
            thumbCache.set(key, produced);
            if (!cancelled) setSrc(produced);
          } catch {
            // Page previews need Poppler; without it the numbered card is the preview.
            withoutThumbs.add(path);
            onUnavailable();
          } finally {
            release();
          }
        })();
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [key, path, page, onUnavailable]);

  return (
    <div ref={holder} className="flex h-full w-full items-center justify-center">
      {src ? (
        <img
          src={assetUrl(src)}
          alt={`Page ${page}`}
          style={{ transform: `rotate(${rotation}deg)` }}
          className="max-h-full max-w-full object-contain transition-transform duration-150"
        />
      ) : (
        <span
          style={{ transform: `rotate(${rotation}deg)` }}
          className="text-[15px] font-medium text-ink-faint transition-transform duration-150"
        >
          {page}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tool

export default function ReorderPages() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], multiple: false, filterName: 'PDFs' });
  const { spec, update } = useOutputSpec({ suffix: '-reordered' });
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const recentHistory = useSettings((s) => s.settings.recentHistory);

  const [pageCount, setPageCount] = useState(0);
  const [order, setOrder] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [thumbsMissing, setThumbsMissing] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;
  const fileName = file?.name ?? '';

  const markThumbsMissing = useCallback(() => setThumbsMissing(true), []);

  useEffect(() => {
    setThumbsMissing(false);
    setRotations({});
    if (!path) {
      setPageCount(0);
      setOrder([]);
      setReadError(null);
      return;
    }
    let cancelled = false;
    setReading(true);
    setReadError(null);
    void (async () => {
      try {
        const doc = await loadPdf(path, fileName);
        if (cancelled) return;
        const count = doc.getPageCount();
        setPageCount(count);
        setOrder(Array.from({ length: count }, (_, i) => i + 1));
      } catch (err) {
        if (cancelled) return;
        setPageCount(0);
        setOrder([]);
        setReadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setReading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, fileName]);

  const move = (from: number, to: number) => {
    setOrder((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
      const next = [...current];
      const [page] = next.splice(from, 1);
      next.splice(to, 0, page);
      return next;
    });
  };

  const rotate = (page: number) => {
    setRotations((current) => ({ ...current, [page]: ((current[page] ?? 0) + 90) % 360 }));
  };

  const reset = () => {
    setOrder(Array.from({ length: pageCount }, (_, i) => i + 1));
    setRotations({});
  };

  const rotatedCount = Object.values(rotations).filter((angle) => angle % 360 !== 0).length;
  const reordered = order.some((page, index) => page !== index + 1);
  const changed = reordered || rotatedCount > 0;
  const canRun = Boolean(file) && pageCount > 0 && changed && !busy && !reading;

  const runReorder = async () => {
    if (!file || order.length === 0) return;
    setError(null);
    setResult(null);
    setBusy(true);
    markUsed(TOOL_ID);
    const started = Date.now();
    try {
      const src = await loadPdf(file.path, file.name);
      const count = src.getPageCount();
      if (count !== pageCount) {
        throw new Error('This PDF changed on disk since it was opened. Add it again to reload the pages.');
      }
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, order.map((page) => page - 1));
      copied.forEach((page, index) => {
        const delta = rotations[order[index]] ?? 0;
        if (delta % 360 !== 0) {
          page.setRotation(degrees((((page.getRotation().angle + delta) % 360) + 360) % 360));
        }
        out.addPage(page);
      });
      const bytes = await out.save();
      const saved = await savePdf(bytes, file.path, spec);
      const notes = [reordered ? 'reordered' : null, rotatedCount ? `${rotatedCount} rotated` : null].filter(Boolean);
      const withSource: FileResult = {
        ...saved,
        sourceSize: file.size,
        note: notes.join(' · ') || undefined,
      };
      setResult({ results: [withSource], failures: [], cancelled: false, elapsedMs: Date.now() - started });
      if (recentHistory) {
        addHistory({
          toolId: TOOL_ID,
          toolName: TOOL_NAME,
          inputs: [file.name],
          outputDir: dirname(saved.path),
          outputCount: 1,
        });
      }
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a PDF here"
            hint="Drag the page cards to rearrange them, and rotate any page in place"
          />

          {file && (
            <Section
              title="Page order"
              description={readError ? undefined : `${pageCount} page${pageCount === 1 ? '' : 's'} · drag a card to move it`}
              actions={
                reading ? (
                  <Spinner />
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="ArrowDownUp"
                      onClick={() => setOrder((current) => [...current].reverse())}
                    >
                      Reverse
                    </Button>
                    <Button size="sm" variant="ghost" icon="RotateCcw" disabled={!changed} onClick={reset}>
                      Reset
                    </Button>
                  </>
                )
              }
            >
              {readError ? (
                <p className="text-[12.5px] text-danger">{readError}</p>
              ) : pageCount === 0 ? (
                <p className="text-[12.5px] text-ink-faint">Reading the document…</p>
              ) : (
                <>
                  <div className="grid max-h-[520px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {order.map((page, index) => (
                      <div
                        key={page}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(index));
                          e.dataTransfer.effectAllowed = 'move';
                          setDragIndex(index);
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setOverIndex(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setOverIndex(index);
                        }}
                        onDragLeave={() => setOverIndex((v) => (v === index ? null : v))}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = Number(e.dataTransfer.getData('text/plain'));
                          if (!Number.isNaN(from)) move(from, index);
                          setDragIndex(null);
                          setOverIndex(null);
                        }}
                        className={clsx(
                          'group flex cursor-grab flex-col overflow-hidden rounded-lg border bg-panel transition-colors active:cursor-grabbing',
                          dragIndex === index && 'opacity-40',
                          overIndex === index && dragIndex !== index
                            ? 'border-accent ring-2 ring-accent/25'
                            : 'border-line hover:border-line-strong',
                        )}
                      >
                        <span className="relative flex h-28 items-center justify-center overflow-hidden bg-canvas">
                          <PageThumb
                            path={file.path}
                            page={page}
                            rotation={rotations[page] ?? 0}
                            onUnavailable={markThumbsMissing}
                          />
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-panel/90 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <IconButton
                              icon="ChevronLeft"
                              label={`Move page ${page} earlier`}
                              size="sm"
                              disabled={index === 0}
                              onClick={() => move(index, index - 1)}
                            />
                            <IconButton
                              icon="RotateCw"
                              label={`Rotate page ${page} 90 degrees`}
                              size="sm"
                              onClick={() => rotate(page)}
                            />
                            <IconButton
                              icon="ChevronRight"
                              label={`Move page ${page} later`}
                              size="sm"
                              disabled={index === order.length - 1}
                              onClick={() => move(index, index + 1)}
                            />
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-1 border-t border-line px-1.5 py-1">
                          <span className="flex min-w-0 items-center gap-1">
                            <Icon name="GripVertical" size={12} className="shrink-0 text-ink-faint" />
                            <span
                              className="text-[11px] tabular-nums text-ink-faint"
                              title={`Page ${page} — now at position ${index + 1}`}
                            >
                              {page}
                            </span>
                          </span>
                          {(rotations[page] ?? 0) % 360 !== 0 && (
                            <Badge tone="accent" className="tabular-nums">
                              {rotations[page]}°
                            </Badge>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  {thumbsMissing && (
                    <p className="mt-2 text-[11.5px] text-ink-faint">
                      Page previews need Poppler (brew install poppler). The cards still carry their original page
                      numbers.
                    </p>
                  )}
                </>
              )}
            </Section>
          )}

          {error && <ErrorDisplay error={error} onRetry={() => void runReorder()} />}
          {result && (
            <ResultPanel
              result={result}
              title="Saved"
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
          <Section title="Changes">
            <div className="space-y-2.5">
              <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[12px] text-ink-soft">
                {file ? (
                  <>
                    {pageCount} page{pageCount === 1 ? '' : 's'} · {formatBytes(file.size)}
                    <br />
                    <span className={changed ? 'text-ink' : 'text-ink-faint'}>
                      {reordered ? 'Order changed' : 'Original order'}
                      {rotatedCount > 0 && ` · ${rotatedCount} page${rotatedCount === 1 ? '' : 's'} rotated`}
                    </span>
                  </>
                ) : (
                  'Add a PDF to rearrange its pages.'
                )}
              </div>
              <p className="text-[11.5px] text-ink-faint">
                The new order is written to a separate file — the original PDF is never modified.
              </p>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <div className="space-y-2.5">
            <Button
              variant="primary"
              size="lg"
              icon="ArrowDownUp"
              loading={busy}
              disabled={!canRun}
              onClick={() => void runReorder()}
            >
              Save new order
            </Button>
            {!busy && !canRun && (
              <p className="text-[11.5px] text-ink-faint">
                {file ? 'Move or rotate a page first.' : 'Add a PDF first.'}
              </p>
            )}
          </div>
        </>
      }
    />
  );
}
