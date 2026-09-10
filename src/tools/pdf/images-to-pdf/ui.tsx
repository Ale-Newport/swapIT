import { PDFDocument, clip, closePath, endPath, lineTo, moveTo, popGraphicsState, pushGraphicsState } from 'pdf-lib';
import { useMemo, useRef, useState } from 'react';
import { appPaths, asToolboxError, call, cancelJob, ensureDir, planOutput } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { readBytes, saveBytes } from '@/core/save';
import { newJobId } from '@/core/tasks';
import type {
  BatchResult,
  FileFailure,
  FileInfo,
  FileResult,
  OutputSpec,
  ToolboxError,
} from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import type { ToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OptionsGrid,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Field, Icon, IconButton, Input, NumberInput, Section, Segmented, Select } from '@/components/ui';
import {
  defaultPdfName,
  isEmbeddable,
  isPng,
  layoutImage,
  pathVariants,
  type FitMode,
  type Orientation,
  type PageSizeId,
} from './logic';

const PAGE_SIZE_OPTIONS = [
  { value: 'fit', label: 'Fit to image' },
  { value: 'a4', label: 'A4 — 210 × 297 mm' },
  { value: 'letter', label: 'Letter — 8.5 × 11 in' },
  { value: 'legal', label: 'Legal — 8.5 × 14 in' },
  { value: 'a3', label: 'A3 — 297 × 420 mm' },
];

/**
 * Write bytes through the shared output policy, honouring a "skip" collision
 * choice: `saveBytes` writes whatever path the backend planned, so a skipped
 * destination has to be caught here before the existing file is clobbered.
 */
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

/**
 * This tool builds its PDF in the frontend with pdf-lib, so there is no backend
 * command for `useToolRun` to drive. This adapter keeps the standard action row
 * — same button, same progress, same ⌘⇧C shortcut — backed by local state, and
 * gives Cancel a real effect: it raises the `cancelled` flag the loop checks and
 * stops the backend conversion job whose id sits in `jobId`.
 */
function useLocalRun() {
  const [progress, setProgress] = useState({ running: false, done: 0, total: 0, currentFile: null as string | null });
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const cancelled = useRef(false);
  const jobId = useRef<string | null>(null);

  const run: ToolRun = {
    running: progress.running,
    progress: progress.total > 0 ? progress.done / progress.total : null,
    done: progress.done,
    total: progress.total,
    currentFile: progress.currentFile,
    result,
    raw: null,
    error,
    taskId: null,
    // Nothing calls these: the work happens in `execute` below, not in a job.
    execute: async () => null,
    executeRaw: async () => null,
    cancel: () => {
      cancelled.current = true;
      // The JPEG conversion runs in the backend, so it has to be told as well.
      if (jobId.current) void cancelJob(jobId.current).catch(() => false);
    },
    reset: () => {
      setResult(null);
      setError(null);
    },
  };

  return { run, setProgress, setResult, setError, cancelled, jobId };
}

function Thumb({ path, name }: { path: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-canvas">
        <Icon name="Image" size={18} className="text-ink-faint" />
      </div>
    );
  }
  return (
    <img
      src={assetUrl(path)}
      alt={name}
      onError={() => setFailed(true)}
      className="h-full w-full object-contain"
    />
  );
}

function PageOrder({
  files,
  onMove,
  onRemove,
}: {
  files: FileInfo[];
  onMove: (from: number, to: number) => void;
  onRemove: (path: string) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {files.map((file, index) => (
        <li
          key={file.path}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', String(index));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData('text/plain'));
            if (!Number.isNaN(from)) onMove(from, index);
          }}
          className="group relative overflow-hidden rounded-lg border border-line bg-panel"
        >
          <div className="checkerboard h-24">
            <Thumb path={file.path} name={file.name} />
          </div>
          <div className="flex items-center gap-1.5 border-t border-line px-2 py-1.5">
            <Badge>{index + 1}</Badge>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink" title={file.path}>
              {file.name}
            </span>
          </div>
          <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <IconButton
              icon="ArrowLeft"
              label={`Move ${file.name} earlier`}
              size="sm"
              variant="secondary"
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
            />
            <IconButton
              icon="ArrowRight"
              label={`Move ${file.name} later`}
              size="sm"
              variant="secondary"
              disabled={index === files.length - 1}
              onClick={() => onMove(index, index + 1)}
            />
            <IconButton
              icon="X"
              label={`Remove ${file.name}`}
              size="sm"
              variant="secondary"
              onClick={() => onRemove(file.path)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ImagesToPdf() {
  const files = useToolFiles({ kinds: ['image'], filterName: 'Images' });
  const { run, setProgress, setResult, setError, cancelled, jobId } = useLocalRun();
  const { spec, update } = useOutputSpec();

  const [pageSize, setPageSize] = useState<PageSizeId>('fit');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [margin, setMargin] = useState(0);
  const [fit, setFit] = useState<FitMode>('contain');
  const [filename, setFilename] = useState('');

  const suggestedName = useMemo(
    () => defaultPdfName(files.files[0]?.stem, files.files.length),
    [files.files],
  );
  const needsConverting = useMemo(
    () => files.files.filter((f) => !isEmbeddable(f.extension)),
    [files.files],
  );

  /**
   * pdf-lib embeds JPEG and PNG only. Anything else goes through the image
   * pipeline first, into the app's temp folder, and the JPEGs it writes are what
   * gets embedded.
   */
  const convertUnsupported = async (): Promise<{ map: Map<string, string>; failures: FileFailure[] }> => {
    const map = new Map<string, string>();
    const failures: FileFailure[] = [];
    if (needsConverting.length === 0) return { map, failures };

    const paths = await appPaths();
    const dir = `${paths.temp}/toolbox-images-to-pdf-${Date.now().toString(36)}`;
    await ensureDir(dir);

    // The id is kept in a ref so Cancel can stop this job while it runs — for a
    // big HEIC batch this phase is by far the longest part of the run.
    const id = newJobId();
    jobId.current = id;
    let batch: BatchResult;
    try {
      batch = await call<BatchResult>('process_images', {
        jobId: id,
        inputs: needsConverting.map((f) => f.path),
        ops: { format: 'jpg', quality: 92 },
        output: { mode: 'custom', dir, suffix: null, collision: 'rename', filename: null },
      });
    } finally {
      jobId.current = null;
    }

    // A job stopped from anywhere (Cancel here, the task centre, quitting) comes
    // back flagged rather than thrown, so the run has to stop with it.
    if (batch.cancelled) cancelled.current = true;

    for (const r of batch.results) {
      if (!r.source) continue;
      for (const variant of pathVariants(r.source)) map.set(variant, r.path);
    }
    for (const f of batch.failures) {
      failures.push({
        path: f.path,
        name: f.name,
        message: `${f.message} It could not be converted to JPEG, so it was left out of the PDF.`,
        details: f.details ?? null,
      });
    }
    return { map, failures };
  };

  const execute = async () => {
    if (files.isEmpty) return;
    cancelled.current = false;
    setError(null);
    setResult(null);
    setProgress({ running: true, done: 0, total: files.files.length, currentFile: null });
    const started = Date.now();
    const failures: FileFailure[] = [];

    try {
      const converted = await convertUnsupported();
      failures.push(...converted.failures);
      if (cancelled.current) {
        setResult({ results: [], failures, cancelled: true, elapsedMs: Date.now() - started });
        return;
      }

      const pdfDoc = await PDFDocument.create();
      pdfDoc.setProducer('Toolbox');
      pdfDoc.setCreator('Toolbox');

      let embedded = 0;
      for (const [index, file] of files.files.entries()) {
        if (cancelled.current) break;
        setProgress({ running: true, done: index, total: files.files.length, currentFile: file.name });

        const source = converted.map.get(file.path) ?? (isEmbeddable(file.extension) ? file.path : null);
        if (!source) continue; // already recorded as a conversion failure

        try {
          const bytes = await readBytes(source);
          const image = isPng(source) ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
          const layout = layoutImage(image.width, image.height, { pageSize, orientation, margin, fit });
          const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);
          if (layout.clip) {
            // Keep a `cover` image inside the margins instead of bleeding to the page edge.
            const { x, y, width, height } = layout.box;
            page.pushOperators(
              pushGraphicsState(),
              moveTo(x, y),
              lineTo(x + width, y),
              lineTo(x + width, y + height),
              lineTo(x, y + height),
              closePath(),
              clip(),
              endPath(),
            );
          }
          page.drawImage(image, { x: layout.x, y: layout.y, width: layout.width, height: layout.height });
          if (layout.clip) page.pushOperators(popGraphicsState());
          embedded += 1;
        } catch (err) {
          failures.push({
            path: file.path,
            name: file.name,
            message: `“${file.name}” could not be added — it is not a readable ${isPng(source) ? 'PNG' : 'JPEG'} image.`,
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const stopped = cancelled.current;
      setProgress({ running: true, done: files.files.length, total: files.files.length, currentFile: null });

      if (embedded === 0) {
        if (stopped) {
          setResult({ results: [], failures, cancelled: true, elapsedMs: Date.now() - started });
          return;
        }
        throw new Error(
          'None of these images could be added to a PDF. Check that they are real image files and try again.',
        );
      }

      const bytes = await pdfDoc.save();
      const saved = await savePdf(bytes, files.paths[0], {
        ...spec,
        filename: filename.trim() || suggestedName,
        suffix: null,
      });
      const result: FileResult =
        saved.disposition === 'skipped'
          ? saved
          : { ...saved, sourceSize: files.totalSize, note: `${embedded} page${embedded === 1 ? '' : 's'}` };
      setResult({ results: [result], failures, cancelled: stopped, elapsedMs: Date.now() - started });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setProgress({ running: false, done: 0, total: 0, currentFile: null });
    }
  };

  return (
    <ToolShell
      main={
        <>
          {files.isEmpty ? (
            <FileDropZone
              files={files}
              label="Drop images here"
              hint="JPG and PNG go straight in; HEIC, WebP and TIFF are converted to JPEG first"
              accept="Folders are expanded automatically"
              allowFolders
            />
          ) : (
            <Section
              title="Page order"
              description="Drag a thumbnail, or use the arrows, to reorder the pages"
              actions={
                <>
                  <IconButton icon="Plus" label="Add more images" size="sm" onClick={() => void files.browse()} />
                  <IconButton icon="Trash2" label="Remove all images" size="sm" onClick={files.clear} />
                </>
              }
            >
              <PageOrder files={files.files} onMove={files.reorder} onRemove={files.remove} />
              <p className="mt-3 text-[11.5px] text-ink-faint">
                {files.files.length} image{files.files.length === 1 ? '' : 's'} · {formatBytes(files.totalSize)}
              </p>
              {files.error && (
                <Alert tone="warn" className="mt-2">
                  {files.error}
                </Alert>
              )}
            </Section>
          )}

          {needsConverting.length > 0 && (
            <Alert tone="info" title={`${needsConverting.length} image${needsConverting.length === 1 ? '' : 's'} will be converted to JPEG first`}>
              PDFs can only carry JPEG and PNG images, so {needsConverting.length === 1 ? 'this one' : 'these'} are
              converted at 92% quality before being placed on the page. Your originals are not touched.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="PDF created" />}
        </>
      }
      aside={
        <>
          <Section title="Page setup">
            <div className="space-y-3">
              <Field label="Page size">
                <Select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as PageSizeId)}
                  options={PAGE_SIZE_OPTIONS}
                />
              </Field>
              {pageSize !== 'fit' && (
                <>
                  <Field label="Orientation">
                    <Segmented
                      value={orientation}
                      onChange={setOrientation}
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'portrait', label: 'Portrait' },
                        { value: 'landscape', label: 'Landscape' },
                      ]}
                      className="w-full"
                      size="sm"
                    />
                  </Field>
                  <Field label="How the image fills the page">
                    <Segmented
                      value={fit}
                      onChange={setFit}
                      options={[
                        { value: 'contain', label: 'Fit inside', title: 'Show the whole image, leaving empty space' },
                        { value: 'cover', label: 'Fill page', title: 'Fill the page, cropping the overflow' },
                      ]}
                      className="w-full"
                      size="sm"
                    />
                  </Field>
                </>
              )}
              <OptionsGrid cols={1}>
                <Field label="Margin" hint="72 points is one inch">
                  <NumberInput value={margin} onValueChange={setMargin} min={0} max={200} suffix="pt" />
                </Field>
              </OptionsGrid>
            </div>
          </Section>

          <Section title="Where to save">
            <div className="space-y-3">
              <Field label="PDF name" hint="The .pdf extension is added for you">
                <Input
                  value={filename}
                  placeholder={suggestedName}
                  onChange={(e) => setFilename(e.target.value)}
                />
              </Field>
              <OutputSettings spec={spec} onChange={update} showSuffix={false} />
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Create PDF"
            icon="FileImage"
            disabled={files.isEmpty}
            disabledReason="Add at least one image first."
          />
        </>
      }
    />
  );
}
