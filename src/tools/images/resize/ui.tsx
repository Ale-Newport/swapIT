import { useEffect, useState } from 'react';
import { call } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
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
import { Alert, Badge, Field, NumberInput, Section, Segmented, Select, Switch } from '@/components/ui';
import { describeProblem, lockedCounterpart, predictSize, type ResizeMode, type Size } from './logic';

const IMAGE_EXTENSIONS = [
  'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif', 'tga', 'qoi',
];

const FORMATS = [
  { value: 'keep', label: 'Keep the original format' },
  { value: 'jpg', label: 'JPEG (.jpg)' },
  { value: 'png', label: 'PNG (.png)' },
  { value: 'webp', label: 'WebP (.webp)' },
];

/**
 * Formats the built-in encoder cannot write. Keeping one of them means the run
 * needs ImageMagick, so the tool says so before the user presses the button.
 */
const NEEDS_IMAGEMAGICK = new Set(['heic', 'heif', 'avif']);

const MODES: Array<{ value: ResizeMode; label: string; hint: string }> = [
  { value: 'fit', label: 'Fit', hint: 'Keeps the aspect ratio and stays inside the box.' },
  { value: 'fill', label: 'Fill', hint: 'Fills the box exactly, cropping the overflow.' },
  { value: 'exact', label: 'Exact', hint: 'Forces the box, stretching the image if needed.' },
  { value: 'percent', label: 'Percent', hint: 'Scales every image by the same percentage.' },
];

const SIZE_PRESETS = [
  { label: '1080p', value: '1920x1080', hint: 'Full HD — 1920 × 1080' },
  { label: '4K', value: '3840x2160', hint: 'Ultra HD — 3840 × 2160' },
  { label: 'IG Post', value: '1080x1080', hint: 'Instagram post — 1080 × 1080' },
  { label: 'IG Story', value: '1080x1920', hint: 'Instagram story — 1080 × 1920' },
  { label: 'X / Twitter', value: '1600x900', hint: 'Twitter / X in-stream — 1600 × 900' },
  { label: 'LinkedIn', value: '1200x627', hint: 'LinkedIn link image — 1200 × 627' },
  { label: 'YT Thumb', value: '1280x720', hint: 'YouTube thumbnail — 1280 × 720' },
];

const PERCENT_PRESETS = [
  { label: '50%', value: 50, hint: 'Half the original size' },
  { label: '25%', value: 25, hint: 'A quarter of the original size' },
];

interface ImageInfoRow {
  width: number;
  height: number;
}

export default function ResizeImage() {
  const files = useToolFiles({ kinds: ['image'], extensions: IMAGE_EXTENSIONS, filterName: 'Images' });
  const run = useToolRun('images/resize', 'Resize Image');
  const { spec, update } = useOutputSpec();

  const [mode, setMode] = useState<ResizeMode>('fit');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [percent, setPercent] = useState(50);
  const [allowUpscale, setAllowUpscale] = useState(false);
  const [lockAspect, setLockAspect] = useState(false);
  const [format, setFormat] = useState('keep');
  const [source, setSource] = useState<Size | null>(null);
  const [sourceUnreadable, setSourceUnreadable] = useState(false);

  const firstPath = files.paths[0] ?? null;

  // Dimensions of the first image drive the aspect lock and the live preview.
  useEffect(() => {
    let alive = true;
    setSourceUnreadable(false);
    if (!firstPath) {
      setSource(null);
      return;
    }
    call<ImageInfoRow[]>('image_info', { inputs: [firstPath] })
      .then((rows) => {
        if (!alive) return;
        const first = rows[0];
        setSource(first ? { width: first.width, height: first.height } : null);
        // A row with no dimensions is just as unreadable as a rejected call.
        setSourceUnreadable(!first);
      })
      .catch(() => {
        if (!alive) return;
        setSource(null);
        setSourceUnreadable(true);
      });
    return () => {
      alive = false;
    };
  }, [firstPath]);

  const settings = { mode, width, height, percent, allowUpscale };
  const problem = describeProblem(settings);
  const predicted = source ? predictSize(source, settings) : null;

  const changeWidth = (value: number) => {
    const next = Math.max(0, Math.round(value));
    setWidth(next);
    if (lockAspect && source) setHeight(lockedCounterpart(source, 'width', next));
  };

  const changeHeight = (value: number) => {
    const next = Math.max(0, Math.round(value));
    setHeight(next);
    if (lockAspect && source) setWidth(lockedCounterpart(source, 'height', next));
  };

  const toggleLock = (on: boolean) => {
    setLockAspect(on);
    if (on && source && width > 0) setHeight(lockedCounterpart(source, 'width', width));
  };

  const applySizePreset = (value: string) => {
    const [w, h] = value.split('x').map(Number);
    setWidth(w);
    setHeight(h);
    setLockAspect(false);
    if (mode === 'percent') setMode('fit');
  };

  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: files.files.length,
      inputs: files.paths,
      label:
        mode === 'percent'
          ? `Resize ${files.files.length} image${files.files.length === 1 ? '' : 's'} to ${percent}%`
          : `Resize ${files.files.length} image${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: {
          resize: {
            width: mode === 'percent' ? undefined : width || undefined,
            height: mode === 'percent' ? undefined : height || undefined,
            mode,
            percent: mode === 'percent' ? percent : undefined,
            allowUpscale,
          },
          format: format === 'keep' ? undefined : format,
        },
        output: spec,
      },
    });

  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0];
  const keepingUnwritable =
    format === 'keep' && files.files.some((f) => NEEDS_IMAGEMAGICK.has(f.extension.toLowerCase()));

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images here"
            hint="Every image gets the same treatment — drop a whole folder if you like"
            accept="JPG, PNG, HEIC, WebP, AVIF, TIFF, BMP, GIF"
            allowFolders
          />
          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Size" description={activeMode.hint}>
            <div className="space-y-3">
              <Segmented
                value={mode}
                onChange={setMode}
                options={MODES.map((m) => ({ value: m.value, label: m.label, title: m.hint }))}
                className="w-full"
              />

              {mode === 'percent' ? (
                <>
                  <Field label="Scale" hint="Applied to each image's own dimensions.">
                    <NumberInput value={percent} onValueChange={setPercent} min={1} max={1000} suffix="%" />
                  </Field>
                  <PresetRow presets={PERCENT_PRESETS} active={percent} onSelect={setPercent} />
                </>
              ) : (
                <>
                  <OptionsGrid>
                    <Field label="Width">
                      <NumberInput value={width} onValueChange={changeWidth} min={0} max={30000} suffix="px" />
                    </Field>
                    <Field label="Height">
                      <NumberInput value={height} onValueChange={changeHeight} min={0} max={30000} suffix="px" />
                    </Field>
                  </OptionsGrid>
                  <Field
                    inline
                    label="Lock aspect ratio"
                    hint={
                      source
                        ? `Matches the first image (${source.width} × ${source.height})`
                        : 'Add an image to read its ratio'
                    }
                  >
                    <Switch checked={lockAspect} onCheckedChange={toggleLock} disabled={!source} />
                  </Field>
                  {mode === 'fit' && (
                    <Field inline label="Allow upscaling" hint="Grow images that are smaller than the box">
                      <Switch checked={allowUpscale} onCheckedChange={setAllowUpscale} />
                    </Field>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Presets">
            <PresetRow
              presets={SIZE_PRESETS}
              active={mode === 'percent' ? '' : `${width}x${height}`}
              onSelect={applySizePreset}
            />
          </Section>

          <Section title="First image" dense>
            {source && predicted ? (
              <div className="flex items-center gap-2 text-[12.5px] text-ink">
                <span className="text-ink-faint">
                  {source.width} × {source.height}
                </span>
                <span className="text-ink-faint">→</span>
                <span className="font-medium">
                  {predicted.width} × {predicted.height}
                </span>
                {predicted.width === source.width && predicted.height === source.height && (
                  <Badge tone="warn">Unchanged</Badge>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-ink-faint">
                {!firstPath
                  ? 'Add an image to see the result size.'
                  : sourceUnreadable
                    ? 'Toolbox could not read this image, so it cannot show the result size. Resizing it will still be attempted.'
                    : 'Reading the image…'}
              </p>
            )}
            {source &&
              predicted &&
              predicted.width === source.width &&
              predicted.height === source.height &&
              mode === 'fit' &&
              !allowUpscale && (
                <Alert tone="info" className="mt-2">
                  This image is already smaller than the box. Turn on upscaling to enlarge it.
                </Alert>
              )}
          </Section>

          <Section title="Output format" description="Resizing re-encodes the pixels either way.">
            <div className="space-y-3">
              <Field label="Format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              {keepingUnwritable && (
                <Alert tone="warn">
                  Writing HEIC, HEIF or AVIF back out needs ImageMagick (
                  <span className="font-mono">brew install imagemagick</span>). Choose PNG, JPEG or WebP
                  to stay inside Toolbox.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Resize ${files.files.length} images` : 'Resize image'}
            icon="Scaling"
            disabled={files.isEmpty || problem !== null}
            disabledReason={files.isEmpty ? 'Add at least one image first.' : (problem ?? undefined)}
          />
        </>
      }
    />
  );
}
