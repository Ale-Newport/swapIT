import { readTextFile } from '@tauri-apps/plugin-fs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { saveText } from '@/core/save';
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
  Card,
  Field,
  Icon,
  Input,
  Section,
  Slider,
  Spinner,
  Switch,
} from '@/components/ui';
import { DEFAULT_OPTIONS, optimizeSvg, type OptimizeOptions, type OptimizeResult } from './logic';

/**
 * SVGO runs in the frontend, so there is no backend job for `useToolRun` to
 * drive. This adapter keeps the standard action row — same button, same
 * progress, same ⌘⇧C shortcut — and gives Cancel a real effect.
 */
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

/** A blob URL keeps the markup out of the DOM, so embedded scripts stay inert. */
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

function Pane({ svg, label, size, tone }: { svg: string | null; label: string; size: number; tone?: 'success' }) {
  const url = useSvgUrl(svg);
  return (
    <figure className="space-y-1.5">
      <div className="checkerboard flex h-56 items-center justify-center overflow-hidden rounded-lg border border-line">
        {url ? (
          <img src={url} alt={label} className="max-h-full max-w-full object-contain p-2" />
        ) : (
          <p className="text-[11.5px] text-ink-faint">Nothing to show</p>
        )}
      </div>
      <figcaption className="flex items-center justify-between text-[11.5px] text-ink-faint">
        <span>{label}</span>
        <span className={tone === 'success' ? 'text-success' : undefined}>{formatBytes(size)}</span>
      </figcaption>
    </figure>
  );
}

/** Honour "skip" instead of writing over a file the user asked us to leave alone. */
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

export default function SvgOptimizer() {
  const files = useToolFiles({ extensions: ['svg'], filterName: 'SVG files' });
  const { run, setProgress, setResult, setError, cancelled } = useLocalRun();
  const { spec, update } = useOutputSpec({ suffix: '-min' });
  const [options, setOptions] = useState<OptimizeOptions>(DEFAULT_OPTIONS);

  const set = <K extends keyof OptimizeOptions>(key: K, value: OptimizeOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  // The first file drives the preview; the run applies the same settings to all.
  const [sample, setSample] = useState<{ name: string; source: string } | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const firstPath = files.paths[0] ?? null;
  const firstName = files.files[0]?.name ?? null;

  useEffect(() => {
    let stale = false;
    if (!firstPath) {
      setSample(null);
      setSampleError(null);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const text = await readTextFile(firstPath);
        if (stale) return;
        setSample({ name: firstName ?? firstPath, source: text });
        setSampleError(null);
      } catch (err) {
        if (stale) return;
        setSample(null);
        setSampleError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!stale) setLoading(false);
      }
    })();
    return () => {
      stale = true;
    };
  }, [firstPath, firstName]);

  const preview = useMemo((): { result: OptimizeResult | null; error: string | null } => {
    if (!sample) return { result: null, error: null };
    try {
      return { result: optimizeSvg(sample.source, options), error: null };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [sample, options]);

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
          const optimized = optimizeSvg(text, options);
          const saved = await saveSvg(optimized.data, file.path, spec);
          results.push({
            ...saved,
            sourceSize: optimized.before,
            note: saved.disposition === 'skipped' ? saved.note : `−${Math.max(0, optimized.percent).toFixed(0)}%`,
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
      setResult({
        results,
        failures,
        cancelled: cancelled.current,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setProgress({ running: false, done: 0, total: 0, currentFile: null });
    }
  };

  const result = preview.result;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop SVG files here"
            hint="Icons, logos, exports from Figma, Illustrator or Inkscape — batches welcome"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {sampleError && (
            <Alert tone="danger" title="Could not read that file">
              {sampleError}
            </Alert>
          )}
          {preview.error && (
            <Alert tone="danger" title="This file could not be optimised">
              {preview.error}
            </Alert>
          )}

          {(loading || result) && (
            <Section
              title="Before and after"
              description={sample ? sample.name : undefined}
              actions={files.files.length > 1 ? <Badge>Previewing the first of {files.files.length}</Badge> : undefined}
            >
              {loading && !result ? (
                <div className="flex h-56 items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                result && (
                  <>
                    <Card className="mb-3 bg-canvas" padded={false}>
                      <div className="flex items-center gap-6 px-4 py-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-ink-faint">Before</p>
                          <p className="text-[15px] font-medium text-ink">{formatBytes(result.before)}</p>
                        </div>
                        <Icon name="ArrowRight" size={14} className="text-ink-faint" />
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-ink-faint">After</p>
                          <p className="text-[15px] font-medium text-ink">{formatBytes(result.after)}</p>
                        </div>
                        <Badge tone={result.saved > 0 ? 'success' : 'warn'} className="ml-auto">
                          {result.saved > 0
                            ? `${result.percent.toFixed(1)}% smaller`
                            : `${Math.abs(result.percent).toFixed(1)}% larger`}
                        </Badge>
                      </div>
                    </Card>
                    <div className="grid grid-cols-2 gap-3">
                      <Pane svg={sample?.source ?? null} label="Original" size={result.before} />
                      <Pane svg={result.data} label="Optimized" size={result.after} tone="success" />
                    </div>
                    <p className="mt-3 text-[11.5px] text-ink-faint">
                      Both panes render the real markup. If the right-hand image looks different, turn off the
                      clean-up that broke it before running the batch.
                    </p>
                  </>
                )
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Optimized" />}
        </>
      }
      aside={
        <>
          <Section title="Clean-up">
            <div className="space-y-0.5">
              <Field inline label="Comments" hint="Editor notes and licence banners">
                <Switch checked={options.removeComments} onCheckedChange={(v) => set('removeComments', v)} />
              </Field>
              <Field inline label="Metadata" hint="<metadata> blocks — RDF, licence and editor bookkeeping">
                <Switch checked={options.removeMetadata} onCheckedChange={(v) => set('removeMetadata', v)} />
              </Field>
              <Field
                inline
                label="Titles and descriptions"
                hint="<title> and <desc> — screen readers read these aloud"
              >
                <Switch checked={options.removeTitles} onCheckedChange={(v) => set('removeTitles', v)} />
              </Field>
              <Field inline label="Editor data" hint="Inkscape, Illustrator and Sketch namespaces">
                <Switch checked={options.removeEditorData} onCheckedChange={(v) => set('removeEditorData', v)} />
              </Field>
              <Field inline label="Hidden elements" hint="Anything with display:none or zero size">
                <Switch checked={options.removeHiddenElements} onCheckedChange={(v) => set('removeHiddenElements', v)} />
              </Field>
            </div>
          </Section>

          <Section title="Restructure">
            <div className="space-y-0.5">
              <Field inline label="Collapse groups" hint="Flatten <g> wrappers that add nothing">
                <Switch checked={options.collapseGroups} onCheckedChange={(v) => set('collapseGroups', v)} />
              </Field>
              <Field inline label="Merge paths" hint="Join paths that share their styling">
                <Switch checked={options.mergePaths} onCheckedChange={(v) => set('mergePaths', v)} />
              </Field>
              <Field inline label="Shapes to paths" hint="Rewrite <rect> and <line> as path data">
                <Switch checked={options.convertShapesToPaths} onCheckedChange={(v) => set('convertShapesToPaths', v)} />
              </Field>
              <Field inline label="Multiple passes" hint="Repeat until nothing more can go">
                <Switch checked={options.multipass} onCheckedChange={(v) => set('multipass', v)} />
              </Field>
            </div>
          </Section>

          <Section title="Numbers and ids">
            <div className="space-y-3">
              <Field
                label={`Coordinate precision — ${options.precision} decimal${options.precision === 1 ? '' : 's'}`}
                hint={
                  options.precision <= 1
                    ? 'Very small files, but curves may visibly shift.'
                    : 'Lower keeps fewer decimals on every coordinate.'
                }
              >
                <Slider min={0} max={5} value={options.precision} onChange={(v) => set('precision', v)} />
              </Field>
              <Field inline label="Prefix ids" hint="Avoids clashes when inlining several SVGs">
                <Switch checked={options.prefixIds} onCheckedChange={(v) => set('prefixIds', v)} />
              </Field>
              {options.prefixIds && (
                <Field label="Prefix">
                  <Input
                    value={options.idPrefix}
                    placeholder="icon"
                    onChange={(e) => set('idPrefix', e.target.value)}
                  />
                </Field>
              )}
              <Field inline label="Keep it readable" hint="Indented output instead of one long line">
                <Switch checked={options.pretty} onCheckedChange={(v) => set('pretty', v)} />
              </Field>
              <Field inline label="Remove viewBox" hint="Only when the size is fixed forever">
                <Switch checked={options.removeViewBox} onCheckedChange={(v) => set('removeViewBox', v)} />
              </Field>
              {options.removeViewBox && (
                <Alert tone="warn">
                  Without a viewBox an SVG cannot scale: it will render at its declared width and height and ignore
                  any CSS size you give it. Leave this off unless you know the file is only ever used at one size.
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
            label={files.files.length > 1 ? `Optimize ${files.files.length} files` : 'Optimize'}
            icon="Sparkles"
            disabled={files.isEmpty}
            disabledReason="Add at least one SVG first."
          />
        </>
      }
    />
  );
}
