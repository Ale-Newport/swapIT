import { useState } from 'react';
import { useSettings } from '@/core/settings';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  BeforeAfter,
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
import { Alert, Field, NumberInput, Section, Segmented, Select, Slider, Switch } from '@/components/ui';

const IMAGE_EXTENSIONS = [
  'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp',
];

const FORMATS = [
  { value: 'keep', label: 'Keep the original format' },
  { value: 'jpg', label: 'JPEG — smallest for photos' },
  { value: 'webp', label: 'WebP — smaller still, modern' },
];

const SIDE_PRESETS = [
  { label: '4000 px', value: 4000 },
  { label: '2560 px', value: 2560 },
  { label: '1920 px', value: 1920 },
  { label: '1280 px', value: 1280 },
  { label: '800 px', value: 800 },
];

type SizeMode = 'keep' | 'cap';
type Unit = 'kb' | 'mb';

export default function CompressImages() {
  const files = useToolFiles({ kinds: ['image'], extensions: IMAGE_EXTENSIONS, filterName: 'Images' });
  const run = useToolRun('images/compress', 'Compress Images');
  const { spec, update } = useOutputSpec({ suffix: '-compressed' });
  const defaultQuality = useSettings((s) => s.settings.jpegQuality);

  const [quality, setQuality] = useState(defaultQuality);
  const [format, setFormat] = useState('keep');
  const [sizeMode, setSizeMode] = useState<SizeMode>('keep');
  const [maxSide, setMaxSide] = useState(1920);
  const [targetOn, setTargetOn] = useState(false);
  const [targetValue, setTargetValue] = useState(500);
  const [targetUnit, setTargetUnit] = useState<Unit>('kb');

  const maxBytes = targetOn
    ? Math.max(1, Math.round(targetValue)) * (targetUnit === 'mb' ? 1024 * 1024 : 1024)
    : undefined;

  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: files.files.length,
      inputs: files.paths,
      label: `Compress ${files.files.length} image${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: {
          format: format === 'keep' ? undefined : format,
          quality,
          maxBytes,
          resize:
            sizeMode === 'cap' && maxSide > 0
              ? { mode: 'fit', width: maxSide, height: maxSide, allowUpscale: false }
              : undefined,
        },
        output: spec,
      },
    });

  const firstPath = files.paths[0] ?? null;
  const firstSize = files.files[0]?.size;
  const firstResult =
    run.result?.results.find((r) => r.source === firstPath) ?? run.result?.results[0] ?? null;

  const targetOnPngPassthrough = targetOn && format === 'keep';

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images here"
            hint="Originals are never touched — compressed copies are written alongside them"
            accept="JPG, PNG, HEIC, WebP, AVIF, TIFF, BMP"
            allowFolders
          />

          {firstPath && (
            <Section
              title="Preview"
              description={
                firstResult ? 'The first image, before and after.' : 'Run the compression to fill in the result.'
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
          <Section title="Compression">
            <div className="space-y-3">
              <Field
                label={`Quality — ${quality}`}
                hint="85 is a good default. Below 60 the artefacts start to show."
              >
                <Slider min={20} max={100} value={quality} onChange={setQuality} />
              </Field>

              <Field label="Output format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>

              <Field inline label="Target a maximum size" hint="Lowers quality until the file fits">
                <Switch checked={targetOn} onCheckedChange={setTargetOn} />
              </Field>

              {targetOn && (
                <OptionsGrid>
                  <Field label="Limit">
                    <NumberInput value={targetValue} onValueChange={setTargetValue} min={1} max={100000} />
                  </Field>
                  <Field label="Unit">
                    <Segmented
                      value={targetUnit}
                      onChange={setTargetUnit}
                      options={[
                        { value: 'kb', label: 'KB' },
                        { value: 'mb', label: 'MB' },
                      ]}
                      className="w-full"
                    />
                  </Field>
                </OptionsGrid>
              )}

              {targetOnPngPassthrough && (
                <Alert tone="warn">
                  A size limit only works on lossy formats. Choose JPEG or WebP so the quality search has
                  something to trade away — PNG sources will come out unchanged.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Dimensions">
            <div className="space-y-3">
              <Segmented
                value={sizeMode}
                onChange={setSizeMode}
                options={[
                  { value: 'keep', label: 'Keep as is' },
                  { value: 'cap', label: 'Cap the longest side' },
                ]}
                className="w-full"
              />
              {sizeMode === 'cap' && (
                <>
                  <Field
                    label="Longest side"
                    hint="Aspect ratio is kept. Images already smaller are left alone."
                  >
                    <NumberInput value={maxSide} onValueChange={setMaxSide} min={16} max={20000} suffix="px" />
                  </Field>
                  <PresetRow presets={SIDE_PRESETS} active={maxSide} onSelect={setMaxSide} />
                </>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Compress ${files.files.length} images` : 'Compress image'}
            icon="Minimize2"
            disabled={files.isEmpty || (sizeMode === 'cap' && maxSide <= 0)}
            disabledReason={
              files.isEmpty ? 'Add at least one image first.' : 'Enter a longest side above zero.'
            }
          />
        </>
      }
    />
  );
}
