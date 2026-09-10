import { readTextFile } from '@tauri-apps/plugin-fs';
import { useEffect, useMemo, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import { saveText } from '@/core/save';
import type { BatchResult, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import type { ToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import {
  Alert,
  Button,
  ColorInput,
  Field,
  NumberInput,
  Section,
  Segmented,
  Slider,
  Spinner,
} from '@/components/ui';
import { applyBackground, coverageOf, hasToolboxBackground, num, removeBackground } from './logic';

const ANGLES = [
  { label: '→', value: 0, hint: 'Left to right' },
  { label: '↘', value: 45, hint: 'Top left to bottom right' },
  { label: '↓', value: 90, hint: 'Top to bottom' },
  { label: '↙', value: 135, hint: 'Top right to bottom left' },
  { label: '←', value: 180, hint: 'Right to left' },
  { label: '↑', value: 270, hint: 'Bottom to top' },
];

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

function Preview({ svg, label }: { svg: string | null; label: string }) {
  const url = useBlobUrl(svg);
  return (
    <figure className="space-y-1.5">
      <div className="checkerboard flex h-64 items-center justify-center overflow-hidden rounded-lg border border-line p-3">
        {url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" /> : <Spinner />}
      </div>
      <figcaption className="text-[11.5px] text-ink-faint">{label}</figcaption>
    </figure>
  );
}

export default function AddSvgBackground() {
  const files = useToolFiles({ extensions: ['svg'], kinds: ['svg'], filterName: 'SVG files', multiple: false });
  const { spec, update } = useOutputSpec({ suffix: '-bg' });

  const [source, setSource] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [kind, setKind] = useState<'solid' | 'gradient'>('solid');
  const [color, setColor] = useState('#ffffff');
  const [from, setFrom] = useState('#6366f1');
  const [to, setTo] = useState('#ec4899');
  const [angle, setAngle] = useState(90);
  const [radius, setRadius] = useState(0);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;

  useEffect(() => {
    let alive = true;
    setSource(null);
    setReadError(null);
    setResult(null);
    setError(null);
    setRadius(0);
    if (!path) return;
    readTextFile(path)
      .then((text) => {
        if (!alive) return;
        if (!coverageOf(text)) {
          setReadError('No <svg> element was found in this file, so there is nothing to put a background behind.');
          return;
        }
        setSource(text);
      })
      .catch(() => {
        if (alive) setReadError('That file could not be read as text. An SVG is XML — a binary or damaged file cannot be edited here.');
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const coverage = useMemo(() => (source ? coverageOf(source) : null), [source]);
  const output = useMemo(
    () => (source ? applyBackground(source, { kind, color, from, to, angle, radius }) : null),
    [source, kind, color, from, to, angle, radius],
  );
  const original = useMemo(() => (source ? removeBackground(source) : null), [source]);

  const maxRadius = coverage?.box ? Math.round(Math.min(coverage.box.width, coverage.box.height) / 2) : 100;

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
      const saved = await saveText(output, { source: path, output: spec, ext: 'svg' });
      setResult({
        results: [
          {
            ...saved,
            sourceSize: file.size,
            note: kind === 'solid' ? `solid ${color}` : `gradient ${from} → ${to}`,
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

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an SVG here"
            hint="A rectangle covering the viewBox goes in behind the artwork — nothing else is touched"
          />
          {readError && <Alert tone="danger">{readError}</Alert>}

          {source && (
            <Section
              title="Preview"
              description={
                coverage?.fluid
                  ? 'No viewBox or size — the rectangle covers 100% × 100% of the viewport instead'
                  : coverage?.box
                    ? `Covering ${num(coverage.box.width, 2)} × ${num(coverage.box.height, 2)} user units`
                    : undefined
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Preview svg={original} label="Original" />
                <Preview svg={output} label="With background" />
              </div>
            </Section>
          )}

          {source && hasToolboxBackground(source) && (
            <Alert tone="info" title="This file already has a Toolbox background">
              It is replaced rather than stacked, so the colours below are the ones you end up with.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="SVG saved" />}
        </>
      }
      aside={
        <>
          <Section title="Background">
            <div className="space-y-3">
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'solid', label: 'Solid colour' },
                  { value: 'gradient', label: 'Gradient' },
                ]}
                className="w-full"
              />

              {kind === 'solid' ? (
                <Field label="Colour" hint="Any CSS colour — hex, rgb() or a keyword">
                  <ColorInput value={color} onChange={setColor} />
                </Field>
              ) : (
                <>
                  <Field label="From">
                    <ColorInput value={from} onChange={setFrom} />
                  </Field>
                  <Field label="To">
                    <ColorInput value={to} onChange={setTo} />
                  </Field>
                  <Field label={`Direction — ${angle}°`} hint="0° runs left to right, 90° top to bottom">
                    <div className="space-y-2">
                      <Slider min={0} max={359} value={angle} onChange={setAngle} />
                      <div className="flex items-center gap-2">
                        <PresetRow presets={ANGLES} active={angle} onSelect={setAngle} />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="Repeat"
                          title="Swap the two colours"
                          onClick={() => {
                            setFrom(to);
                            setTo(from);
                          }}
                        >
                          Swap
                        </Button>
                      </div>
                    </div>
                  </Field>
                </>
              )}

              <Field
                label="Corner radius"
                hint={coverage?.fluid ? 'In user units' : `In user units — up to ${maxRadius} rounds it to a circle`}
              >
                <div className="flex items-center gap-2">
                  <Slider min={0} max={maxRadius} value={Math.min(radius, maxRadius)} onChange={setRadius} />
                  <NumberInput value={radius} min={0} step={1} onValueChange={setRadius} className="w-20 shrink-0" />
                </div>
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Save with background"
            icon="Download"
            disabled={!output}
            disabledReason="Add an SVG first."
          />
        </>
      }
    />
  );
}
