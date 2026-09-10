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
import {
  Alert,
  ColorInput,
  Field,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
} from '@/components/ui';

const IMAGE_EXTENSIONS = [
  'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp',
];

const FORMATS = [
  { value: 'png', label: 'PNG — keeps transparency' },
  { value: 'keep', label: 'Keep the original format' },
  { value: 'jpg', label: 'JPEG — no transparency' },
  { value: 'webp', label: 'WebP' },
];

const LOSSY = new Set(['jpg', 'webp']);

const PADDING_PRESETS = [
  { label: '16', value: 16 },
  { label: '32', value: 32 },
  { label: '64', value: 64 },
  { label: '96', value: 96 },
];

const RADIUS_PRESETS = [
  { label: 'None', value: 0 },
  { label: '8', value: 8 },
  { label: '16', value: 16 },
  { label: '32', value: 32 },
  { label: '64', value: 64 },
];

export default function ImageEffects() {
  const files = useToolFiles({ kinds: ['image'], extensions: IMAGE_EXTENSIONS, filterName: 'Images' });
  const run = useToolRun('images/effects', 'Image Effects');
  const { spec, update } = useOutputSpec({ suffix: '-styled' });
  const defaultQuality = useSettings((s) => s.settings.jpegQuality);

  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState(defaultQuality);

  const [grayscale, setGrayscale] = useState(false);
  const [backgroundOn, setBackgroundOn] = useState(false);
  const [background, setBackground] = useState('#ffffff');

  const [radius, setRadius] = useState(0);

  const [borderOn, setBorderOn] = useState(false);
  const [borderWidth, setBorderWidth] = useState(8);
  const [borderColor, setBorderColor] = useState('#111111');

  const [paddingOn, setPaddingOn] = useState(false);
  const [paddingUniform, setPaddingUniform] = useState(true);
  const [padding, setPadding] = useState({ top: 32, right: 32, bottom: 32, left: 32 });
  const [paddingTransparent, setPaddingTransparent] = useState(false);
  const [paddingColor, setPaddingColor] = useState('#ffffff');

  const [shadowOn, setShadowOn] = useState(false);
  const [shadowBlur, setShadowBlur] = useState(24);
  const [shadowOffsetX, setShadowOffsetX] = useState(0);
  const [shadowOffsetY, setShadowOffsetY] = useState(12);
  const [shadowSpread, setShadowSpread] = useState(48);
  const [shadowColor, setShadowColor] = useState('#0000006e');

  const setUniformPadding = (value: number) => {
    const v = Math.max(0, Math.round(value));
    setPadding({ top: v, right: v, bottom: v, left: v });
  };

  const setPaddingSide = (side: keyof typeof padding, value: number) =>
    setPadding((current) => ({ ...current, [side]: Math.max(0, Math.round(value)) }));

  const nothingSelected =
    !grayscale && !backgroundOn && radius === 0 && !borderOn && !paddingOn && !shadowOn && format === 'keep';

  const producesAlpha =
    radius > 0 || shadowOn || (paddingOn && paddingTransparent);
  const alphaWillBeLost = producesAlpha && format === 'jpg';

  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: files.files.length,
      inputs: files.paths,
      label: `Style ${files.files.length} image${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: {
          format: format === 'keep' ? undefined : format,
          quality: LOSSY.has(format) ? quality : undefined,
          grayscale,
          background: backgroundOn ? background : undefined,
          rounded: radius > 0 ? radius : undefined,
          border: borderOn && borderWidth > 0 ? { width: borderWidth, color: borderColor } : undefined,
          padding: paddingOn
            ? { ...padding, color: paddingTransparent ? 'transparent' : paddingColor }
            : undefined,
          shadow: shadowOn
            ? {
                blur: shadowBlur,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY,
                spread: shadowSpread,
                color: shadowColor,
              }
            : undefined,
        },
        output: spec,
      },
    });

  const firstPath = files.paths[0] ?? null;
  const firstSize = files.files[0]?.size;
  const firstResult =
    run.result?.results.find((r) => r.source === firstPath) ?? run.result?.results[0] ?? null;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images here"
            hint="Great for screenshots — pad them, round the corners, drop a shadow underneath"
            accept="JPG, PNG, HEIC, WebP, AVIF, TIFF, BMP"
            allowFolders
          />

          {firstPath && (
            <Section
              title="Preview"
              description={
                firstResult
                  ? 'The first image, before and after.'
                  : 'Run the effects to see them applied to the first image.'
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
          <Section title="Colour">
            <div className="space-y-2">
              <Field inline label="Grayscale" hint="Convert to black and white">
                <Switch checked={grayscale} onCheckedChange={setGrayscale} />
              </Field>
              <Field inline label="Flatten transparency" hint="Fill see-through areas with a colour">
                <Switch checked={backgroundOn} onCheckedChange={setBackgroundOn} />
              </Field>
              {backgroundOn && <ColorInput value={background} onChange={setBackground} />}
            </div>
          </Section>

          <Section title="Corners & border">
            <div className="space-y-3">
              <Field label={`Corner radius — ${radius} px`} hint="Rounded corners need PNG or WebP output.">
                <Slider min={0} max={200} value={radius} onChange={setRadius} />
              </Field>
              <PresetRow presets={RADIUS_PRESETS} active={radius} onSelect={setRadius} />
              <Field inline label="Border" hint="Drawn tight around the image">
                <Switch checked={borderOn} onCheckedChange={setBorderOn} />
              </Field>
              {borderOn && (
                <>
                  <Field label="Border width">
                    <NumberInput
                      value={borderWidth}
                      onValueChange={(v) => setBorderWidth(Math.max(0, Math.round(v)))}
                      min={0}
                      max={500}
                      suffix="px"
                    />
                  </Field>
                  <Field label="Border colour">
                    <ColorInput value={borderColor} onChange={setBorderColor} allowAlpha />
                  </Field>
                </>
              )}
            </div>
          </Section>

          <Section title="Padding">
            <div className="space-y-3">
              <Field inline label="Add padding" hint="Space around the image">
                <Switch checked={paddingOn} onCheckedChange={setPaddingOn} />
              </Field>
              {paddingOn && (
                <>
                  <Segmented
                    value={paddingUniform ? 'uniform' : 'sides'}
                    onChange={(value) => setPaddingUniform(value === 'uniform')}
                    options={[
                      { value: 'uniform', label: 'All sides' },
                      { value: 'sides', label: 'Per side' },
                    ]}
                    className="w-full"
                  />
                  {paddingUniform ? (
                    <>
                      <Field label="Padding">
                        <NumberInput
                          value={padding.top}
                          onValueChange={setUniformPadding}
                          min={0}
                          max={2000}
                          suffix="px"
                        />
                      </Field>
                      <PresetRow presets={PADDING_PRESETS} active={padding.top} onSelect={setUniformPadding} />
                    </>
                  ) : (
                    <OptionsGrid>
                      <Field label="Top">
                        <NumberInput
                          value={padding.top}
                          onValueChange={(v) => setPaddingSide('top', v)}
                          min={0}
                          max={2000}
                        />
                      </Field>
                      <Field label="Right">
                        <NumberInput
                          value={padding.right}
                          onValueChange={(v) => setPaddingSide('right', v)}
                          min={0}
                          max={2000}
                        />
                      </Field>
                      <Field label="Bottom">
                        <NumberInput
                          value={padding.bottom}
                          onValueChange={(v) => setPaddingSide('bottom', v)}
                          min={0}
                          max={2000}
                        />
                      </Field>
                      <Field label="Left">
                        <NumberInput
                          value={padding.left}
                          onValueChange={(v) => setPaddingSide('left', v)}
                          min={0}
                          max={2000}
                        />
                      </Field>
                    </OptionsGrid>
                  )}
                  <Field inline label="Transparent padding" hint="Instead of a solid colour">
                    <Switch checked={paddingTransparent} onCheckedChange={setPaddingTransparent} />
                  </Field>
                  {!paddingTransparent && (
                    <Field label="Padding colour">
                      <ColorInput value={paddingColor} onChange={setPaddingColor} />
                    </Field>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Drop shadow">
            <div className="space-y-3">
              <Field inline label="Add a shadow" hint="Grows the canvas to make room">
                <Switch checked={shadowOn} onCheckedChange={setShadowOn} />
              </Field>
              {shadowOn && (
                <>
                  <Field label={`Blur — ${shadowBlur} px`}>
                    <Slider min={0} max={120} value={shadowBlur} onChange={setShadowBlur} />
                  </Field>
                  <Field label={`Spread — ${shadowSpread} px`} hint="How much canvas the shadow gets">
                    <Slider min={0} max={200} value={shadowSpread} onChange={setShadowSpread} />
                  </Field>
                  <OptionsGrid>
                    <Field label="Offset X">
                      <NumberInput
                        value={shadowOffsetX}
                        onValueChange={(v) => setShadowOffsetX(Math.round(v))}
                        min={-200}
                        max={200}
                        suffix="px"
                      />
                    </Field>
                    <Field label="Offset Y">
                      <NumberInput
                        value={shadowOffsetY}
                        onValueChange={(v) => setShadowOffsetY(Math.round(v))}
                        min={-200}
                        max={200}
                        suffix="px"
                      />
                    </Field>
                  </OptionsGrid>
                  <Field label="Shadow colour" hint="Add two more hex digits for opacity, e.g. #0000006e">
                    <ColorInput value={shadowColor} onChange={setShadowColor} allowAlpha />
                  </Field>
                </>
              )}
            </div>
          </Section>

          <Section
            title="Output format"
            description="Applied in order: grayscale, background, corners, border, padding, shadow."
          >
            <div className="space-y-3">
              <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              {LOSSY.has(format) && (
                <Field label={`Quality — ${quality}`}>
                  <Slider min={30} max={100} value={quality} onChange={setQuality} />
                </Field>
              )}
              {alphaWillBeLost && (
                <Alert tone="warn">
                  JPEG cannot store transparency, so rounded corners, shadows and transparent padding will
                  be filled with white. Choose PNG or WebP to keep them.
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
            label={files.files.length > 1 ? `Apply to ${files.files.length} images` : 'Apply effects'}
            icon="Frame"
            disabled={files.isEmpty || nothingSelected}
            disabledReason={
              files.isEmpty ? 'Add at least one image first.' : 'Turn on an effect or pick an output format.'
            }
          />
        </>
      }
    />
  );
}
