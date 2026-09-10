// optional-dependency: The preview comes from Poppler; rotation itself is pure pdf-lib and works without it.
import { PDFDocument, degrees } from 'pdf-lib';
import { useEffect, useRef, useState } from 'react';
import { asToolboxError, call, planOutput } from '@/core/bridge';
import { dirname } from '@/core/format';
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
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Button, Field, Input, Progress, Section, Segmented } from '@/components/ui';
import { normaliseRotation, pagesForCount, parseOpenRanges, type OpenRange } from './logic';

const TOOL_ID = 'pdf/rotate';
const TOOL_NAME = 'Rotate PDF Pages';

type Scope = 'all' | 'range';

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

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/** First page of the first file, turned by the chosen angle. Poppler-optional. */
function RotationPreview({ path, angle }: { path: string; angle: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    void (async () => {
      try {
        const produced = await call<string>('pdf_page_preview', { input: path, page: 1, width: 320 });
        if (!cancelled) setSrc(produced);
      } catch {
        // Previews need Poppler. Without it the tool works exactly the same.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!src) return null;
  return (
    <Section title="Preview" description="Page 1 of the first document, at the chosen angle">
      <div className="flex h-64 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
        <img
          src={assetUrl(src)}
          alt="First page preview"
          style={{ transform: `rotate(${angle}deg)`, maxHeight: '15rem', maxWidth: '15rem' }}
          className="object-contain transition-transform duration-200"
        />
      </div>
    </Section>
  );
}

export default function RotatePdfPages() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDFs' });
  const { spec, update } = useOutputSpec({ suffix: '-rotated' });
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const recentHistory = useSettings((s) => s.settings.recentHistory);

  const [angle, setAngle] = useState<'90' | '180' | '270'>('90');
  const [scope, setScope] = useState<Scope>('all');
  const [rangeText, setRangeText] = useState('');

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const cancelRef = useRef(false);

  let ranges: OpenRange[] = [];
  let rangeError: string | null = null;
  try {
    ranges = parseOpenRanges(rangeText);
  } catch (err) {
    rangeError = err instanceof Error ? err.message : String(err);
  }

  const delta = Number(angle);
  const scopeReady = scope === 'all' || (ranges.length > 0 && !rangeError);
  const canRun = !files.isEmpty && scopeReady && !busy;

  const runRotate = async () => {
    if (files.isEmpty) return;
    setError(null);
    setResult(null);
    cancelRef.current = false;
    setBusy(true);
    setDone(0);
    markUsed(TOOL_ID);
    const started = Date.now();
    const results: FileResult[] = [];
    const failures: FileFailure[] = [];
    try {
      for (const [index, file] of files.files.entries()) {
        if (cancelRef.current) break;
        setDone(index);
        setCurrent(file.name);
        try {
          const doc = await loadPdf(file.path, file.name);
          const pageCount = doc.getPageCount();
          const targets =
            scope === 'all'
              ? Array.from({ length: pageCount }, (_, i) => i + 1)
              : pagesForCount(ranges, pageCount);
          if (targets.length === 0) {
            throw new Error(
              `None of those pages exist in this file — it has ${pageCount} page${pageCount === 1 ? '' : 's'}.`,
            );
          }
          for (const pageNumber of targets) {
            const page = doc.getPage(pageNumber - 1);
            page.setRotation(degrees(normaliseRotation(page.getRotation().angle, delta)));
          }
          const bytes = await doc.save();
          const saved = await savePdf(bytes, file.path, spec);
          results.push({
            ...saved,
            sourceSize: file.size,
            note:
              targets.length === pageCount
                ? `All ${pageCount} page${pageCount === 1 ? '' : 's'}`
                : `${targets.length} of ${pageCount} pages`,
          });
        } catch (err) {
          failures.push({
            path: file.path,
            name: file.name,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        await yieldToUi();
      }
      setDone(results.length + failures.length);
      setResult({ results, failures, cancelled: cancelRef.current, elapsedMs: Date.now() - started });
      if (recentHistory && results.length > 0) {
        addHistory({
          toolId: TOOL_ID,
          toolName: TOOL_NAME,
          inputs: files.files.map((f) => f.name).slice(0, 20),
          outputDir: dirname(results[0].path),
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
            label="Drop PDFs here"
            hint="Every file is turned by the same angle — batches welcome"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {!files.isEmpty && <RotationPreview path={files.paths[0]} angle={delta} />}

          {error && <ErrorDisplay error={error} onRetry={() => void runRotate()} />}
          {result && (
            <ResultPanel
              result={result}
              title="Rotated"
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
          <Section title="Rotation">
            <div className="space-y-3">
              <Field label="Turn by">
                <Segmented
                  value={angle}
                  onChange={setAngle}
                  className="w-full"
                  options={[
                    { value: '90', label: '90° right', title: 'A quarter turn clockwise' },
                    { value: '180', label: '180°', title: 'Upside down' },
                    { value: '270', label: '90° left', title: 'A quarter turn anticlockwise' },
                  ]}
                />
              </Field>

              <Field label="Apply to">
                <Segmented
                  value={scope}
                  onChange={setScope}
                  className="w-full"
                  options={[
                    { value: 'all', label: 'All pages' },
                    { value: 'range', label: 'Some pages' },
                  ]}
                />
              </Field>

              {scope === 'range' && (
                <Field
                  label="Pages"
                  hint="Applied to every file. Pages a file does not have are ignored."
                  error={rangeError ?? undefined}
                >
                  <Input
                    value={rangeText}
                    placeholder="1-3, 5, 8-"
                    spellCheck={false}
                    onChange={(e) => setRangeText(e.target.value)}
                  />
                </Field>
              )}

              <p className="text-[12px] text-ink-faint">
                Rotation is stored as page metadata, so nothing is re-encoded and the text stays selectable.
              </p>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
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
                <Button variant="primary" size="lg" icon="RotateCw" disabled={!canRun} onClick={() => void runRotate()}>
                  Rotate {files.files.length > 1 ? `${files.files.length} PDFs` : 'PDF'}
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
              <p className="text-[11.5px] text-ink-faint">
                {files.isEmpty ? 'Add at least one PDF first.' : rangeError ?? 'Enter the pages to rotate.'}
              </p>
            )}
          </div>
        </>
      }
    />
  );
}
