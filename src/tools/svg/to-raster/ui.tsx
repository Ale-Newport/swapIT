import { readTextFile } from '@tauri-apps/plugin-fs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { canvasToBytes, saveBytes } from '@/core/save';
import type { BatchResult, FileFailure, FileResult, OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import type { ToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OptionsGrid,
  OutputSettings,
  PresetRow,
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
  Slider,
  Switch,
} from '@/components/ui';
import { computeTarget, prepareSvg, readIntrinsic, type SizeMode, type SizeOptions } from './logic';

type Format = 'png' | 'jpg';

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

/**
 * Draw the markup into a canvas. Loading it through a blob URL into an <img>
 * puts the browser in its secure static mode: no scripts, no network fetches.
 */
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

async function saveRaster(
  bytes: Uint8Array,
  source: string,
  output: OutputSpec,
  ext: string,
): Promise<FileResult> {
  const planned = await planOutput(source, output, ext);
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
  return saveBytes(bytes, { source, output, ext });
}

const SCALE_PRESETS = [
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '3x', value: 3 },
  { label: '4x', value: 4 },
];

export default function SvgToRaster() {
  const files = useToolFiles({ extensions: ['svg'], filterName: 'SVG files' });
  const { run, setProgress, setResult, setError, cancelled } = useLocalRun();
  const { spec, update } = useOutputSpec();

  const [format, setFormat] = useState<Format>('png');
  const [quality, setQuality] = useState(92);
  const [mode, setMode] = useState<SizeMode>('scale');
  const [scale, setScale] = useState(2);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [lockAspect, setLockAspect] = useState(true);
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState('#ffffff');

  const [sample, setSample] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sizeTouched = useRef(false);
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
        if (stale) return;
        setSample(text);
        setSampleError(null);
        // Seed the exact-size boxes from the artwork, until the user types.
        const intrinsic = readIntrinsic(text);
        if (!sizeTouched.current && intrinsic.width && intrinsic.height) {
          setWidth(Math.round(intrinsic.width));
          setHeight(Math.round(intrinsic.height));
        }
      } catch (err) {
        if (stale) return;
        setSample(null);
        setSampleError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      stale = true;
    };
  }, [firstPath]);

  const sizeOptions: SizeOptions = useMemo(
    () => ({ mode, scale, width, height, lockAspect }),
    [mode, scale, width, height, lockAspect],
  );
  const intrinsic = useMemo(() => (sample ? readIntrinsic(sample) : null), [sample]);
  const target = useMemo(
    () => (intrinsic ? computeTarget(intrinsic, sizeOptions) : null),
    [intrinsic, sizeOptions],
  );
  const previewUrl = useSvgUrl(sample);

  const opaque = format === 'jpg' || !transparent;
  const backgroundFill = opaque ? background : null;

  const setWidthTouched = (value: number) => {
    sizeTouched.current = true;
    setWidth(value);
    if (lockAspect && intrinsic?.ratio) setHeight(Math.max(1, Math.round(value / intrinsic.ratio)));
  };
  const setHeightTouched = (value: number) => {
    sizeTouched.current = true;
    setHeight(value);
    if (lockAspect && intrinsic?.ratio) setWidth(Math.max(1, Math.round(value * intrinsic.ratio)));
  };

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
          const size = computeTarget(readIntrinsic(text), sizeOptions);
          if (!size.ok) throw new Error(size.message);
          const prepared = prepareSvg(text, size.width, size.height);
          const canvas = await rasterize(prepared, size.width, size.height, backgroundFill);
          const bytes = await canvasToBytes(
            canvas,
            format === 'png' ? 'image/png' : 'image/jpeg',
            format === 'png' ? undefined : quality / 100,
          );
          const saved = await saveRaster(bytes, file.path, spec, format);
          results.push({
            ...saved,
            // No size comparison: a PNG is naturally heavier than the vector it came from.
            note: saved.disposition === 'skipped' ? saved.note : `${size.width}×${size.height}`,
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
            hint="Every file is rendered at the size below — batches welcome"
            accept="Folders are expanded automatically"
            allowFolders
          />

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
                target?.ok ? (
                  <Badge tone="accent">
                    {target.width} × {target.height} {format.toUpperCase()}
                  </Badge>
                ) : undefined
              }
            >
              <div
                className={`flex h-72 items-center justify-center overflow-hidden rounded-lg border border-line ${
                  opaque ? '' : 'checkerboard'
                }`}
                style={opaque ? { background } : undefined}
              >
                <img src={previewUrl} alt="SVG preview" className="max-h-full max-w-full object-contain p-3" />
              </div>
              <p className="mt-2 text-[11.5px] text-ink-faint">
                {intrinsic?.hasSize
                  ? `The artwork declares ${Math.round(intrinsic.width ?? 0)} × ${Math.round(intrinsic.height ?? 0)} px.`
                  : 'This file declares no size of its own.'}
                {' '}
                {files.files.length > 1 && mode === 'scale'
                  ? 'Each file is scaled from its own size.'
                  : null}
              </p>
            </Section>
          )}

          {target && !target.ok && (
            <Alert tone="warn" title="This size will not work">
              {target.message}
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Rendered" />}
        </>
      }
      aside={
        <>
          <Section title="Format">
            <div className="space-y-3">
              <Segmented
                value={format}
                onChange={(f) => setFormat(f)}
                options={[
                  { value: 'png', label: 'PNG', title: 'Lossless, keeps transparency' },
                  { value: 'jpg', label: 'JPEG', title: 'Smaller, no transparency' },
                ]}
                className="w-full"
              />
              {format === 'jpg' && (
                <Field label={`Quality — ${quality}`} hint="Lower means smaller files.">
                  <Slider min={40} max={100} value={quality} onChange={setQuality} />
                </Field>
              )}
              {format === 'png' && (
                <Field inline label="Transparent background" hint="Off fills it with a colour">
                  <Switch checked={transparent} onCheckedChange={setTransparent} />
                </Field>
              )}
              {opaque && (
                <Field label="Background colour" hint={format === 'jpg' ? 'JPEG cannot store transparency' : undefined}>
                  <ColorInput value={background} onChange={setBackground} />
                </Field>
              )}
            </div>
          </Section>

          <Section title="Size">
            <div className="space-y-3">
              <Segmented
                value={mode}
                onChange={(m) => setMode(m)}
                options={[
                  { value: 'scale', label: 'Multiply', title: 'Scale each file from its own size' },
                  { value: 'exact', label: 'Exact size', title: 'Render every file at the same pixel size' },
                ]}
                className="w-full"
              />

              {mode === 'scale' ? (
                <>
                  <PresetRow presets={SCALE_PRESETS} active={scale} onSelect={setScale} />
                  <Field label="Multiplier" hint="2x is the usual choice for Retina screens.">
                    <NumberInput
                      value={scale}
                      onValueChange={(v) => setScale(Math.min(20, Math.max(0.1, v)))}
                      min={0.1}
                      max={20}
                      step={0.5}
                      suffix="×"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <OptionsGrid>
                    <Field label="Width">
                      <NumberInput value={width} onValueChange={setWidthTouched} min={1} max={12000} suffix="px" />
                    </Field>
                    <Field label="Height">
                      <NumberInput
                        value={height}
                        onValueChange={setHeightTouched}
                        min={1}
                        max={12000}
                        suffix="px"
                        disabled={lockAspect && Boolean(intrinsic?.ratio)}
                      />
                    </Field>
                  </OptionsGrid>
                  <Field inline label="Lock aspect ratio" hint="Height follows the artwork's shape">
                    <Switch checked={lockAspect} onCheckedChange={setLockAspect} />
                  </Field>
                </>
              )}

              {intrinsic && !intrinsic.hasSize && mode === 'scale' && (
                <Alert tone="warn">
                  This SVG declares no width, height or viewBox, so there is nothing to multiply. Switch to
                  “Exact size” and type the pixels you want.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={`Render ${format.toUpperCase()}`}
            icon="FileImage"
            disabled={files.isEmpty}
            disabledReason="Add at least one SVG first."
          >
            {files.files.length > 0 && (
              <span className="text-[11.5px] text-ink-faint">
                {files.files.length} file{files.files.length === 1 ? '' : 's'} · {formatBytes(files.totalSize)}
              </span>
            )}
          </ToolActions>
        </>
      }
    />
  );
}
