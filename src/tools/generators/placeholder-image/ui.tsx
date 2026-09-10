import { useEffect, useRef, useState } from 'react';
import { revealInFinder } from '@/core/bridge';
import { dirname, formatBytes, shortenPath } from '@/core/format';
import { canvasToBytes, saveAs } from '@/core/save';
import type { FileResult } from '@/core/types';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Alert,
  Button,
  ColorInput,
  Field,
  Input,
  NumberInput,
  Section,
  Segmented,
  Slider,
} from '@/components/ui';
import {
  MAX_SIDE,
  PRESETS,
  autoFontSize,
  clampSide,
  defaultLabel,
  drawPlaceholder,
  suggestedFilename,
  type Overlay,
  type PlaceholderSpec,
} from './logic';

export default function PlaceholderImage() {
  const [spec, setSpec] = useState<PlaceholderSpec>({
    width: 1200,
    height: 630,
    background: '#e6e8ec',
    foreground: '#5b6472',
    label: '',
    fontSize: 0,
    overlay: 'none',
    gridSize: 80,
  });
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const set = (patch: Partial<PlaceholderSpec>) => {
    setSpec((s) => ({ ...s, ...patch }));
    setSaved(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = clampSide(spec.width);
    const height = clampSide(spec.height);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('This Mac would not give us a drawing surface, so the preview could not be rendered.');
      return;
    }
    drawPlaceholder(ctx, spec);
    setError(null);
  }, [spec]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('The preview is not ready yet — give it a moment and try again.');
      const result = await saveAs(await canvasToBytes(canvas), suggestedFilename(spec));
      if (result) setSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const automaticSize = autoFontSize(spec.width, spec.height);

  return (
    <ToolShell
      main={
        <Section
          title="Preview"
          description={`${clampSide(spec.width)} × ${clampSide(spec.height)} pixels · drawn here, never fetched`}
          actions={
            <Button size="sm" variant="primary" icon="Download" loading={saving} onClick={() => void save()}>
              Save PNG
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="checkerboard flex items-center justify-center overflow-auto rounded-lg border border-line p-4">
              <canvas ref={canvasRef} className="max-w-full" style={{ height: 'auto' }} />
            </div>
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
      }
      aside={
        <>
          <Section title="Size">
            <div className="space-y-3">
              <PresetRow
                presets={PRESETS.map((p) => ({
                  label: p.label,
                  value: { width: p.width, height: p.height },
                  hint: `${p.width} × ${p.height} — ${p.hint}`,
                }))}
                active={{ width: spec.width, height: spec.height }}
                onSelect={(value) => set(value)}
              />
              <OptionsGrid>
                <Field label="Width">
                  <NumberInput
                    value={spec.width}
                    min={1}
                    max={MAX_SIDE}
                    suffix="px"
                    onValueChange={(width) => set({ width })}
                  />
                </Field>
                <Field label="Height">
                  <NumberInput
                    value={spec.height}
                    min={1}
                    max={MAX_SIDE}
                    suffix="px"
                    onValueChange={(height) => set({ height })}
                  />
                </Field>
              </OptionsGrid>
              <Button
                size="sm"
                icon="Repeat"
                onClick={() => set({ width: spec.height, height: spec.width })}
              >
                Swap width and height
              </Button>
            </div>
          </Section>

          <Section title="Label">
            <div className="space-y-3">
              <Field label="Text" hint={`Empty shows the size: ${defaultLabel(spec.width, spec.height)}`}>
                <Input
                  value={spec.label}
                  placeholder={defaultLabel(spec.width, spec.height)}
                  onChange={(e) => set({ label: e.target.value })}
                />
              </Field>
              <Field
                label={`Font size — ${spec.fontSize > 0 ? `${spec.fontSize} px` : `automatic (${automaticSize} px)`}`}
                hint="Long labels shrink to fit the frame."
              >
                <Slider
                  min={0}
                  max={Math.max(24, Math.round(Math.min(clampSide(spec.width), clampSide(spec.height)) / 2))}
                  value={spec.fontSize}
                  onChange={(fontSize) => set({ fontSize })}
                />
              </Field>
              {spec.fontSize > 0 && (
                <Button size="sm" variant="ghost" onClick={() => set({ fontSize: 0 })}>
                  Back to automatic
                </Button>
              )}
            </div>
          </Section>

          <Section title="Colours">
            <div className="space-y-3">
              <Field label="Background">
                <ColorInput value={spec.background} onChange={(background) => set({ background })} />
              </Field>
              <Field label="Text and lines">
                <ColorInput value={spec.foreground} onChange={(foreground) => set({ foreground })} />
              </Field>
            </div>
          </Section>

          <Section title="Overlay">
            <div className="space-y-3">
              <Segmented
                value={spec.overlay}
                onChange={(overlay: Overlay) => set({ overlay })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'cross', label: 'Cross' },
                  { value: 'grid', label: 'Grid' },
                ]}
                className="w-full"
              />
              {spec.overlay === 'grid' && (
                <Field label={`Grid step — ${spec.gridSize} px`}>
                  <Slider
                    min={8}
                    max={400}
                    step={4}
                    value={spec.gridSize}
                    onChange={(gridSize) => set({ gridSize })}
                  />
                </Field>
              )}
            </div>
          </Section>
        </>
      }
    />
  );
}
