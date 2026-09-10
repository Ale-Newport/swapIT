import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
import { toCanvas, toSVG } from 'bwip-js/browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appPaths, revealInFinder } from '@/core/bridge';
import { dirname, formatBytes, shortenPath } from '@/core/format';
import { usePrefs } from '@/core/prefs';
import { canvasToBytes, saveAs, saveBytes, saveText, saveTextAs } from '@/core/save';
import type { BatchResult, FileFailure, FileResult, OutputSpec } from '@/core/types';
import { OptionsGrid, ResultPanel, ToolShell, useOutputSpec } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  ColorInput,
  EmptyState,
  Field,
  Icon,
  Input,
  Progress,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  DEFAULT_BARCODE_OPTIONS,
  SYMBOLOGIES,
  bwipOptions,
  getSymbology,
  humanizeBwipError,
  parseBatchLines,
  safeFilename,
  validateBarcode,
  withExplicitSize,
  type BarcodeOptions,
  type SymbologyId,
} from './logic';

type Mode = 'single' | 'batch';
type Format = 'png' | 'svg';

export default function BarcodeGenerator() {
  const [symbologyId, setSymbologyId] = useState<SymbologyId>('code128');
  const [mode, setMode] = useState<Mode>('single');
  const [value, setValue] = useState('');
  const [batchText, setBatchText] = useState('');
  const [options, setOptions] = useState<BarcodeOptions>(DEFAULT_BARCODE_OPTIONS);
  const [format, setFormat] = useState<Format>('png');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { spec, update } = useOutputSpec();
  const lastOutputDir = usePrefs((s) => s.lastOutputDir);
  const setLastOutputDir = usePrefs((s) => s.setLastOutputDir);
  // Nothing is read from disk here, so "same folder as the input" has no
  // meaning — the batch always writes into a folder the user names.
  const [dir, setDir] = useState<string | null>(spec.dir ?? lastOutputDir);

  // Seed it with Downloads the first time, so a batch is one click away.
  useEffect(() => {
    if (dir) return;
    let stale = false;
    void appPaths()
      .then((paths) => {
        if (!stale) setDir(paths.downloads);
      })
      .catch(() => {
        // Leave it empty; the Generate button explains what is missing.
      });
    return () => {
      stale = true;
    };
  }, [dir]);

  const pickFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') {
      setDir(picked);
      setLastOutputDir(picked);
    }
  };

  const symbology = getSymbology(symbologyId);
  const setOption = (patch: Partial<BarcodeOptions>) => setOptions((current) => ({ ...current, ...patch }));

  const batchLines = useMemo(() => parseBatchLines(batchText), [batchText]);
  const batchChecks = useMemo(
    () => batchLines.map((line) => ({ line, validation: validateBarcode(symbologyId, line) })),
    [batchLines, symbologyId],
  );
  const batchValid = batchChecks.filter((entry) => entry.validation.ok);
  const batchInvalid = batchChecks.filter((entry) => !entry.validation.ok);

  const previewSource = mode === 'single' ? value : (batchValid[0]?.line ?? batchLines[0] ?? '');
  const validation = useMemo(
    () => validateBarcode(symbologyId, previewSource),
    [symbologyId, previewSource],
  );
  const untouched = previewSource.trim().length === 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !validation.ok) return;
    try {
      toCanvas(canvas, bwipOptions(symbology, validation.text, options));
      setRenderError(null);
    } catch (err) {
      // Wipe what the previous value drew — a leftover barcode beside the error
      // would read as if it encoded the value in the box.
      canvas.width = 0;
      canvas.height = 0;
      setRenderError(humanizeBwipError(err));
    }
  }, [validation, options, symbology]);

  useEffect(() => {
    setSaved(null);
    setExportError(null);
    setCopied(false);
  }, [validation, options, symbologyId]);

  const applyFix = () => {
    if (!validation.fix) return;
    const replacement = validation.fix.value;
    if (mode === 'single') setValue(replacement);
    // A function replacement keeps `$` in Code 39 and Codabar values literal.
    else setBatchText((current) => current.replace(previewSource, () => replacement));
  };

  const runExport = async (label: string, task: () => Promise<FileResult | null>) => {
    setBusy(label);
    setExportError(null);
    setSaved(null);
    try {
      const result = await task();
      if (result) setSaved(result);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const renderCanvas = (text: string): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    toCanvas(canvas, bwipOptions(symbology, text, options));
    return canvas;
  };

  const savePng = () =>
    void runExport('png', async () => {
      const bytes = await canvasToBytes(renderCanvas(validation.text));
      return saveAs(bytes, `${safeFilename(validation.text)}.png`);
    });

  const saveSvg = () =>
    void runExport('svg', async () => {
      const svg = withExplicitSize(toSVG(bwipOptions(symbology, validation.text, options)));
      return saveTextAs(svg, `${safeFilename(validation.text)}.svg`);
    });

  const copyImage = () =>
    void runExport('copy', async () => {
      const bytes = await canvasToBytes(renderCanvas(validation.text));
      await writeImage(bytes);
      setCopied(true);
      return null;
    });

  const generateBatch = async () => {
    setBusy('batch');
    setExportError(null);
    setBatchResult(null);
    setProgress({ done: 0, total: batchValid.length });
    const started = Date.now();
    const results: FileResult[] = [];
    const failures: FileFailure[] = [];
    try {
      for (const [index, entry] of batchValid.entries()) {
        const output: OutputSpec = {
          ...spec,
          mode: 'custom',
          dir,
          filename: safeFilename(entry.line),
        };
        try {
          if (format === 'png') {
            const bytes = await canvasToBytes(renderCanvas(entry.validation.text));
            results.push(await saveBytes(bytes, { source: null, output, ext: 'png' }));
          } else {
            const svg = withExplicitSize(toSVG(bwipOptions(symbology, entry.validation.text, options)));
            results.push(await saveText(svg, { source: null, output, ext: 'svg' }));
          }
        } catch (err) {
          failures.push({
            path: entry.line,
            name: entry.line,
            message: humanizeBwipError(err),
          });
        }
        setProgress({ done: index + 1, total: batchValid.length });
      }
      for (const entry of batchInvalid) {
        failures.push({
          path: entry.line,
          name: entry.line,
          message: entry.validation.message ?? 'This value is not valid for the chosen barcode type.',
        });
      }
      setBatchResult({ results, failures, cancelled: false, elapsedMs: Date.now() - started });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const batchReady = Boolean(dir) && batchValid.length > 0;

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Barcode"
            actions={
              <Segmented
                value={mode}
                onChange={setMode}
                size="sm"
                options={[
                  { value: 'single', label: 'One code' },
                  { value: 'batch', label: 'Batch' },
                ]}
              />
            }
          >
            <div className="space-y-3">
              <Field label="Barcode type" hint={symbology.hint}>
                <Select
                  value={symbologyId}
                  onChange={(e) => setSymbologyId(e.target.value as SymbologyId)}
                  options={SYMBOLOGIES.map((s) => ({ value: s.id, label: s.label }))}
                />
              </Field>

              {mode === 'single' ? (
                <Field
                  label="Value"
                  hint={
                    <button
                      type="button"
                      onClick={() => setValue(symbology.sample)}
                      className="text-accent underline underline-offset-2"
                    >
                      Use the example {symbology.sample}
                    </button>
                  }
                >
                  <Input
                    value={value}
                    placeholder={symbology.sample}
                    onChange={(e) => setValue(e.target.value)}
                    className="font-mono"
                    autoFocus
                  />
                </Field>
              ) : (
                <Field label="Values" hint="One per line. Blank lines and repeats are ignored.">
                  <Textarea
                    value={batchText}
                    rows={8}
                    placeholder={`${symbology.sample}\n${symbology.sample}`}
                    onChange={(e) => setBatchText(e.target.value)}
                  />
                </Field>
              )}

              {mode === 'batch' && batchLines.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">{batchValid.length} ready</Badge>
                  {batchInvalid.length > 0 && <Badge tone="danger">{batchInvalid.length} with problems</Badge>}
                </div>
              )}

              {mode === 'batch' && batchInvalid.length > 0 && (
                <Alert tone="warn" title="These lines will be skipped">
                  <ul className="mt-1 space-y-0.5">
                    {batchInvalid.slice(0, 5).map((entry) => (
                      <li key={entry.line} className="truncate">
                        <span className="font-mono">{entry.line}</span> — {entry.validation.message}
                      </li>
                    ))}
                    {batchInvalid.length > 5 && <li>…and {batchInvalid.length - 5} more.</li>}
                  </ul>
                </Alert>
              )}

              {!untouched && !validation.ok && (
                <Alert
                  tone="danger"
                  title="This value cannot be encoded"
                  action={
                    validation.fix ? (
                      <Button size="sm" onClick={applyFix}>
                        {validation.fix.label}
                      </Button>
                    ) : undefined
                  }
                >
                  {validation.message}
                </Alert>
              )}

              {validation.ok && validation.note && (
                <Alert
                  tone="info"
                  action={
                    validation.fix ? (
                      <Button size="sm" onClick={applyFix}>
                        {validation.fix.label}
                      </Button>
                    ) : undefined
                  }
                >
                  {validation.note}
                </Alert>
              )}
            </div>
          </Section>

          <Section
            title="Preview"
            description={validation.ok ? `${symbology.label} · ${validation.text}` : undefined}
          >
            {untouched ? (
              <EmptyState
                icon="Barcode"
                title="Type a value to see the barcode"
                description={symbology.hint}
              />
            ) : validation.ok ? (
              // The canvas stays mounted while the value is valid — hidden
              // rather than unmounted — so a refused value can redraw itself as
              // soon as the value or the appearance changes.
              <div className="space-y-3">
                <div
                  className={`checkerboard flex items-center justify-center overflow-auto rounded-lg border border-line p-4${
                    renderError ? ' hidden' : ''
                  }`}
                >
                  <canvas ref={canvasRef} className="max-w-full" />
                </div>
                {renderError && <Alert tone="danger" title="The renderer refused this value">{renderError}</Alert>}
              </div>
            ) : (
              <EmptyState icon="Barcode" title="Fix the value above to see the barcode" />
            )}
          </Section>

          {batchResult && <ResultPanel result={batchResult} onProcessAgain={() => setBatchResult(null)} />}
        </>
      }
      aside={
        <>
          <Section title="Appearance">
            <div className="space-y-3">
              <Field label={`Scale — ${options.scale}×`} hint="Bigger scales print more reliably.">
                <Slider min={1} max={8} value={options.scale} onChange={(scale) => setOption({ scale })} />
              </Field>

              {!symbology.twoDimensional && (
                <>
                  <Field label={`Bar height — ${options.barHeight} mm`}>
                    <Slider
                      min={4}
                      max={50}
                      value={options.barHeight}
                      onChange={(barHeight) => setOption({ barHeight })}
                    />
                  </Field>
                  <Field inline label="Human-readable text" hint="Print the value under the bars">
                    <Switch
                      checked={options.includeText}
                      onCheckedChange={(includeText) => setOption({ includeText })}
                    />
                  </Field>
                </>
              )}

              <Field label="Bars and text">
                <ColorInput value={options.foreground} onChange={(foreground) => setOption({ foreground })} />
              </Field>

              <Field inline label="Transparent background" hint="Leave the backdrop empty">
                <Switch
                  checked={options.transparent}
                  onCheckedChange={(transparent) => setOption({ transparent })}
                />
              </Field>

              {!options.transparent && (
                <Field label="Background">
                  <ColorInput value={options.background} onChange={(background) => setOption({ background })} />
                </Field>
              )}
            </div>
          </Section>

          {mode === 'single' ? (
            <Section title="Export">
              <div className="space-y-3">
                <OptionsGrid>
                  <Button
                    icon="Download"
                    loading={busy === 'png'}
                    disabled={!validation.ok || Boolean(renderError) || Boolean(busy)}
                    onClick={savePng}
                  >
                    Save PNG
                  </Button>
                  <Button
                    icon="Download"
                    loading={busy === 'svg'}
                    disabled={!validation.ok || Boolean(renderError) || Boolean(busy)}
                    onClick={saveSvg}
                  >
                    Save SVG
                  </Button>
                </OptionsGrid>
                <Button
                  variant="secondary"
                  icon={copied ? 'Check' : 'Copy'}
                  full
                  loading={busy === 'copy'}
                  disabled={!validation.ok || Boolean(renderError) || Boolean(busy)}
                  onClick={copyImage}
                >
                  {copied ? 'Image copied' : 'Copy image to clipboard'}
                </Button>
                {exportError && <Alert tone="danger">{exportError}</Alert>}
                {saved && (
                  <Alert
                    tone="success"
                    title={`Saved ${saved.name}`}
                    action={
                      <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(saved.path)}>
                        Reveal
                      </Button>
                    }
                  >
                    {formatBytes(saved.size)} · {shortenPath(dirname(saved.path), 2)}
                  </Alert>
                )}
              </div>
            </Section>
          ) : (
            <Section title="Batch export">
              <div className="space-y-3">
                <Field label="File format">
                  <Segmented
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'png', label: 'PNG' },
                      { value: 'svg', label: 'SVG' },
                    ]}
                    className="w-full"
                  />
                </Field>
                <p className="text-[11.5px] text-ink-faint">
                  Each file is named after the value it encodes.
                </p>
                <Field label="Where to save">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                      <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                      <span className="truncate text-[12.5px] text-ink-soft" title={dir ?? ''}>
                        {dir ? shortenPath(dir, 3) : 'No folder chosen'}
                      </span>
                    </div>
                    <Button size="sm" onClick={() => void pickFolder()}>
                      Browse
                    </Button>
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name suffix" hint="Added before the extension">
                    <Input
                      value={spec.suffix ?? ''}
                      placeholder="-label"
                      onChange={(e) => update({ suffix: e.target.value || null })}
                    />
                  </Field>
                  <Field label="If the file exists">
                    <Select
                      value={spec.collision}
                      onChange={(e) => update({ collision: e.target.value as OutputSpec['collision'] })}
                      options={[
                        { value: 'rename', label: 'Keep both (file_1)' },
                        { value: 'skip', label: 'Skip the file' },
                        { value: 'overwrite', label: 'Replace it' },
                      ]}
                    />
                  </Field>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  icon="Barcode"
                  full
                  loading={busy === 'batch'}
                  disabled={!batchReady || Boolean(busy)}
                  onClick={() => void generateBatch()}
                >
                  Generate {batchValid.length || ''} barcode{batchValid.length === 1 ? '' : 's'}
                </Button>
                {!batchReady && !busy && (
                  <p className="text-[11.5px] text-ink-faint">
                    {batchValid.length === 0
                      ? 'Add at least one valid value above.'
                      : 'Choose the folder the files should go into.'}
                  </p>
                )}
                {progress && (
                  <div className="space-y-1">
                    <Progress value={progress.total ? progress.done / progress.total : null} />
                    <p className="text-[11.5px] text-ink-faint">
                      {progress.done} of {progress.total} written
                    </p>
                  </div>
                )}
                {exportError && <Alert tone="danger">{exportError}</Alert>}
              </div>
            </Section>
          )}
        </>
      }
    />
  );
}
