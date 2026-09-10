import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Field, NumberInput, Section, Switch } from '@/components/ui';
import {
  MAX_DPI,
  MIN_DPI,
  buildCompressOpts,
  describeCompression,
  presetDpi,
  type CompressPreset,
} from './logic';

const TOOL_ID = 'pdf/compress';
const TOOL_NAME = 'Compress PDF';

const PRESETS: Array<{ value: CompressPreset; label: string; hint: string }> = [
  {
    value: 'screen',
    label: 'Maximum compression',
    hint: 'Images down to 72 dpi. Smallest file, visibly softer pictures.',
  },
  {
    value: 'ebook',
    label: 'Balanced',
    hint: 'Images down to 150 dpi. Reads well on screen, still fine to print.',
  },
  {
    value: 'printer',
    label: 'High quality',
    hint: 'Images down to 300 dpi. Print-ready, moderate saving.',
  },
  {
    value: 'prepress',
    label: 'Prepress',
    hint: '300 dpi with colour and transparency preserved for professional printing.',
  },
];

export default function CompressPdf() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec({ suffix: '-compressed' });

  const [preset, setPreset] = useState<CompressPreset>('ebook');
  const [grayscale, setGrayscale] = useState(false);
  const [customDpi, setCustomDpi] = useState(false);
  const [dpi, setDpi] = useState(150);

  const opts = useMemo(
    () => buildCompressOpts(preset, grayscale, customDpi ? dpi : null),
    [preset, grayscale, customDpi, dpi],
  );

  const execute = () =>
    void run.execute({
      command: 'compress_pdf',
      total: files.files.length,
      inputs: files.paths,
      label: `Compress ${files.files.length} PDF${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: files.paths, opts, output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint={
              files.isEmpty
                ? 'The original files are never touched — a compressed copy is written alongside them'
                : undefined
            }
            accept="Folders are expanded automatically"
            allowFolders
          />

          {!files.isEmpty && (
            <p className="text-[12px] text-ink-faint">
              {files.files.length} document{files.files.length === 1 ? '' : 's'} ·{' '}
              {formatBytes(files.totalSize)} before compression
            </p>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Compressed" />}
        </>
      }
      aside={
        <>
          <Section title="Compression level">
            <div className="space-y-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={preset === p.value}
                  onClick={() => setPreset(p.value)}
                  className={clsx(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    preset === p.value
                      ? 'border-ink bg-accent-soft'
                      : 'border-line bg-panel hover:border-line-strong',
                  )}
                >
                  <span className="block text-[12.5px] font-medium text-ink">{p.label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-ink-faint">{p.hint}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Fine tuning">
            <div className="space-y-3">
              <Field inline label="Convert to grayscale" hint="Drops colour — a large saving on scans">
                <Switch checked={grayscale} onCheckedChange={setGrayscale} />
              </Field>
              <Field
                inline
                label="Set image resolution"
                hint={`Override the ${presetDpi(preset)} dpi this level uses`}
              >
                <Switch checked={customDpi} onCheckedChange={setCustomDpi} />
              </Field>
              {customDpi && (
                <Field label="Images downsampled to" hint={`Between ${MIN_DPI} and ${MAX_DPI} dpi.`}>
                  <NumberInput
                    value={dpi}
                    onValueChange={setDpi}
                    min={MIN_DPI}
                    max={MAX_DPI}
                    step={6}
                    suffix="dpi"
                  />
                </Field>
              )}
              <Alert tone="info">{describeCompression(opts)}</Alert>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Compress ${files.files.length} PDFs` : 'Compress PDF'}
            icon="Minimize2"
            disabled={files.isEmpty}
            disabledReason="Add at least one PDF first."
          />
        </>
      }
    />
  );
}
