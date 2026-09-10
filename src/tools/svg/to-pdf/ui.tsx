import { readTextFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';
import { useEffect, useMemo, useRef, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { canvasToBytes, saveBytes } from '@/core/save';
import type { BatchResult, FileFailure, FileResult, OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import type { ToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import {
  Alert,
  Badge,
  ColorInput,
  Field,
  NumberInput,
  Section,
  Segmented,
  Select,
  Switch,
} from '@/components/ui';
import {
  DPI_CHOICES,
  pdfLayout,
  pointsToMm,
  prepareSvg,
  readIntrinsic,
  type Orientation,
  type PageSizeId,
  type PdfOptions,
} from './logic';

function useLocalRun() {
  const [progress, setProgress] = useState({ running: false, done: 0, total: 0, currentFile: null as string | null });
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const cancelled = useRef(false);

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
    execute: async () => null,
    executeRaw: async () => null,
    cancel: () => {
      cancelled.current = true;
    },
    reset: () => {
      setResult(null);
      setError(null);
    },
  };

  return { run, setProgress, setResult, setError, cancelled };
}

function useSvgUrl(svg: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!svg) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [svg]);
  return url;
}

/** Blob URL + <img> keeps the file in the browser's secure static mode. */
async function rasterize(
  svg: string,
  width: number,
  height: number,
  background: string | null,
): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            'The browser could not render this SVG. Files that rely on fonts or images which are not embedded often fail this way.',
          ),
        );
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This computer could not provide a drawing surface for the image.');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
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
      note: 'already existed',
    };
  }
  return saveBytes(bytes, { source, output, ext: 'pdf' });
}

const PAGE_OPTIONS = [
  { value: 'artwork', label: 'Fit the page to the artwork' },
  { value: 'a4', label: 'A4 — 210 × 297 mm' },
  { value: 'letter', label: 'Letter — 8.5 × 11 in' },
];

export default function SvgToPdf() {
  const files = useToolFiles({ extensions: ['svg'], filterName: 'SVG files' });
  const { run, setProgress, setResult, setError, cancelled } = useLocalRun();
  const { spec, update } = useOutputSpec();

  const [pageSize, setPageSize] = useState<PageSizeId>('artwork');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [margin, setMargin] = useState(0);
  const [dpi, setDpi] = useState<number>(300);
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState('#ffffff');

  const [sample, setSample] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const firstPath = files.paths[0] ?? null;

  useEffect(() => {
    let stale = false;
    if (!firstPath) {
      setSample(null);
      setSampleError(null);
      return;
    }
    void (async () => {
      try {
        const text = await readTextFile(firstPath);
        if (!stale) {
          setSample(text);
          setSampleError(null);
        }
      } catch (err) {
        if (!stale) {
          setSample(null);
          setSampleError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      stale = true;
    };
  }, [firstPath]);

  const options: PdfOptions = useMemo(
    () => ({ pageSize, orientation, margin, dpi }),
    [pageSize, orientation, margin, dpi],
  );
  const intrinsic = useMemo(() => (sample ? readIntrinsic(sample) : null), [sample]);
  const layout = useMemo(
    () => (intrinsic?.hasSize ? pdfLayout(intrinsic.width ?? 1, intrinsic.height ?? 1, options) : null),
    [intrinsic, options],
  );
  const previewUrl = useSvgUrl(sample);
  const backgroundFill = transparent ? null : background;

  const execute = async () => {
    if (files.isEmpty) return;
    cancelled.current = false;
    setError(null);
    setResult(null);
    setProgress({ running: true, done: 0, total: files.files.length, currentFile: null });
    const started = Date.now();
    const results: FileResult[] = [];
    const failures: FileFailure[] = [];

    try {
      for (const [index, file] of files.files.entries()) {
        if (cancelled.current) break;
        setProgress({ running: true, done: index, total: files.files.length, currentFile: file.name });
        try {
          const text = await readTextFile(file.path);
          const size = readIntrinsic(text);
          if (!size.hasSize || !size.width || !size.height) {
            throw new Error(
              'This SVG declares no width, height or viewBox, so there is no artwork size to put on a page. Give it a viewBox — the SVG Viewer shows what it is missing.',
            );
          }
          const page = pdfLayout(size.width, size.height, options);
          const prepared = prepareSvg(text, page.pixelWidth, page.pixelHeight);
          const canvas = await rasterize(prepared, page.pixelWidth, page.pixelHeight, backgroundFill);
          const png = await canvasToBytes(canvas, 'image/png');

          const pdf = await PDFDocument.create();
          pdf.setProducer('Toolbox');
          pdf.setCreator('Toolbox');
          pdf.setTitle(file.stem);
          const embedded = await pdf.embedPng(png);
          const sheet = pdf.addPage([page.pageWidth, page.pageHeight]);
          sheet.drawImage(embedded, { x: page.x, y: page.y, width: page.width, height: page.height });
          const bytes = await pdf.save();

          const saved = await savePdf(bytes, file.path, spec);
          results.push({
            ...saved,
            // No size comparison: a raster PDF is naturally heavier than the vector.
            note: saved.disposition === 'skipped' ? saved.note : `${page.effectiveDpi} dpi`,
          });
        } catch (err) {
          failures.push({
            path: file.path,
            name: file.name,
            message: err instanceof Error ? err.message : String(err),
            details: null,
          });
        }
      }
      setResult({ results, failures, cancelled: cancelled.current, elapsedMs: Date.now() - started });
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
          <FileDropZone
            files={files}
            label="Drop SVG files here"
            hint="One PDF per file — batches welcome"
            accept="Folders are expanded automatically"
            allowFolders
          />

          <Alert tone="info" title="The page holds a high-resolution image, not live vectors">
            Toolbox draws the artwork at the resolution you choose and embeds that picture in the PDF. It prints
            exactly as it looks here, but the shapes are no longer editable and text inside the drawing is not
            selectable. Pick a higher DPI for print work and a lower one for screen or email.
          </Alert>

          {sampleError && (
            <Alert tone="danger" title="Could not read that file">
              {sampleError}
            </Alert>
          )}

          {previewUrl && (
            <Section
              title="Preview"
              description={files.files.length > 1 ? `First of ${files.files.length} files` : undefined}
              actions={
                layout ? (
                  <Badge tone="accent">
                    {Math.round(pointsToMm(layout.pageWidth))} × {Math.round(pointsToMm(layout.pageHeight))} mm ·{' '}
                    {layout.pixelWidth} × {layout.pixelHeight} px
                  </Badge>
                ) : undefined
              }
            >
              <div
                className={`flex h-72 items-center justify-center overflow-hidden rounded-lg border border-line ${
                  transparent ? 'checkerboard' : ''
                }`}
                style={transparent ? undefined : { background }}
              >
                <img src={previewUrl} alt="SVG preview" className="max-h-full max-w-full object-contain p-4" />
              </div>
              {layout && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  Drawn at {layout.effectiveDpi} dpi
                  {layout.effectiveDpi < dpi && ' — lowered to keep the image within what this app can draw'}. The
                  artwork covers {Math.round(pointsToMm(layout.width))} × {Math.round(pointsToMm(layout.height))} mm
                  on the page.
                </p>
              )}
              {intrinsic && !intrinsic.hasSize && (
                <Alert tone="warn" className="mt-2">
                  This SVG declares no width, height or viewBox, so there is no size to lay out. Add a viewBox to
                  the file and try again.
                </Alert>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="PDFs created" />}
        </>
      }
      aside={
        <>
          <Section title="Resolution">
            <div className="space-y-3">
              <Field label="Detail" hint="Dots per inch of the embedded image.">
                <Segmented
                  value={String(dpi)}
                  onChange={(value) => setDpi(Number(value))}
                  options={DPI_CHOICES.map((d) => ({
                    value: String(d),
                    label: `${d} dpi`,
                    title:
                      d === 150 ? 'Screen and email' : d === 300 ? 'Standard printing' : 'Fine detail and large prints',
                  }))}
                  className="w-full"
                />
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                150 dpi is fine on screen. 300 dpi is what print shops ask for. 600 dpi makes big files and only
                helps for fine linework or large formats.
              </p>
            </div>
          </Section>

          <Section title="Page">
            <div className="space-y-3">
              <Field label="Page size">
                <Select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as PageSizeId)}
                  options={PAGE_OPTIONS}
                />
              </Field>
              {pageSize !== 'artwork' && (
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
              )}
              <Field label="Margin" hint="72 points is one inch">
                <NumberInput value={margin} onValueChange={setMargin} min={0} max={300} suffix="pt" />
              </Field>
            </div>
          </Section>

          <Section title="Background">
            <div className="space-y-3">
              <Field inline label="Transparent" hint="Leaves the page showing through">
                <Switch checked={transparent} onCheckedChange={setTransparent} />
              </Field>
              {!transparent && (
                <Field label="Colour">
                  <ColorInput value={background} onChange={setBackground} />
                </Field>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={files.files.length > 1 ? `Create ${files.files.length} PDFs` : 'Create PDF'}
            icon="FileText"
            disabled={files.isEmpty}
            disabledReason="Add at least one SVG first."
          />
        </>
      }
    />
  );
}
