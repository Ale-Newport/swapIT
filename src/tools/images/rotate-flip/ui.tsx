import { useEffect, useRef, useState } from 'react';
import { call } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Button, Field, Icon, Section, Segmented, Select, Switch } from '@/components/ui';

const IMAGE_EXTENSIONS = [
  'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif',
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

const ROTATIONS = [
  { value: '0', label: 'None' },
  { value: '90', label: '90°' },
  { value: '180', label: '180°' },
  { value: '270', label: '270°' },
];

interface ImageInfoRow {
  width: number;
  height: number;
}

export default function RotateFlip() {
  const files = useToolFiles({ kinds: ['image'], extensions: IMAGE_EXTENSIONS, filterName: 'Images' });
  const run = useToolRun('images/rotate-flip', 'Rotate & Flip');
  const { spec, update } = useOutputSpec();

  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [format, setFormat] = useState('keep');
  const [natural, setNatural] = useState<ImageInfoRow | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [dimensionsFailed, setDimensionsFailed] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  const path = files.paths[0] ?? null;

  useEffect(() => {
    let alive = true;
    setPreviewFailed(false);
    setDimensionsFailed(false);
    if (!path) {
      setNatural(null);
      return;
    }
    call<ImageInfoRow[]>('image_info', { inputs: [path] })
      .then((rows) => {
        if (!alive) return;
        setNatural(rows[0] ?? null);
        // No row means nothing to scale the preview with — same dead end as a
        // rejected call, so it gets the same message rather than a spinner.
        setDimensionsFailed(!rows[0]);
      })
      .catch(() => {
        if (!alive) return;
        setNatural(null);
        setDimensionsFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setStage({ width: box.width, height: box.height });
    });
    observer.observe(el);
    setStage({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const quarterTurn = rotation === 90 || rotation === 270;
  // A quarter-turned image needs the stage's other axis to fit in.
  const availableWidth = quarterTurn ? stage.height : stage.width;
  const availableHeight = quarterTurn ? stage.width : stage.height;
  const scale =
    natural && natural.width > 0 && natural.height > 0 && availableWidth > 0 && availableHeight > 0
      ? Math.min(availableWidth / natural.width, availableHeight / natural.height, 1)
      : 1;
  const displayWidth = natural ? Math.max(1, natural.width * scale) : 0;
  const displayHeight = natural ? Math.max(1, natural.height * scale) : 0;

  // CSS applies the rightmost function first, so this is rotate → flip, the
  // same order the backend pipeline uses.
  const transform = [
    flipVertical ? 'scaleY(-1)' : '',
    flipHorizontal ? 'scaleX(-1)' : '',
    rotation ? `rotate(${rotation}deg)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const untouched = rotation === 0 && !flipHorizontal && !flipVertical && format === 'keep';
  const keepingUnwritable =
    format === 'keep' && files.files.some((f) => NEEDS_IMAGEMAGICK.has(f.extension.toLowerCase()));

  const turn = (delta: number) => setRotation((current) => (current + delta + 360) % 360);

  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: files.files.length,
      inputs: files.paths,
      label: `Rotate & flip ${files.files.length} image${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: {
          rotate: rotation || undefined,
          flipHorizontal,
          flipVertical,
          format: format === 'keep' ? undefined : format,
        },
        output: spec,
      },
    });

  const resultSize =
    natural && quarterTurn ? `${natural.height} × ${natural.width}` : natural ? `${natural.width} × ${natural.height}` : null;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images here"
            hint="The same rotation and flip is applied to every image"
            accept="JPG, PNG, HEIC, WebP, AVIF, TIFF, BMP, GIF"
            allowFolders
          />

          <div
            ref={stageRef}
            className="relative flex h-[380px] items-center justify-center overflow-hidden rounded-card border border-line bg-canvas checkerboard"
          >
            {!path && (
              <p className="px-6 text-center text-[12.5px] text-ink-faint">
                Add an image to see the result before you commit.
              </p>
            )}
            {path && !natural && !dimensionsFailed && (
              <p className="px-6 text-center text-[12.5px] text-ink-faint">Reading the image…</p>
            )}
            {path && !natural && dimensionsFailed && (
              <div className="flex flex-col items-center gap-1 px-6 text-center">
                <Icon name="FileWarning" size={18} className="text-ink-faint" />
                <p className="text-[11.5px] text-ink-faint">
                  Toolbox could not read this image, so there is no preview — the rotation is still
                  applied when you run it.
                </p>
              </div>
            )}
            {path && natural && !previewFailed && (
              <img
                src={assetUrl(path)}
                alt="Preview of the rotated image"
                draggable={false}
                onError={() => setPreviewFailed(true)}
                style={{ width: displayWidth, height: displayHeight, transform }}
                className="select-none transition-transform duration-200 ease-out"
              />
            )}
            {path && previewFailed && (
              <div className="flex flex-col items-center gap-1 px-6 text-center">
                <Icon name="FileWarning" size={18} className="text-ink-faint" />
                <p className="text-[11.5px] text-ink-faint">
                  No live preview for this format — the rotation is still applied when you run it.
                </p>
              </div>
            )}
            {path && natural && resultSize && (
              <Badge className="absolute bottom-2 right-2">{resultSize}</Badge>
            )}
          </div>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Rotation" description="Clockwise, applied before the flips.">
            <div className="space-y-3">
              <Segmented
                value={String(rotation)}
                onChange={(value) => setRotation(Number(value))}
                options={ROTATIONS}
                className="w-full"
              />
              <div className="flex gap-2">
                <Button size="sm" icon="RotateCcw" className="flex-1" onClick={() => turn(-90)}>
                  Turn left
                </Button>
                <Button size="sm" icon="RotateCw" className="flex-1" onClick={() => turn(90)}>
                  Turn right
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Mirror">
            <div className="space-y-1">
              <Field inline label="Flip horizontally" hint="Left becomes right">
                <Switch checked={flipHorizontal} onCheckedChange={setFlipHorizontal} />
              </Field>
              <Field inline label="Flip vertically" hint="Top becomes bottom">
                <Switch checked={flipVertical} onCheckedChange={setFlipVertical} />
              </Field>
            </div>
          </Section>

          <Section title="Output format" description="Rotating re-encodes the pixels either way.">
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
            label={files.files.length > 1 ? `Apply to ${files.files.length} images` : 'Apply to image'}
            icon="RotateCw"
            disabled={files.isEmpty || untouched}
            disabledReason={
              files.isEmpty
                ? 'Add at least one image first.'
                : 'Choose a rotation, a flip or a different output format first.'
            }
          />
        </>
      }
    />
  );
}
