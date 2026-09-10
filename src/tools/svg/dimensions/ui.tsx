import { readTextFile } from '@tauri-apps/plugin-fs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import { saveText } from '@/core/save';
import type { BatchResult, ToolboxError } from '@/core/types';
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
  Button,
  Field,
  Icon,
  NumberInput,
  Section,
  Segmented,
  Select,
  Spinner,
  Stat,
} from '@/components/ui';
import {
  UNITS,
  applyDimensions,
  aspectRatio,
  formatNumber,
  lockedCounterpart,
  readDimensions,
  type SvgDimensions,
} from './logic';

const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u === '' ? 'user units' : u }));
const SIZE_PRESETS = [16, 24, 32, 48, 64, 128, 256, 512].map((n) => ({ label: String(n), value: n }));

type Mode = 'size' | 'fluid';

export default function SvgDimensionEditor() {
  const files = useToolFiles({ extensions: ['svg'], kinds: ['svg'], filterName: 'SVG files', multiple: false });
  const { spec, update } = useOutputSpec({ suffix: '-resized' });

  const [source, setSource] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('size');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [unit, setUnit] = useState('');
  const [locked, setLocked] = useState(true);
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;

  /**
   * The ratio the lock works from. It is remembered rather than recomputed from
   * the two live fields, so emptying one of them (which NumberInput reports as
   * 0) cannot destroy it and leave the lock permanently dead.
   */
  const ratioRef = useRef<number | null>(null);

  const seed = useCallback((dimensions: SvgDimensions | null) => {
    if (!dimensions) return;
    let nextWidth = 100;
    let nextHeight = 100;
    let nextUnit = '';
    if (dimensions.width && dimensions.height) {
      nextWidth = dimensions.width.value;
      nextHeight = dimensions.height.value;
      nextUnit = dimensions.width.unit === dimensions.height.unit ? dimensions.width.unit : '';
    } else if (dimensions.viewBox) {
      nextWidth = dimensions.viewBox.width;
      nextHeight = dimensions.viewBox.height;
    }
    setWidth(nextWidth);
    setHeight(nextHeight);
    setUnit(nextUnit);
    // Match what is on screen; fall back to the ratio the file implies.
    ratioRef.current =
      nextWidth > 0 && nextHeight > 0 ? nextWidth / nextHeight : aspectRatio(dimensions);
    setMode('size');
  }, []);

  useEffect(() => {
    let alive = true;
    setSource(null);
    setReadError(null);
    setResult(null);
    setError(null);
    if (!path) return;
    readTextFile(path)
      .then((text) => {
        if (!alive) return;
        const dimensions = readDimensions(text);
        if (!dimensions) {
          setReadError('No <svg> element was found in this file, so there is nothing to resize.');
          return;
        }
        setSource(text);
        seed(dimensions);
      })
      .catch(() => {
        if (alive) setReadError('That file could not be read as text. An SVG is XML — a binary or damaged file cannot be edited here.');
      });
    return () => {
      alive = false;
    };
  }, [path, seed]);

  const original = useMemo(() => (source ? readDimensions(source) : null), [source]);

  const output = useMemo(() => {
    if (!source) return null;
    if (mode === 'fluid') return applyDimensions(source, null);
    if (width <= 0 || height <= 0) return null;
    return applyDimensions(source, { width: { value: width, unit }, height: { value: height, unit } });
  }, [source, mode, width, height, unit]);

  useEffect(() => {
    setBroken(false);
    if (!output) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([output], { type: 'image/svg+xml' }));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [output]);

  const changeWidth = (value: number) => {
    setWidth(value);
    // An empty field arrives as 0. Show it, but never let it drag the partner
    // field — or the stored ratio — down with it.
    if (!Number.isFinite(value) || value <= 0) return;
    const ratio = ratioRef.current;
    if (locked && ratio) setHeight(lockedCounterpart(value, ratio, 'width'));
    else if (height > 0) ratioRef.current = value / height;
  };

  const changeHeight = (value: number) => {
    setHeight(value);
    if (!Number.isFinite(value) || value <= 0) return;
    const ratio = ratioRef.current;
    if (locked && ratio) setWidth(lockedCounterpart(value, ratio, 'height'));
    else if (width > 0) ratioRef.current = width / value;
  };

  const applyPreset = (size: number) => {
    const ratio = ratioRef.current ?? aspectRatio(original) ?? 1;
    ratioRef.current = ratio;
    setUnit('px');
    setWidth(size);
    if (locked) setHeight(lockedCounterpart(size, ratio, 'width'));
  };

  const matchViewBox = () => {
    if (!original?.viewBox) return;
    setUnit('');
    setWidth(original.viewBox.width);
    setHeight(original.viewBox.height);
    ratioRef.current = original.viewBox.width / original.viewBox.height;
    setMode('size');
  };

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
            note: mode === 'fluid' ? 'scales to its container' : `${formatNumber(width)}${unit} × ${formatNumber(height)}${unit}`,
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

  const unchanged = Boolean(source && output && output === source);

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an SVG here"
            hint="The width and height on the root element — the viewBox and the artwork are left alone"
          />
          {readError && <Alert tone="danger">{readError}</Alert>}

          {source && original && (
            <Section
              title="Preview"
              description={
                mode === 'fluid'
                  ? 'No intrinsic size — the SVG fills whatever box it is given'
                  : `Rendered at ${formatNumber(width)}${unit || ' user units'} × ${formatNumber(height)}${unit || ' user units'}`
              }
              actions={
                mode === 'size' ? (
                  <Segmented
                    size="sm"
                    value={zoom}
                    onChange={setZoom}
                    options={[
                      { value: 'fit', label: 'Fit' },
                      { value: 'actual', label: 'Actual size' },
                    ]}
                  />
                ) : undefined
              }
            >
              <div
                className={`checkerboard flex h-72 rounded-lg border border-line p-3 ${
                  mode === 'fluid' ? 'items-stretch' : 'items-center justify-center overflow-auto'
                }`}
              >
                {!previewUrl ? (
                  <Spinner />
                ) : broken ? (
                  <p className="m-auto text-[11.5px] text-ink-faint">This file is not valid SVG, so it cannot be previewed.</p>
                ) : (
                  <img
                    src={previewUrl}
                    alt="Result"
                    onError={() => setBroken(true)}
                    className={
                      mode === 'fluid'
                        ? 'h-full w-full object-contain'
                        : zoom === 'fit'
                          ? 'max-h-full max-w-full object-contain'
                          : 'shrink-0'
                    }
                  />
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat
                  label="Original size"
                  value={
                    original.rawWidth && original.rawHeight ? `${original.rawWidth} × ${original.rawHeight}` : 'not declared'
                  }
                />
                <Stat
                  label="viewBox"
                  value={
                    original.viewBox
                      ? `${formatNumber(original.viewBox.width)} × ${formatNumber(original.viewBox.height)}`
                      : 'none'
                  }
                  hint={original.viewBox ? `origin ${formatNumber(original.viewBox.minX)}, ${formatNumber(original.viewBox.minY)}` : undefined}
                />
                <Stat
                  label="New size"
                  value={mode === 'fluid' ? 'removed' : `${formatNumber(width)}${unit} × ${formatNumber(height)}${unit}`}
                />
                <Stat label="Ratio" value={height > 0 ? `${(width / height).toFixed(3)} : 1` : '—'} />
              </div>
            </Section>
          )}

          {mode === 'fluid' && source && (
            <Alert tone={original?.viewBox ? 'info' : 'warn'} title={original?.viewBox ? 'What removing the size does' : 'This file has no viewBox'}>
              {original?.viewBox ? (
                <>
                  Without <code className="font-mono">width</code> and <code className="font-mono">height</code> the file has
                  no intrinsic size. Placed in an <code className="font-mono">&lt;img&gt;</code>, a CSS background or a React
                  component it stretches to fill its container, and the viewBox keeps the aspect ratio. Some older tools —
                  and email clients — need a declared size and will render it at 300 × 150 instead.
                </>
              ) : (
                <>
                  There is no viewBox to fall back on, so removing the size leaves the renderer nothing to scale: most
                  browsers will draw the file at 300 × 150. Add a viewBox with the ViewBox tool first.
                </>
              )}
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="SVG saved" />}
        </>
      }
      aside={
        <>
          <Section title="Size">
            <div className="space-y-3">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'size', label: 'Fixed size' },
                  { value: 'fluid', label: 'No size' },
                ]}
                className="w-full"
              />

              {mode === 'size' && (
                <>
                  <div className="flex items-end gap-2">
                    <Field label="Width" className="flex-1">
                      <NumberInput value={width} min={0} step={1} onValueChange={changeWidth} />
                    </Field>
                    <Button
                      size="sm"
                      variant={locked ? 'subtle' : 'ghost'}
                      className="mb-0.5"
                      icon={locked ? 'Lock' : 'LockOpen'}
                      title={locked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                      aria-pressed={locked}
                      onClick={() => setLocked((v) => !v)}
                    >
                      {locked ? 'Locked' : 'Free'}
                    </Button>
                    <Field label="Height" className="flex-1">
                      <NumberInput value={height} min={0} step={1} onValueChange={changeHeight} />
                    </Field>
                  </div>

                  <OptionsGrid cols={2}>
                    <Field label="Unit" hint="Bare numbers mean CSS pixels">
                      <Select value={unit} onChange={(e) => setUnit(e.target.value)} options={UNIT_OPTIONS} />
                    </Field>
                    <Field label="From the file">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          icon="Crop"
                          disabled={!original?.viewBox}
                          title={original?.viewBox ? 'Use the viewBox width and height' : 'This file has no viewBox'}
                          onClick={matchViewBox}
                        >
                          viewBox
                        </Button>
                        <Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => seed(original)} disabled={!original}>
                          Reset
                        </Button>
                      </div>
                    </Field>
                  </OptionsGrid>

                  <Field label="Common icon sizes" hint="Sets the width in px; the height follows the ratio">
                    <PresetRow presets={SIZE_PRESETS} onSelect={applyPreset} active={unit === 'px' ? width : undefined} />
                  </Field>
                </>
              )}

              {mode === 'fluid' && (
                <p className="text-[12.5px] text-ink-soft">
                  <Icon name="Info" size={13} className="mr-1 inline align-[-2px] text-ink-faint" />
                  Both attributes are deleted from the root element. Everything else in the file, including the viewBox, stays
                  exactly as it is.
                </p>
              )}
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
                : !output
                  ? 'Width and height must both be greater than zero.'
                  : 'The size already matches the file.'
            }
          />
        </>
      }
    />
  );
}
