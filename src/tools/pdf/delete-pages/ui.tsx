// optional-dependency: Page thumbnails come from Poppler; without it the tool falls back to numbered cards and still works.
import clsx from 'clsx';
import { PDFDocument } from 'pdf-lib';
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
import { Badge, Button, Field, Icon, Input, Section, Spinner } from '@/components/ui';
import { allPages, formatPageList, keptPages, parsePageSet, togglePage } from './logic';

const TOOL_ID = 'pdf/delete-pages';
const TOOL_NAME = 'Delete Pages';
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

function PageThumb({ path, page, onUnavailable }: { path: string; page: number; onUnavailable: () => void }) {
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
        <img src={assetUrl(src)} alt={`Page ${page}`} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[15px] font-medium text-ink-faint">{page}</span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tool

export default function DeletePages() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], multiple: false, filterName: 'PDFs' });
  const { spec, update } = useOutputSpec({ suffix: '-trimmed' });
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const recentHistory = useSettings((s) => s.settings.recentHistory);

  const [pageCount, setPageCount] = useState(0);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [thumbsMissing, setThumbsMissing] = useState(false);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;
  const fileName = file?.name ?? '';

  const markThumbsMissing = useCallback(() => setThumbsMissing(true), []);

  useEffect(() => {
    setThumbsMissing(false);
    setRemoved([]);
    setText('');
    setTextError(null);
    if (!path) {
      setPageCount(0);
      setReadError(null);
      return;
    }
    let cancelled = false;
    setReading(true);
    setReadError(null);
    void (async () => {
      try {
        const doc = await loadPdf(path, fileName);
        if (!cancelled) setPageCount(doc.getPageCount());
      } catch (err) {
        if (cancelled) return;
        setPageCount(0);
        setReadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setReading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, fileName]);

  const apply = (pages: number[]) => {
    setRemoved(pages);
    setText(formatPageList(pages));
    setTextError(null);
  };

  const onTextChange = (value: string) => {
    setText(value);
    try {
      setRemoved(parsePageSet(value, pageCount));
      setTextError(null);
    } catch (err) {
      setTextError(err instanceof Error ? err.message : String(err));
    }
  };

  const kept = keptPages(pageCount, removed);
  const canRun = Boolean(file) && removed.length > 0 && kept.length > 0 && !busy && !reading;

  const runDelete = async () => {
    if (!file || removed.length === 0) return;
    setError(null);
    setResult(null);
    setBusy(true);
    markUsed(TOOL_ID);
    const started = Date.now();
    try {
      const src = await loadPdf(file.path, file.name);
      const count = src.getPageCount();
      const survivors = keptPages(count, removed);
      if (survivors.length === 0) {
        throw new Error('A PDF has to keep at least one page. Leave one page unselected and try again.');
      }
      if (survivors.length === count) {
        throw new Error('No pages were selected for removal, so there is nothing to do.');
      }
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, survivors.map((page) => page - 1));
      for (const page of copied) out.addPage(page);
      const bytes = await out.save();
      const saved = await savePdf(bytes, file.path, spec);
      const gone = count - survivors.length;
      const withSource: FileResult = {
        ...saved,
        sourceSize: file.size,
        note: `${gone} page${gone === 1 ? '' : 's'} removed`,
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
            hint="Mark the pages to remove — everything else is kept in its original order"
          />

          {file && (
            <Section
              title="Pages"
              description={
                readError ? undefined : `Keeping ${kept.length} of ${pageCount} · click a page to mark it for removal`
              }
              actions={
                reading ? (
                  <Spinner />
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => apply([])}>
                      Keep all
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => apply(allPages(pageCount).filter((p) => !removed.includes(p)))}
                    >
                      Invert
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => apply(allPages(pageCount).filter((p) => p % 2 === 0))}>
                      Even
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => apply(allPages(pageCount).filter((p) => p % 2 === 1))}>
                      Odd
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
                    {allPages(pageCount).map((page) => {
                      const gone = removed.includes(page);
                      return (
                        <button
                          key={page}
                          type="button"
                          onClick={() => apply(togglePage(removed, page))}
                          title={gone ? `Page ${page} — will be removed` : `Page ${page} — will be kept`}
                          className={clsx(
                            'relative flex flex-col overflow-hidden rounded-lg border bg-panel text-left transition-colors',
                            gone
                              ? 'border-danger opacity-45 ring-2 ring-danger/20'
                              : 'border-line hover:border-line-strong',
                          )}
                        >
                          <span className="flex h-28 items-center justify-center overflow-hidden bg-canvas">
                            <PageThumb path={file.path} page={page} onUnavailable={markThumbsMissing} />
                          </span>
                          {gone && (
                            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white">
                              <Icon name="X" size={12} />
                            </span>
                          )}
                          <span className="flex items-center justify-between gap-1 border-t border-line px-1.5 py-1">
                            <span
                              className={clsx(
                                'text-[11px] tabular-nums',
                                gone ? 'text-danger line-through' : 'text-ink-faint',
                              )}
                            >
                              {page}
                            </span>
                            {gone && <Badge tone="danger">Remove</Badge>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {thumbsMissing && (
                    <p className="mt-2 text-[11.5px] text-ink-faint">
                      Page previews need Poppler (brew install poppler). Page numbers work just as well.
                    </p>
                  )}
                </>
              )}
            </Section>
          )}

          {error && <ErrorDisplay error={error} onRetry={() => void runDelete()} />}
          {result && (
            <ResultPanel
              result={result}
              title="Pages removed"
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
          <Section title="Selection">
            <div className="space-y-3">
              <Field label="Pages to remove" hint="For example 2, 5-7 — everything else is kept." error={textError ?? undefined}>
                <Input
                  value={text}
                  placeholder="2, 5-7"
                  spellCheck={false}
                  disabled={!file || pageCount === 0}
                  onChange={(e) => onTextChange(e.target.value)}
                />
              </Field>
              <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[12px] text-ink-soft">
                {file ? (
                  <>
                    Keeping <span className="font-medium text-ink">{kept.length}</span> of {pageCount} page
                    {pageCount === 1 ? '' : 's'}
                    {removed.length > 0 && <> · removing {removed.length}</>} · {formatBytes(file.size)} source
                  </>
                ) : (
                  'Add a PDF to choose its pages.'
                )}
              </div>
              {file && pageCount > 0 && kept.length === 0 && (
                <p className="text-[11.5px] text-danger">
                  A PDF has to keep at least one page. Leave one unselected.
                </p>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <div className="space-y-2.5">
            <Button
              variant="primary"
              size="lg"
              icon="FileMinus2"
              loading={busy}
              disabled={!canRun}
              onClick={() => void runDelete()}
            >
              {removed.length > 0 ? `Remove ${removed.length} page${removed.length === 1 ? '' : 's'}` : 'Remove pages'}
            </Button>
            {!busy && !canRun && (
              <p className="text-[11.5px] text-ink-faint">
                {file ? 'Mark at least one page for removal.' : 'Add a PDF first.'}
              </p>
            )}
          </div>
        </>
      }
    />
  );
}
