import { useMemo, useState } from 'react';
import { OptionsGrid, ToolShell } from '@/components/tool';
import {
  Alert,
  Button,
  ColorInput,
  CopyButton,
  Field,
  Input,
  Section,
  Select,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@/components/ui';
import {
  HARMONIES,
  buildPalette,
  exportPalette,
  formatHsl,
  formatRgb,
  hslToHex,
  readableInk,
  type ExportFormat,
  type Harmony,
  type Swatch,
} from './logic';

const FORMAT_LABEL: Record<ExportFormat, string> = {
  css: 'CSS variables',
  tailwind: 'Tailwind',
  json: 'JSON',
  scss: 'SCSS',
};

function randomHex(): string {
  const buffer = new Uint16Array(3);
  crypto.getRandomValues(buffer);
  return hslToHex({
    h: (buffer[0] / 65535) * 360,
    s: 45 + (buffer[1] / 65535) * 45,
    l: 35 + (buffer[2] / 65535) * 30,
  });
}

export default function PaletteGenerator() {
  const [base, setBase] = useState('#3366cc');
  const [harmony, setHarmony] = useState<Harmony>('analogous');
  const [name, setName] = useState('brand');
  const [format, setFormat] = useState<ExportFormat>('css');

  const { swatches, error } = useMemo(() => {
    try {
      return { swatches: buildPalette(base, harmony), error: null as string | null };
    } catch (err) {
      return { swatches: [] as Swatch[], error: err instanceof Error ? err.message : String(err) };
    }
  }, [base, harmony]);

  const exported = useMemo(
    () => (swatches.length ? exportPalette(swatches, format, name) : ''),
    [swatches, format, name],
  );

  const blurb = HARMONIES.find((h) => h.value === harmony)?.blurb ?? '';

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Palette"
            description={blurb}
            actions={
              <CopyButton
                value={() => swatches.map((s) => s.hex).join('\n')}
                label="Copy hex list"
                disabled={swatches.length === 0}
              />
            }
          >
            {error ? (
              <Alert tone="danger" title="That base colour cannot be read">
                {error}
              </Alert>
            ) : (
              <>
                <div className="mb-3 flex h-14 overflow-hidden rounded-lg border border-line">
                  {swatches.map((s) => (
                    <div key={s.key} className="flex-1" style={{ background: s.hex }} title={s.hex} />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {swatches.map((s) => (
                    <SwatchCard key={s.key} swatch={s} onPick={() => setBase(s.hex)} />
                  ))}
                </div>
              </>
            )}
          </Section>

          <Section
            title="Export"
            description="Drop straight into a stylesheet, a Tailwind config or a design token file."
            actions={<CopyButton value={() => exported} label="Copy" disabled={!exported} />}
          >
            <Tabs value={format} onChange={(value) => setFormat(value as ExportFormat)}>
              <TabList className="mb-3">
                {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((f) => (
                  <Tab key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </Tab>
                ))}
              </TabList>
              {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((f) => (
                <TabPanel key={f} value={f}>
                  <pre className="selectable max-h-80 overflow-auto whitespace-pre rounded-lg border border-line bg-canvas p-3 font-mono text-[12px] leading-[1.6] text-ink">
                    {exported}
                  </pre>
                </TabPanel>
              ))}
            </Tabs>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Base colour">
            <div className="space-y-3">
              <ColorInput value={base} onChange={setBase} />
              <Button icon="Shuffle" full onClick={() => setBase(randomHex())}>
                Surprise me
              </Button>
            </div>
          </Section>

          <Section title="Harmony">
            <Select
              value={harmony}
              onChange={(e) => setHarmony(e.target.value as Harmony)}
              options={HARMONIES.map((h) => ({ value: h.value, label: h.label }))}
            />
          </Section>

          <Section title="Naming">
            <OptionsGrid cols={1}>
              <Field label="Token name" hint="Used as the prefix in every export.">
                <Input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
              </Field>
            </OptionsGrid>
          </Section>
        </>
      }
    />
  );
}

function SwatchCard({ swatch, onPick }: { swatch: Swatch; onPick: () => void }) {
  const ink = readableInk(swatch.rgb);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <button
        type="button"
        onClick={onPick}
        title="Use this colour as the base"
        className="flex h-20 w-full items-end justify-between px-3 pb-2 text-left"
        style={{ background: swatch.hex, color: ink }}
      >
        <span className="text-[11.5px] font-medium opacity-80">{swatch.label}</span>
        <span className="font-mono text-[12.5px]">{swatch.key}</span>
      </button>
      <div className="divide-y divide-line">
        <ValueRow value={swatch.hex} />
        <ValueRow value={formatRgb(swatch.rgb)} />
        <ValueRow value={formatHsl(swatch.hsl)} />
      </div>
    </div>
  );
}

function ValueRow({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-soft selectable">{value}</span>
      <CopyButton value={value} label="" size="sm" variant="ghost" className="shrink-0" />
    </div>
  );
}
