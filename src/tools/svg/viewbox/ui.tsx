import { readTextFile } from '@tauri-apps/plugin-fs';
import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { saveText } from '@/core/save';
import type { BatchResult, FileResult, OutputSpec, ToolboxError } from '@/core/types';
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
import { Alert, Button, Field, NumberInput, Section, Spinner, Stat } from '@/components/ui';
import {
  applyViewBox,
  describeCoverage,
  expandViewBox,
  formatViewBox,
  inflate,
  isValidViewBox,
  readViewBox,
  sameViewBox,
  stripSize,
  trim,
  unionViewBox,
  type ViewBox,
} from './logic';

const FALLBACK: ViewBox = { minX: 0, minY: 0, width: 300, height: 150 };

/**
 * Measure the artwork by parsing the file into a detached SVG element, dropping
 * it into a hidden corner of the page and asking the renderer for the union of
 * its children's bounding boxes. Geometry only — strokes and filters can spill
 * a little past it, which is what the padding is for.
 */
function measureContent(source: string): ViewBox | null {
  try {
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (parsed.getElementsByTagName('parsererror').length > 0) return null;
    const root = parsed.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg') return null;

    const node = document.importNode(root, true) as unknown as SVGSVGElement;
    node.setAttribute('width', '1000');
    node.setAttribute('height', '1000');
    const holder = document.createElement('div');
    holder.style.cssText =
      'position:fixed;left:-20000px;top:0;width:1000px;height:1000px;overflow:hidden;opacity:0;pointer-events:none';
    holder.appendChild(node);
    document.body.appendChild(holder);
    try {
      const box = node.getBBox();
      if (!Number.isFinite(box.width) || box.width <= 0 || box.height <= 0) return null;
      return { minX: box.x, minY: box.y, width: box.width, height: box.height };
    } finally {
      holder.remove();
    }
  } catch {
    return null;
  }
}

/**
 * Honour "skip" instead of writing over a file the user asked us to leave alone:
 * `plan_output` hands back the existing path with a `skipped` disposition, so the
 * write has to be short-circuited here rather than after the fact.
 */
async function saveSvg(text: string, source: string, output: OutputSpec): Promise<FileResult> {
  const planned = await planOutput(source, output, 'svg');
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
  return saveText(text, { source, output, ext: 'svg' });
}

function useBlobUrl(svg: string | null): string | null {
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

export default function SvgViewBoxTool() {
  const files = useToolFiles({ extensions: ['svg'], filterName: 'SVG files', multiple: false });
  const { spec, update } = useOutputSpec({ suffix: '-viewbox' });

  const [source, setSource] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [frame, setFrame] = useState<ViewBox>(FALLBACK);
  const [padding, setPadding] = useState(0);
  const [content, setContent] = useState<ViewBox | null>(null);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;

  useEffect(() => {
    let alive = true;
    setSource(null);
    setReadError(null);
    setContent(null);
    setResult(null);
    setError(null);
    if (!path) return;
    readTextFile(path)
      .then((text) => {
        if (!alive) return;
        const state = readViewBox(text);
        if (!state) {
          setReadError('No <svg> element was found in this file, so there is no viewBox to edit.');
          return;
        }
        const measured = measureContent(text);
        setSource(text);
        setContent(measured);
        setFrame(state.declared ?? state.intrinsic ?? measured ?? FALLBACK);
      })
      .catch(() => {
        if (alive) setReadError('That file could not be read as text. An SVG is XML — a binary or damaged file cannot be edited here.');
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const state = useMemo(() => (source ? readViewBox(source) : null), [source]);
  const base = state?.declared ?? state?.intrinsic ?? content ?? FALLBACK;
  const valid = isValidViewBox(frame);

  // The artwork is drawn in its own frame; the preview then zooms out far enough
  // to show the new frame as well, so a crop is visible before it is applied.
  const stage = useMemo(() => inflate(unionViewBox(base, valid ? frame : base), 0.12), [base, frame, valid]);
  const artwork = useMemo(() => (source ? stripSize(applyViewBox(source, base)) : null), [source, base]);
  const output = useMemo(() => (source && valid ? applyViewBox(source, frame) : null), [source, frame, valid]);
  const resultPreview = useMemo(() => (output ? stripSize(output) : null), [output]);

  const artworkUrl = useBlobUrl(artwork);
  const resultUrl = useBlobUrl(resultPreview);

  const setField = (key: keyof ViewBox, value: number) => setFrame((current) => ({ ...current, [key]: value }));

  const run: ToolRun = {
    running: saving,
    progress: null,
    done: 0,
    total: 0,
    currentFile: null,
    result,
    raw: null,
    error,
    taskId: null,
    execute: async () => null,
    executeRaw: async () => null,
    cancel: () => setSaving(false),
    reset: () => {
      setResult(null);
      setError(null);
    },
  };

  const execute = async () => {
    if (!path || !file || !output) return;
    setSaving(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      const saved = await saveSvg(output, path, spec);
      setResult({
        results: [
          {
            ...saved,
            sourceSize: file.size,
            note: saved.disposition === 'skipped' ? saved.note : `viewBox ${formatViewBox(frame)}`,
          },
        ],
        failures: [],
        cancelled: false,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setSaving(false);
    }
  };

  const unchanged = Boolean(state && sameViewBox(state.declared, frame));

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an SVG here"
            hint="The viewBox is the window onto the drawing — move it, resize it, or fit it to the artwork"
          />
          {readError && <Alert tone="danger">{readError}</Alert>}

          {source && (
            <Section
              title="Frame"
              description={
                valid ? `viewBox="${formatViewBox(frame)}"` : 'Width and height must both be greater than zero'
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <figure className="space-y-1.5">
                  <div className="checkerboard overflow-hidden rounded-lg border border-line">
                    <svg
                      viewBox={formatViewBox(stage)}
                      className="h-64 w-full"
                      role="img"
                      aria-label="The artwork with the new frame drawn over it"
                    >
                      {artworkUrl && (
                        <image
                          href={artworkUrl}
                          x={base.minX}
                          y={base.minY}
                          width={base.width}
                          height={base.height}
                          preserveAspectRatio="none"
                        />
                      )}
                      {valid && (
                        <>
                          <path
                            d={`M${trim(stage.minX)} ${trim(stage.minY)}H${trim(stage.minX + stage.width)}V${trim(
                              stage.minY + stage.height,
                            )}H${trim(stage.minX)}Z M${trim(frame.minX)} ${trim(frame.minY)}H${trim(
                              frame.minX + frame.width,
                            )}V${trim(frame.minY + frame.height)}H${trim(frame.minX)}Z`}
                            fillRule="evenodd"
                            style={{ fill: 'var(--color-ink)', opacity: 0.16 }}
                          />
                          <rect
                            x={frame.minX}
                            y={frame.minY}
                            width={frame.width}
                            height={frame.height}
                            fill="none"
                            strokeWidth={1.5}
                            vectorEffect="non-scaling-stroke"
                            style={{ stroke: 'var(--color-accent)' }}
                          />
                        </>
                      )}
                    </svg>
                  </div>
                  <figcaption className="text-[11.5px] text-ink-faint">New frame over the whole drawing</figcaption>
                </figure>

                <figure className="space-y-1.5">
                  <div className="checkerboard flex h-64 items-center justify-center overflow-hidden rounded-lg border border-line p-3">
                    {resultUrl ? (
                      <img src={resultUrl} alt="Result" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <Spinner />
                    )}
                  </div>
                  <figcaption className="text-[11.5px] text-ink-faint">Result</figcaption>
                </figure>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Current viewBox" value={state?.declared ? formatViewBox(state.declared) : 'none'} />
                <Stat
                  label="Declared size"
                  value={state?.intrinsic ? `${trim(state.intrinsic.width)} × ${trim(state.intrinsic.height)}` : 'none'}
                />
                <Stat
                  label="Artwork bounds"
                  value={content ? `${trim(content.width)} × ${trim(content.height)}` : 'not measurable'}
                  hint={content ? `at ${trim(content.minX)}, ${trim(content.minY)}` : undefined}
                />
                <Stat label="Frame ratio" value={valid ? `${(frame.width / frame.height).toFixed(3)} : 1` : '—'} />
              </div>

              {content && valid && (
                <p className="mt-2 text-[11.5px] text-ink-faint">{describeCoverage(frame, content)}</p>
              )}
            </Section>
          )}

          {source && !content && (
            <Alert tone="info" title="The artwork could not be measured">
              Fitting to content needs a renderable drawing — this file may be empty, may use only external references, or
              may not be valid XML. The numeric fields still work.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="SVG saved" />}
        </>
      }
      aside={
        <>
          <Section title="viewBox" description="Four numbers, in user units">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="min-x" hint="Left edge">
                  <NumberInput value={frame.minX} step={1} onValueChange={(v) => setField('minX', v)} />
                </Field>
                <Field label="min-y" hint="Top edge">
                  <NumberInput value={frame.minY} step={1} onValueChange={(v) => setField('minY', v)} />
                </Field>
                <Field label="width">
                  <NumberInput value={frame.width} min={0} step={1} onValueChange={(v) => setField('width', v)} />
                </Field>
                <Field label="height">
                  <NumberInput value={frame.height} min={0} step={1} onValueChange={(v) => setField('height', v)} />
                </Field>
              </div>

              <Field label="Padding" hint="User units added on every side">
                <div className="flex gap-2">
                  <NumberInput value={padding} step={1} onValueChange={setPadding} className="flex-1" />
                  <Button
                    size="sm"
                    icon="Expand"
                    disabled={!source || padding === 0 || !valid}
                    title="Grow the frame by the padding on all four sides"
                    onClick={() => setFrame((current) => expandViewBox(current, padding))}
                  >
                    Apply
                  </Button>
                </div>
              </Field>

              <div className="flex flex-wrap gap-1.5">
                {content && (
                  <Button
                    size="sm"
                    icon="Scan"
                    onClick={() => setFrame(expandViewBox(content, padding))}
                    title="Set the frame to the drawing's bounding box, plus the padding"
                  >
                    Fit to content
                  </Button>
                )}
                {state?.intrinsic && (
                  <Button
                    size="sm"
                    icon="Ruler"
                    onClick={() => state.intrinsic && setFrame(state.intrinsic)}
                    title={`Use 0 0 ${trim(state.intrinsic.width)} ${trim(state.intrinsic.height)}`}
                  >
                    Intrinsic size
                  </Button>
                )}
                {state?.declared && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="RotateCcw"
                    onClick={() => state.declared && setFrame(state.declared)}
                  >
                    Original
                  </Button>
                )}
              </div>

              <p className="text-[11.5px] text-ink-faint">
                Fitting to content uses the drawing's geometry. Wide strokes, filters and markers can extend a little past
                it — a padding of one or two stroke widths keeps them inside.
              </p>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Save SVG"
            icon="Download"
            disabled={!output || unchanged}
            disabledReason={
              !source
                ? 'Add an SVG first.'
                : !valid
                  ? 'Width and height must both be greater than zero.'
                  : 'The viewBox already matches the file.'
            }
          />
        </>
      }
    />
  );
}
