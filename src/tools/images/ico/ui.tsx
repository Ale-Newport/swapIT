import { useEffect, useState } from 'react';
import { appPaths, asToolboxError, call, ensureDir } from '@/core/bridge';
import { dirname } from '@/core/format';
import { newJobId } from '@/core/tasks';
import type { BatchResult, OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  assetUrl,
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Checkbox, Field, Section, Switch } from '@/components/ui';
import {
  DEFAULT_SIZES,
  fitLabel,
  frameSummary,
  ICO_SIZES,
  isSquare,
  normalizeSizes,
  squareSourceSize,
  toggleSize,
} from './logic';

interface Dimensions {
  width: number;
  height: number;
}

export default function IcoGenerator() {
  const files = useToolFiles({ kinds: ['image'], filterName: 'Images', multiple: false });
  const run = useToolRun('images/ico', 'ICO Generator');
  const { spec, update } = useOutputSpec();
  const path = files.files[0]?.path ?? null;
  const stem = files.files[0]?.stem ?? null;

  const [sizes, setSizes] = useState<number[]>(DEFAULT_SIZES);
  const [square, setSquare] = useState(true);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [dimensionsError, setDimensionsError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [cropError, setCropError] = useState<ToolboxError | null>(null);
  const [cropping, setCropping] = useState(false);

  // The source's shape decides whether the frames get stretched, so read it up front.
  useEffect(() => {
    setCropError(null);
    if (!path) {
      setDimensions(null);
      setDimensionsError(null);
      return;
    }
    let cancelled = false;
    setPreviewFailed(false);
    void (async () => {
      setDimensionsError(null);
      try {
        const info = await call<Dimensions[]>('image_info', { inputs: [path] });
        if (!cancelled) setDimensions(info[0] ?? null);
      } catch {
        if (!cancelled) {
          setDimensions(null);
          setDimensionsError('Toolbox could not read this image, so it cannot tell you whether it is square.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const selected = normalizeSizes(sizes);
  const sourceIsSquare = dimensions ? isSquare(dimensions.width, dimensions.height) : true;
  const willSquare = square && Boolean(dimensions) && !sourceIsSquare;

  const execute = async () => {
    if (!path || !stem || selected.length === 0 || cropping) return;
    setCropError(null);

    let input = path;
    let output: OutputSpec = spec;

    if (willSquare && dimensions) {
      // Multi-frame ICO encoding scales the decoded source directly, so the
      // centre crop has to happen in its own pass before the container is built.
      // It goes straight through the bridge rather than `run.execute`, because
      // that pass is an internal staging step: one press of "Create .ico" must
      // leave exactly one task and one history entry behind, pointing at the
      // icon rather than at a temp-folder crop nobody asked for.
      const side = squareSourceSize(dimensions.width, dimensions.height);
      setCropping(true);
      let prepared: BatchResult;
      try {
        const staging = `${(await appPaths()).temp}/toolbox-ico`;
        await ensureDir(staging);
        prepared = await call<BatchResult>('process_images', {
          jobId: newJobId(),
          inputs: [path],
          ops: {
            format: 'png',
            resize: { width: side, height: side, mode: 'fill', allowUpscale: true },
          },
          output: {
            mode: 'custom',
            dir: staging,
            suffix: null,
            collision: 'overwrite',
            filename: stem,
          } satisfies OutputSpec,
        });
      } catch (err) {
        setCropError(asToolboxError(err));
        return;
      } finally {
        setCropping(false);
      }
      const cropped = prepared.results[0]?.path;
      if (!cropped) {
        const failure = prepared.failures[0];
        setCropError({
          message: failure?.message ?? 'This image could not be cropped to a square.',
          details: failure?.details ?? null,
          kind: 'invalid_input',
        });
        return;
      }
      input = cropped;
      // The staged file lives in the temp folder, so "same folder" has to be
      // pinned back to the folder the original image came from.
      output =
        spec.mode === 'same_dir'
          ? { ...spec, mode: 'custom', dir: dirname(path), filename: stem }
          : { ...spec, filename: stem };
    }

    await run.execute({
      command: 'process_images',
      total: 1,
      inputs: [path],
      label: `Build a ${selected.length}-frame ICO`,
      args: { inputs: [input], ops: { format: 'ico', icoSizes: selected }, output },
    });
  };

  // The staging crop reports outside the task centre, so its failure has to be
  // merged in here.
  const error = cropError ?? run.error;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an image here"
            hint="A square PNG at 256 px or larger gives the sharpest icon"
            compact={Boolean(path)}
          />

          {dimensionsError && <Alert tone="warn">{dimensionsError}</Alert>}

          {path && dimensions && !sourceIsSquare && (
            <Alert
              tone="warn"
              title={`This image is ${dimensions.width} × ${dimensions.height}, not square`}
            >
              Every frame inside an .ico file is square. {fitLabel(square, false)}
            </Alert>
          )}

          {path && selected.length > 0 && (
            <Section
              title="Frames"
              description={frameSummary(selected)}
              dense
            >
              {previewFailed ? (
                <p className="px-1 py-2 text-[12px] text-ink-faint">
                  This format has no on-screen preview, but the icon will still be generated from
                  the original file.
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-4 overflow-x-auto p-1">
                  {selected.map((size) => (
                    <figure key={size} className="shrink-0 space-y-1.5 text-center">
                      <div
                        className="checkerboard overflow-hidden rounded-md border border-line"
                        style={{ width: size, height: size }}
                      >
                        <img
                          src={assetUrl(path)}
                          alt={`${size} by ${size} preview`}
                          width={size}
                          height={size}
                          onError={() => setPreviewFailed(true)}
                          style={{
                            width: size,
                            height: size,
                            objectFit: willSquare || sourceIsSquare ? 'cover' : 'fill',
                          }}
                        />
                      </div>
                      <figcaption className="text-[11px] text-ink-faint">{size}px</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </Section>
          )}

          {error && <ErrorDisplay error={error} onRetry={() => void execute()} />}
          {run.result && run.result.results.some((r) => r.name.endsWith('.ico')) && (
            <ResultPanel
              result={run.result}
              onProcessAgain={() => {
                setCropError(null);
                run.reset();
              }}
              title="Icon ready"
            />
          )}
        </>
      }
      aside={
        <>
          <Section title="Sizes" description="Windows picks the closest frame at display time">
            <div className="grid grid-cols-2 gap-2">
              {ICO_SIZES.map((size) => (
                <Checkbox
                  key={size}
                  checked={selected.includes(size)}
                  onCheckedChange={() => setSizes((current) => toggleSize(current, size))}
                  label={`${size} × ${size}`}
                />
              ))}
            </div>
            {selected.length === 0 && (
              <p className="mt-2 text-[11.5px] text-danger">Pick at least one frame size.</p>
            )}
            {dimensions && !sourceIsSquare && (
              <Field
                inline
                className="mt-2"
                label="Crop to a square"
                hint="Keeps the centre instead of squashing the image"
              >
                <Switch checked={square} onCheckedChange={setSquare} />
              </Field>
            )}
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Create .ico"
            icon="AppWindow"
            disabled={!path || selected.length === 0 || cropping}
            disabledReason={
              !path
                ? 'Add an image first.'
                : selected.length === 0
                  ? 'Pick at least one frame size.'
                  : 'Cropping the source to a square…'
            }
          />
        </>
      }
    />
  );
}
