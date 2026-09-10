import { useEffect, useMemo, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import { canvasToBytes, saveAs, saveTextAs } from '@/core/save';
import type { BatchResult, ToolboxError } from '@/core/types';
import type { ToolRun } from '@/core/useToolRun';
import { ErrorDisplay, OptionsGrid, PresetRow, ResultPanel, ToolActions, ToolShell } from '@/components/tool';
import {
  Button,
  ColorInput,
  CopyButton,
  Field,
  Input,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  Spinner,
} from '@/components/ui';
import {
  DEFAULT_ICON,
  FONTS,
  GLYPHS,
  SHAPES,
  buildIconSvg,
  iconFileName,
  type ForegroundKind,
  type IconOptions,
  type ShapeId,
} from './logic';

const SIZE_PRESETS = [64, 128, 256, 512, 1024].map((n) => ({ label: String(n), value: n }));
const PNG_SIZES = [64, 128, 256, 512, 1024, 2048].map((n) => ({ value: String(n), label: `${n} × ${n}` }));
const WEIGHTS = [400, 500, 600, 700, 800, 900].map((n) => ({ value: String(n), label: String(n) }));
const ANGLES = [
  { label: '→', value: 0 },
  { label: '↘', value: 45 },
  { label: '↓', value: 90 },
  { label: '↗', value: 315 },
];

/** Draw the SVG into a canvas at an exact pixel size and hand back PNG bytes. */
async function rasterize(svg: string, size: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.width = size;
    image.height = size;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The icon could not be rendered as an image, so the PNG was not written.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This window cannot draw to a canvas, so PNG export is unavailable.');
    context.drawImage(image, 0, 0, size, size);
    return await canvasToBytes(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function IconPreview({ svg, size, className }: { svg: string; size: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [svg]);
  if (!url) return <Spinner />;
  return <img src={url} alt="Icon preview" width={size} height={size} className={className} style={{ width: size, height: size }} />;
}

export default function SvgIconGenerator() {
  const [options, setOptions] = useState<IconOptions>(DEFAULT_ICON);
  const [pngSize, setPngSize] = useState('512');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const svg = useMemo(() => buildIconSvg(options), [options]);
  const set = <K extends keyof IconOptions>(key: K, value: IconOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const run: ToolRun = {
    running: busy,
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
    cancel: () => setBusy(false),
    reset: () => {
      setResult(null);
      setError(null);
    },
  };

  const finish = (saved: Awaited<ReturnType<typeof saveTextAs>>, started: number, note: string) => {
    if (!saved) return;
    setResult({
      results: [{ ...saved, note }],
      failures: [],
      cancelled: false,
      elapsedMs: Date.now() - started,
    });
  };

  const exportSvg = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      finish(await saveTextAs(svg, `${iconFileName(options)}.svg`), started, `${options.size} × ${options.size}`);
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setBusy(false);
    }
  };

  const exportPng = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      const size = Number(pngSize);
      const bytes = await rasterize(buildIconSvg({ ...options, size }), size);
      finish(await saveAs(bytes, `${iconFileName(options)}-${size}.png`), started, `${size} × ${size} PNG`);
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
          <Section
            title="Preview"
            description="Drawn on a 100 × 100 grid, so it stays sharp at any size"
            actions={<CopyButton value={() => svg} label="Copy SVG" size="sm" variant="ghost" />}
          >
            <div className="checkerboard flex items-center justify-center rounded-lg border border-line p-6">
              <IconPreview svg={svg} size={256} className="rounded-[2px]" />
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-5">
              {[16, 24, 32, 48, 64].map((size) => (
                <figure key={size} className="flex flex-col items-center gap-1.5">
                  <IconPreview svg={svg} size={size} />
                  <figcaption className="text-[11px] text-ink-faint">{size}px</figcaption>
                </figure>
              ))}
              <p className="ml-auto max-w-[220px] text-[11.5px] text-ink-faint">
                Small sizes are where an icon fails first — check the initials are still readable at 16px.
              </p>
            </div>
          </Section>

          <Section title="SVG source" dense>
            <pre className="selectable max-h-48 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11.5px] leading-[1.55] text-ink-soft">
              {svg}
            </pre>
          </Section>

          {run.error && <ErrorDisplay error={run.error} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Icon exported" />}
        </>
      }
      aside={
        <>
          <Section title="Shape">
            <div className="space-y-3">
              <Select
                value={options.shape}
                onChange={(e) => set('shape', e.target.value as ShapeId)}
                options={SHAPES.map((s) => ({ value: s.id, label: s.label }))}
              />
              {options.shape === 'rounded' && (
                <Field label={`Corner radius — ${options.radius}`}>
                  <Slider min={0} max={50} value={options.radius} onChange={(v) => set('radius', v)} />
                </Field>
              )}
              <Field label={`Padding — ${options.padding}%`} hint="Space between the edge and the foreground">
                <Slider min={0} max={40} value={options.padding} onChange={(v) => set('padding', v)} />
              </Field>
            </div>
          </Section>

          {options.shape !== 'none' && (
            <Section title="Fill">
              <div className="space-y-3">
                <Segmented
                  value={options.fillKind}
                  onChange={(v) => set('fillKind', v)}
                  options={[
                    { value: 'solid', label: 'Solid' },
                    { value: 'gradient', label: 'Gradient' },
                  ]}
                  className="w-full"
                />
                {options.fillKind === 'solid' ? (
                  <Field label="Colour">
                    <ColorInput value={options.color} onChange={(v) => set('color', v)} />
                  </Field>
                ) : (
                  <>
                    <Field label="From">
                      <ColorInput value={options.from} onChange={(v) => set('from', v)} />
                    </Field>
                    <Field label="To">
                      <ColorInput value={options.to} onChange={(v) => set('to', v)} />
                    </Field>
                    <Field label={`Direction — ${options.angle}°`}>
                      <div className="space-y-2">
                        <Slider min={0} max={359} value={options.angle} onChange={(v) => set('angle', v)} />
                        <PresetRow presets={ANGLES} active={options.angle} onSelect={(v) => set('angle', v)} />
                      </div>
                    </Field>
                  </>
                )}
              </div>
            </Section>
          )}

          <Section title="Foreground">
            <div className="space-y-3">
              <Segmented
                value={options.foreground}
                onChange={(v: ForegroundKind) => set('foreground', v)}
                options={[
                  { value: 'initials', label: 'Initials' },
                  { value: 'emoji', label: 'Emoji' },
                  { value: 'glyph', label: 'Glyph' },
                ]}
                className="w-full"
              />

              {options.foreground === 'glyph' ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {GLYPHS.map((glyph) => (
                    <button
                      key={glyph.id}
                      type="button"
                      title={glyph.label}
                      aria-label={glyph.label}
                      aria-pressed={options.glyph === glyph.id}
                      onClick={() => set('glyph', glyph.id)}
                      className={`flex h-11 items-center justify-center rounded-lg border transition-colors ${
                        options.glyph === glyph.id
                          ? 'border-ink bg-ink text-panel'
                          : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                        <path
                          d={glyph.d}
                          fill={glyph.mode === 'fill' ? 'currentColor' : 'none'}
                          stroke={glyph.mode === 'stroke' ? 'currentColor' : 'none'}
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                <Field
                  label={options.foreground === 'emoji' ? 'Emoji' : 'Initials'}
                  hint={options.foreground === 'emoji' ? 'The first emoji is used' : 'One to three characters'}
                >
                  <Input
                    value={options.text}
                    onChange={(e) => set('text', e.target.value)}
                    maxLength={options.foreground === 'emoji' ? 8 : 6}
                    placeholder={options.foreground === 'emoji' ? '🎉' : 'AB'}
                  />
                </Field>
              )}

              {options.foreground !== 'emoji' && (
                <Field label="Colour">
                  <ColorInput value={options.fgColor} onChange={(v) => set('fgColor', v)} />
                </Field>
              )}

              {options.foreground === 'initials' && (
                <OptionsGrid cols={2}>
                  <Field label="Typeface">
                    <Select
                      value={options.font}
                      onChange={(e) => set('font', e.target.value)}
                      options={FONTS.map((f) => ({ value: f.id, label: f.label }))}
                    />
                  </Field>
                  <Field label="Weight">
                    <Select
                      value={String(options.fontWeight)}
                      onChange={(e) => set('fontWeight', Number(e.target.value))}
                      options={WEIGHTS}
                    />
                  </Field>
                </OptionsGrid>
              )}

              <Field label={`Size — ${Math.round(options.scale * 100)}%`}>
                <Slider min={0.4} max={1.6} step={0.05} value={options.scale} onChange={(v) => set('scale', v)} />
              </Field>
            </div>
          </Section>

          <Section title="Export">
            <div className="space-y-3">
              <Field label="SVG size" hint="Written as width and height; the drawing scales freely">
                <div className="space-y-2">
                  <NumberInput
                    value={options.size}
                    min={1}
                    max={4096}
                    step={1}
                    suffix="px"
                    onValueChange={(v) => set('size', v)}
                  />
                  <PresetRow presets={SIZE_PRESETS} active={options.size} onSelect={(v) => set('size', v)} />
                </div>
              </Field>
              <Field label="PNG size">
                <Select value={pngSize} onChange={(e) => setPngSize(e.target.value)} options={PNG_SIZES} />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                icon="RotateCcw"
                onClick={() => setOptions(DEFAULT_ICON)}
                disabled={JSON.stringify(options) === JSON.stringify(DEFAULT_ICON)}
              >
                Reset to defaults
              </Button>
            </div>
          </Section>

          <ToolActions run={run} onRun={() => void exportSvg()} label="Export SVG" icon="Download">
            <Button size="lg" icon="Image" onClick={() => void exportPng()} disabled={busy}>
              Export PNG
            </Button>
          </ToolActions>
        </>
      }
    />
  );
}
