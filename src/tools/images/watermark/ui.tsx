import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { basename } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  BeforeAfter,
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
  Button,
  ColorInput,
  Field,
  Icon,
  Input,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
} from '@/components/ui';

const IMAGE_EXTENSIONS = [
  'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp',
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

const LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'];

/**
 * The backend places overlays at seven named spots. The middle row has a single
 * centre position rather than three, so it spans the row.
 */
const TOP_ROW = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
];
const BOTTOM_ROW = [
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' },
];

type Kind = 'text' | 'logo';

function PositionCell({
  value,
  label,
  active,
  onSelect,
  className,
}: {
  value: string;
  label: string;
  active: boolean;
  onSelect: (value: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={clsx(
        'flex h-9 items-center justify-center rounded-lg border transition-colors',
        active
          ? 'border-ink bg-ink text-panel'
          : 'border-line bg-panel text-ink-faint hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      <span className={clsx('rounded-full bg-current', active ? 'h-2 w-2' : 'h-1.5 w-1.5 opacity-55')} />
    </button>
  );
}

export default function ImageWatermark() {
  const files = useToolFiles({ kinds: ['image'], extensions: IMAGE_EXTENSIONS, filterName: 'Images' });
  const run = useToolRun('images/watermark', 'Image Watermark');
  const { spec, update } = useOutputSpec({ suffix: '-watermarked' });

  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('');
  const [color, setColor] = useState('#ffffff');
  const [logo, setLogo] = useState<string | null>(null);
  const [position, setPosition] = useState('bottom-right');
  const [opacity, setOpacity] = useState(50);
  const [scale, setScale] = useState(20);
  const [margin, setMargin] = useState(24);
  const [format, setFormat] = useState('keep');

  const pickLogo = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: LOGO_EXTENSIONS }],
    });
    if (typeof picked === 'string') setLogo(picked);
  };

  const missing =
    kind === 'text' ? (text.trim() ? null : 'Type the watermark text first.') : logo ? null : 'Choose a logo image first.';

  const positionLabel =
    [...TOP_ROW, { value: 'center', label: 'Centre' }, ...BOTTOM_ROW].find((p) => p.value === position)?.label ??
    'Bottom right';

  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: files.files.length,
      inputs: files.paths,
      label: `Watermark ${files.files.length} image${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: {
          watermark: {
            text: kind === 'text' ? text.trim() : undefined,
            logo: kind === 'logo' ? logo : undefined,
            color: kind === 'text' ? color : undefined,
            position,
            opacity: opacity / 100,
            scale: scale / 100,
            margin,
          },
          format: format === 'keep' ? undefined : format,
        },
        output: spec,
      },
    });

  const firstPath = files.paths[0] ?? null;
  const firstSize = files.files[0]?.size;
  // Exact match only: every result carries its source, so a miss means this file
  // was not part of the last run and pairing it with someone else's output would
  // be a lie.
  const firstResult = run.result?.results.find((r) => r.source === firstPath) ?? null;
  const keepingUnwritable =
    format === 'keep' && files.files.some((f) => NEEDS_IMAGEMAGICK.has(f.extension.toLowerCase()));

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images here"
            hint="Every image gets the same stamp, sized relative to its own width"
            accept="JPG, PNG, HEIC, WebP, AVIF, TIFF, BMP"
            allowFolders
          />

          {firstPath && (
            <Section
              title="Preview"
              description={
                firstResult
                  ? 'The first image, before and after.'
                  : 'Run the watermark to see it on the first image.'
              }
            >
              <BeforeAfter
                beforePath={firstPath}
                afterPath={firstResult?.path ?? null}
                beforeSize={firstSize}
                afterSize={firstResult?.size}
                afterToken={firstResult ? `${firstResult.path}:${firstResult.size}` : undefined}
              />
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Watermark">
            <div className="space-y-3">
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'text', label: 'Text' },
                  { value: 'logo', label: 'Logo image' },
                ]}
                className="w-full"
              />

              {kind === 'text' ? (
                <>
                  <Field label="Text">
                    <Input
                      value={text}
                      placeholder="© YOUR NAME 2026"
                      onChange={(e) => setText(e.target.value)}
                    />
                  </Field>
                  <Field label="Text colour">
                    <ColorInput value={color} onChange={setColor} />
                  </Field>
                  <Alert tone="info">
                    Text is drawn with a built-in bitmap font, so it always comes out in capitals. Letters
                    A–Z, digits and <span className="font-mono">. , - _ / : ! ? @ # + = ( ) &amp; * % &apos; &quot;</span>{' '}
                    are supported; anything else becomes a small block.
                  </Alert>
                </>
              ) : (
                <>
                  <Field label="Logo file" hint="A PNG with transparency works best.">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                        <Icon name="Image" size={13} className="shrink-0 text-ink-faint" />
                        <span className="truncate text-[12.5px] text-ink-soft" title={logo ?? ''}>
                          {logo ? basename(logo) : 'No logo chosen'}
                        </span>
                      </div>
                      <Button size="sm" onClick={() => void pickLogo()}>
                        Browse
                      </Button>
                    </div>
                  </Field>
                  {logo && (
                    <Button size="sm" variant="ghost" icon="X" onClick={() => setLogo(null)}>
                      Remove logo
                    </Button>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Position">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {TOP_ROW.map((cell) => (
                  <PositionCell
                    key={cell.value}
                    value={cell.value}
                    label={cell.label}
                    active={position === cell.value}
                    onSelect={setPosition}
                  />
                ))}
                <PositionCell
                  value="center"
                  label="Centre"
                  active={position === 'center'}
                  onSelect={setPosition}
                  className="col-span-3"
                />
                {BOTTOM_ROW.map((cell) => (
                  <PositionCell
                    key={cell.value}
                    value={cell.value}
                    label={cell.label}
                    active={position === cell.value}
                    onSelect={setPosition}
                  />
                ))}
              </div>
              <p className="text-center text-[11.5px] text-ink-faint">{positionLabel}</p>
              <Field label="Margin" hint="Distance from the edge. Ignored in the centre.">
                <NumberInput
                  value={margin}
                  onValueChange={(v) => setMargin(Math.max(0, Math.round(v)))}
                  min={0}
                  max={1000}
                  suffix="px"
                />
              </Field>
            </div>
          </Section>

          <Section title="Appearance">
            <div className="space-y-3">
              <Field label={`Opacity — ${opacity}%`}>
                <Slider min={5} max={100} value={opacity} onChange={setOpacity} />
              </Field>
              <Field label={`Size — ${scale}% of the image width`}>
                <Slider min={2} max={100} value={scale} onChange={setScale} />
              </Field>
            </div>
          </Section>

          <Section title="Output format" description="Stamping re-encodes the pixels either way.">
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
            label={files.files.length > 1 ? `Watermark ${files.files.length} images` : 'Watermark image'}
            icon="Stamp"
            disabled={files.isEmpty || missing !== null}
            disabledReason={files.isEmpty ? 'Add at least one image first.' : (missing ?? undefined)}
          />
        </>
      }
    />
  );
}
