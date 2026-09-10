import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { revealInFinder } from '@/core/bridge';
import { dirname, formatBytes, shortenPath } from '@/core/format';
import { canvasToBytes, saveAs, saveTextAs } from '@/core/save';
import type { FileResult } from '@/core/types';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Alert,
  Button,
  ColorInput,
  CopyButton,
  Field,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Slider,
} from '@/components/ui';
import {
  colorAt,
  cssDeclaration,
  cssGradient,
  paintGradient,
  sortedStops,
  svgGradient,
  type GradientSpec,
  type GradientType,
  type RadialShape,
} from './logic';

const PRESETS: Array<{ label: string; colors: [string, string]; angle: number }> = [
  { label: 'Dusk', colors: ['#6d4aff', '#00c2ff'], angle: 135 },
  { label: 'Sunset', colors: ['#ff7a45', '#ff2d6f'], angle: 120 },
  { label: 'Mint', colors: ['#0fd6a0', '#0a84ff'], angle: 90 },
  { label: 'Ember', colors: ['#f5c542', '#e2483a'], angle: 160 },
  { label: 'Slate', colors: ['#2b3440', '#6b7684'], angle: 180 },
  { label: 'Blush', colors: ['#ffd3e0', '#b28dff'], angle: 45 },
];

const POSITION_PRESETS: Array<{ label: string; value: { x: number; y: number } }> = [
  { label: 'Centre', value: { x: 50, y: 50 } },
  { label: 'Top left', value: { x: 0, y: 0 } },
  { label: 'Top', value: { x: 50, y: 0 } },
  { label: 'Top right', value: { x: 100, y: 0 } },
  { label: 'Bottom left', value: { x: 0, y: 100 } },
  { label: 'Bottom', value: { x: 50, y: 100 } },
  { label: 'Bottom right', value: { x: 100, y: 100 } },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function GradientGenerator() {
  const [spec, setSpec] = useState<GradientSpec>(() => ({
    type: 'linear',
    angle: 135,
    shape: 'circle',
    position: { x: 50, y: 50 },
    stops: [
      { id: crypto.randomUUID(), color: '#6d4aff', position: 0 },
      { id: crypto.randomUUID(), color: '#00c2ff', position: 100 },
    ],
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [width, setWidth] = useState(1600);
  const [height, setHeight] = useState(900);
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);

  const css = useMemo(() => cssGradient(spec), [spec]);
  const declaration = useMemo(() => cssDeclaration(spec), [spec]);
  const rampCss = useMemo(
    () =>
      `linear-gradient(to right, ${sortedStops(spec.stops)
        .map((s) => `${s.color} ${Math.round(s.position)}%`)
        .join(', ')})`,
    [spec.stops],
  );

  const patch = (changes: Partial<GradientSpec>) => setSpec((s) => ({ ...s, ...changes }));

  const updateStop = (id: string, changes: { color?: string; position?: number }) =>
    setSpec((s) => ({
      ...s,
      stops: s.stops.map((stop) => (stop.id === id ? { ...stop, ...changes } : stop)),
    }));

  const removeStop = (id: string) =>
    setSpec((s) => (s.stops.length <= 2 ? s : { ...s, stops: s.stops.filter((stop) => stop.id !== id) }));

  const positionFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.round(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  };

  const addStopAt = (clientX: number) => {
    const position = positionFromClientX(clientX);
    const id = crypto.randomUUID();
    const color = colorAt(spec.stops, position);
    setSpec((s) => ({ ...s, stops: [...s.stops, { id, color, position }] }));
    setSelectedId(id);
  };

  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = id;
    setSelectedId(id);
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    updateStop(dragging.current, { position: positionFromClientX(event.clientX) });
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragging.current = null;
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) =>
    setSpec((s) => ({
      ...s,
      angle: preset.angle,
      stops: [
        { id: crypto.randomUUID(), color: preset.colors[0], position: 0 },
        { id: crypto.randomUUID(), color: preset.colors[1], position: 100 },
      ],
    }));

  const runExport = async (label: string, task: () => Promise<FileResult | null>) => {
    setBusy(label);
    setError(null);
    setSaved(null);
    try {
      const result = await task();
      if (result) setSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const savePng = () =>
    void runExport('png', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This Mac would not give us a drawing surface, so the PNG could not be made.');
      paintGradient(ctx, spec, canvas.width, canvas.height);
      return saveAs(await canvasToBytes(canvas), `gradient-${canvas.width}x${canvas.height}.png`);
    });

  const saveSvg = () =>
    void runExport('svg', async () =>
      saveTextAs(
        svgGradient(spec, Math.max(1, Math.round(width)), Math.max(1, Math.round(height))),
        `gradient-${Math.round(width)}x${Math.round(height)}.svg`,
      ),
    );

  const ordered = sortedStops(spec.stops);

  return (
    <ToolShell
      main={
        <>
          <Section title="Preview" description="Exactly what the CSS below renders.">
            <div className="space-y-4">
              <div
                className="h-64 rounded-lg border border-line"
                style={{ backgroundImage: css }}
                aria-label="Gradient preview"
              />

              <div>
                <div
                  ref={trackRef}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) addStopAt(event.clientX);
                  }}
                  className="relative h-9 cursor-copy rounded-lg border border-line"
                  style={{ backgroundImage: rampCss }}
                  title="Click to add a stop, drag a handle to move it"
                >
                  {spec.stops.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      onPointerDown={(event) => onHandleDown(event, stop.id)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                      aria-label={`Stop at ${Math.round(stop.position)} percent`}
                      className={`absolute top-1/2 h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-[5px] border-2 shadow-[0_1px_3px_rgba(0,0,0,0.3)] ${
                        selectedId === stop.id ? 'border-ink' : 'border-white'
                      }`}
                      style={{ left: `${stop.position}%`, background: stop.color }}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-faint">
                  Click the bar to add a stop, drag a handle to move it.
                </p>
              </div>

              <div className="space-y-2">
                {ordered.map((stop) => (
                  <div
                    key={stop.id}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                      selectedId === stop.id ? 'border-line-strong bg-canvas' : 'border-line'
                    }`}
                    onFocus={() => setSelectedId(stop.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <ColorInput value={stop.color} onChange={(color) => updateStop(stop.id, { color })} />
                    </div>
                    <div className="w-24 shrink-0">
                      <NumberInput
                        value={Math.round(stop.position)}
                        min={0}
                        max={100}
                        suffix="%"
                        onValueChange={(position) => updateStop(stop.id, { position: clamp(position, 0, 100) })}
                      />
                    </div>
                    <IconButton
                      icon="Trash2"
                      label="Remove this stop"
                      size="sm"
                      disabled={spec.stops.length <= 2}
                      onClick={() => removeStop(stop.id)}
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  icon="Plus"
                  onClick={() =>
                    setSpec((s) => ({
                      ...s,
                      stops: [...s.stops, { id: crypto.randomUUID(), color: colorAt(s.stops, 50), position: 50 }],
                    }))
                  }
                >
                  Add a stop
                </Button>
              </div>
            </div>
          </Section>

          <Section title="CSS" actions={<CopyButton value={() => declaration} label="Copy" />}>
            <pre className="selectable overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-3 font-mono text-[12px] leading-[1.6] text-ink">
              {declaration}
            </pre>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Type">
            <div className="space-y-3">
              <Segmented
                value={spec.type}
                onChange={(type: GradientType) => patch({ type })}
                options={[
                  { value: 'linear', label: 'Linear' },
                  { value: 'radial', label: 'Radial' },
                  { value: 'conic', label: 'Conic' },
                ]}
                className="w-full"
              />

              {spec.type !== 'radial' && (
                <Field
                  label={`${spec.type === 'conic' ? 'Start angle' : 'Angle'} — ${Math.round(spec.angle)}°`}
                  hint="0° points to the top and turns clockwise, as CSS does."
                >
                  <Slider min={0} max={360} value={spec.angle} onChange={(angle) => patch({ angle })} />
                </Field>
              )}

              {spec.type === 'radial' && (
                <Field label="Shape">
                  <Segmented
                    value={spec.shape}
                    onChange={(shape: RadialShape) => patch({ shape })}
                    options={[
                      { value: 'circle', label: 'Circle' },
                      { value: 'ellipse', label: 'Ellipse' },
                    ]}
                    className="w-full"
                  />
                </Field>
              )}

              {spec.type !== 'linear' && (
                <>
                  <Field label="Centre">
                    <PresetRow
                      presets={POSITION_PRESETS}
                      active={spec.position}
                      onSelect={(position) => patch({ position })}
                    />
                  </Field>
                  <OptionsGrid>
                    <Field label={`X — ${Math.round(spec.position.x)}%`}>
                      <Slider
                        min={0}
                        max={100}
                        value={spec.position.x}
                        onChange={(x) => patch({ position: { ...spec.position, x } })}
                      />
                    </Field>
                    <Field label={`Y — ${Math.round(spec.position.y)}%`}>
                      <Slider
                        min={0}
                        max={100}
                        value={spec.position.y}
                        onChange={(y) => patch({ position: { ...spec.position, y } })}
                      />
                    </Field>
                  </OptionsGrid>
                </>
              )}
            </div>
          </Section>

          <Section title="Presets" description="Two-stop starting points.">
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="h-9 rounded-lg border border-line text-[12px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                  style={{
                    backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.colors[0]}, ${preset.colors[1]})`,
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Export">
            <div className="space-y-3">
              <OptionsGrid>
                <Field label="Width">
                  <NumberInput value={width} min={1} max={8000} suffix="px" onValueChange={setWidth} />
                </Field>
                <Field label="Height">
                  <NumberInput value={height} min={1} max={8000} suffix="px" onValueChange={setHeight} />
                </Field>
              </OptionsGrid>
              <div className="grid grid-cols-2 gap-2">
                <Button icon="Download" loading={busy === 'png'} disabled={Boolean(busy)} onClick={savePng}>
                  PNG
                </Button>
                <Button icon="Download" loading={busy === 'svg'} disabled={Boolean(busy)} onClick={saveSvg}>
                  SVG
                </Button>
              </div>
              {spec.type === 'conic' && (
                <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                  SVG has no conic gradient, so that export approximates it with 360 wedges. The PNG is exact
                  wherever the system supports conic gradients.
                </p>
              )}
              {error && <Alert tone="danger">{error}</Alert>}
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
        </>
      }
    />
  );
}
