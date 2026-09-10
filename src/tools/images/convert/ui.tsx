import { useState } from 'react';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { useSettings } from '@/core/settings';
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
import { ColorInput, Field, Section, Select, Slider, Switch } from '@/components/ui';

const FORMATS = [
  { value: 'jpg', label: 'JPEG (.jpg)' },
  { value: 'png', label: 'PNG (.png)' },
  { value: 'webp', label: 'WebP (.webp)' },
  { value: 'avif', label: 'AVIF (.avif)' },
  { value: 'tiff', label: 'TIFF (.tiff)' },
  { value: 'bmp', label: 'BMP (.bmp)' },
  { value: 'gif', label: 'GIF (.gif)' },
  { value: 'ico', label: 'Icon (.ico)' },
];

const LOSSY = new Set(['jpg', 'webp', 'avif']);

/** The colours `parse_color` in Rust accepts: #RGB, #RGBA, #RRGGBB or #RRGGBBAA. */
function isValidColor(value: string): boolean {
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-f]+$/i.test(hex) && [3, 4, 6, 8].includes(hex.length);
}

export default function ImageConverter() {
  const files = useToolFiles({
    kinds: ['image'],
    filterName: 'Images',
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif', 'ico', 'tga', 'qoi'],
  });
  const run = useToolRun('images/convert', 'Image Converter');
  const { spec, update } = useOutputSpec();
  const defaultQuality = useSettings((s) => s.settings.jpegQuality);

  const [format, setFormat] = useState('jpg');
  const [quality, setQuality] = useState(defaultQuality);
  const [background, setBackground] = useState('#ffffff');
  const [useBackground, setUseBackground] = useState(false);

  const colorOk = !useBackground || isValidColor(background);

  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: files.files.length,
      inputs: files.paths,
      label: `Convert ${files.files.length} image${files.files.length === 1 ? '' : 's'} to ${format.toUpperCase()}`,
      args: {
        inputs: files.paths,
        ops: {
          format,
          quality: LOSSY.has(format) ? quality : undefined,
          background: useBackground ? background : undefined,
        },
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images here"
            hint="HEIC, JPG, PNG, WebP, AVIF, TIFF, BMP, GIF — batches welcome"
            accept="Folders are expanded automatically"
            allowFolders
          />
          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Output format">
            <div className="space-y-3">
              <PresetRow
                presets={FORMATS.slice(0, 4).map((f) => ({ label: f.value.toUpperCase(), value: f.value }))}
                active={format}
                onSelect={setFormat}
              />
              <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              {LOSSY.has(format) && (
                <Field label={`Quality — ${quality}`} hint="Lower means smaller files.">
                  <Slider min={30} max={100} value={quality} onChange={setQuality} />
                </Field>
              )}
              <Field inline label="Flatten transparency" hint="Fill transparent areas with a colour">
                <Switch checked={useBackground} onCheckedChange={setUseBackground} />
              </Field>
              {useBackground && (
                <Field
                  label="Background colour"
                  error={colorOk ? undefined : 'Use #RGB, #RRGGBB or #RRGGBBAA.'}
                >
                  <ColorInput value={background} onChange={setBackground} />
                </Field>
              )}
              <p className="text-[11.5px] text-ink-faint">
                Converting re-encodes the pixels, so EXIF, GPS and other camera metadata is always
                left behind — the copy Toolbox writes carries none of it.
              </p>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Convert to ${format.toUpperCase()}`}
            icon="Repeat"
            disabled={files.isEmpty || !colorOk}
            disabledReason={
              files.isEmpty ? 'Add at least one image first.' : 'Fix the background colour first.'
            }
          />
        </>
      }
    />
  );
}
