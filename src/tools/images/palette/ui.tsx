import { useCallback, useEffect, useMemo, useState } from 'react';
import { saveTextAs } from '@/core/save';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  ImagePreview,
  PresetRow,
  ToolActions,
  ToolShell,
} from '@/components/tool';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  NumberInput,
  Section,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@/components/ui';
import {
  allHex,
  bandWidths,
  exportExtension,
  exportPalette,
  percentLabel,
  rgbString,
  type ExportFormat,
  type PaletteColor,
} from './logic';

const COUNT_PRESETS = [5, 8, 10, 20];

const FORMAT_LABEL: Record<ExportFormat, string> = {
  css: 'CSS variables',
  tailwind: 'Tailwind',
  json: 'JSON',
  list: 'Plain list',
};

export default function ColorPaletteExtractor() {
  const files = useToolFiles({ kinds: ['image'], filterName: 'Images', multiple: false });
  const run = useToolRun('images/palette', 'Color Palette Extractor');
  const path = files.files[0]?.path ?? null;

  const [count, setCount] = useState(8);
  const [colors, setColors] = useState<PaletteColor[] | null>(null);
  const [format, setFormat] = useState<ExportFormat>('css');
  const [saved, setSaved] = useState<string | null>(null);

  const extractRaw = run.executeRaw;

  const extract = useCallback(async () => {
    if (!path) return;
    const safeCount = Math.max(1, Math.min(64, Math.round(count)));
    const result = await extractRaw<PaletteColor[]>({
      command: 'extract_palette',
      inputs: [path],
      label: `Extract ${safeCount} colours`,
      args: { input: path, count: safeCount },
    });
    setColors(Array.isArray(result) ? result : null);
  }, [path, count, extractRaw]);

  // A palette is cheap to compute, so it follows the file and the count directly.
  useEffect(() => {
    if (!path) {
      setColors(null);
      setSaved(null);
      return;
    }
    const handle = setTimeout(() => void extract(), 200);
    return () => clearTimeout(handle);
  }, [path, count, extract]);

  const widths = useMemo(() => bandWidths(colors ?? []), [colors]);
  const exported = useMemo(() => (colors ? exportPalette(colors, format) : ''), [colors, format]);

  const saveFile = async () => {
    if (!colors) return;
    const stem = files.files[0]?.stem ?? 'palette';
    const result = await saveTextAs(exported, `${stem}-palette.${exportExtension(format)}`);
    setSaved(result ? result.name : null);
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an image here"
            hint="Photos, screenshots, artwork — the dominant colours come straight out of the pixels"
            compact={Boolean(path)}
          />

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void extract()} />}

          {path && (
            <Section
              title="Palette"
              description={
                colors
                  ? `${colors.length} colour${colors.length === 1 ? '' : 's'}, most common first`
                  : 'Reading the image…'
              }
              actions={
                colors ? (
                  <CopyButton size="sm" label="Copy all HEX" value={() => allHex(colors)} />
                ) : undefined
              }
            >
              {run.running && !colors ? (
                <div className="flex items-center gap-2 py-8 text-[12.5px] text-ink-faint">
                  <Spinner /> Finding the dominant colours…
                </div>
              ) : colors && colors.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex h-16 overflow-hidden rounded-lg border border-line">
                    {colors.map((color, index) => (
                      <button
                        key={`${color.hex}-${index}`}
                        type="button"
                        title={`${color.hex} — ${percentLabel(color)} of the image. Click to copy.`}
                        onClick={() => void navigator.clipboard.writeText(color.hex).catch(() => undefined)}
                        className="h-full transition-[flex-basis]"
                        style={{ flex: `0 0 ${widths[index]}%`, background: color.hex }}
                      />
                    ))}
                  </div>

                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {colors.map((color, index) => (
                      <li
                        key={`${color.hex}-card-${index}`}
                        className="overflow-hidden rounded-lg border border-line bg-panel"
                      >
                        <div
                          style={{
                            background: color.hex,
                            height: Math.round(40 + Math.min(color.percentage, 60) * 0.95),
                          }}
                        />
                        <div className="space-y-1 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[12.5px] text-ink selectable">
                              {color.hex}
                            </span>
                            <CopyButton size="sm" variant="ghost" label="" value={color.hex} />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[11px] text-ink-faint">
                              {rgbString(color)}
                            </span>
                            <Badge>{percentLabel(color)}</Badge>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="py-6 text-center text-[12.5px] text-ink-faint">
                  No palette yet — press Extract palette to read this image.
                </p>
              )}
            </Section>
          )}

          {colors && colors.length > 0 && (
            <Section
              title="Export"
              description="Paste straight into a stylesheet, a config or a design doc"
              actions={
                <>
                  <CopyButton size="sm" label="Copy" value={exported} />
                  <Button size="sm" variant="ghost" icon="Download" onClick={() => void saveFile()}>
                    Save file
                  </Button>
                </>
              }
            >
              <Tabs value={format} onChange={(value) => setFormat(value as ExportFormat)}>
                <TabList>
                  {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((key) => (
                    <Tab key={key} value={key}>
                      {FORMAT_LABEL[key]}
                    </Tab>
                  ))}
                </TabList>
                {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((key) => (
                  <TabPanel key={key} value={key}>
                    <pre className="selectable mt-3 max-h-72 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11.5px] leading-[1.6] text-ink">
                      {exported}
                    </pre>
                  </TabPanel>
                ))}
              </Tabs>
              {saved && <p className="mt-2 text-[11.5px] text-success">Saved as {saved}</p>}
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="How many colours">
            <div className="space-y-3">
              <PresetRow
                presets={COUNT_PRESETS.map((n) => ({ label: String(n), value: n }))}
                active={COUNT_PRESETS.includes(count) ? count : undefined}
                onSelect={setCount}
              />
              <Field label="Custom" hint="Between 1 and 64. More colours means finer shades.">
                <NumberInput
                  value={count}
                  onValueChange={(value) => setCount(Math.max(1, Math.min(64, Math.round(value))))}
                  min={1}
                  max={64}
                  suffix="cols"
                />
              </Field>
            </div>
          </Section>

          {path && (
            <Section title="Source" dense>
              <ImagePreview path={path} className="h-40 w-full" alt="Selected image" />
            </Section>
          )}

          <ToolActions
            run={run}
            onRun={() => void extract()}
            label="Extract palette"
            icon="Palette"
            disabled={!path}
            disabledReason="Add an image first."
          />
        </>
      }
    />
  );
}
