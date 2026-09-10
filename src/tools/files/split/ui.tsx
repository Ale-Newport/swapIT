import { useMemo, useState } from 'react';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
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
import { Alert, Badge, Field, NumberInput, Section, Select, Stat } from '@/components/ui';
import { PRESETS, chunkBytesFor, partName, planSplit, type SizeUnit } from './logic';

export default function SplitLargeFile() {
  const files = useToolFiles({ multiple: false, filterName: 'Any file' });
  const run = useToolRun('files/split', 'Split Large File');
  const { spec, update } = useOutputSpec();

  const [size, setSize] = useState(100);
  const [unit, setUnit] = useState<SizeUnit>('MB');

  const source = files.files[0] ?? null;
  const chunkBytes = chunkBytesFor(size, unit);
  const plan = useMemo(() => planSplit(source?.size ?? 0, chunkBytes), [source?.size, chunkBytes]);
  // A file that divides exactly leaves no remainder: the last part is a full
  // chunk, so every part — not one fewer — is chunk-sized.
  const dividesExactly = plan.valid && plan.lastPartBytes === plan.chunkBytes;
  const fullParts = dividesExactly ? plan.parts : plan.parts - 1;

  const execute = () => {
    if (!source || !plan.valid) return;
    void run.execute({
      command: 'split_file',
      total: plan.parts,
      inputs: [source.path],
      label: `Split ${source.name} into ${plan.parts} parts`,
      args: { input: source.path, chunkBytes, output: spec },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a file here"
            hint="Any file — a disk image, a video, a database dump"
          />

          {source && (
            <Section title="The plan" description={`${source.name} · ${formatBytes(source.size)}`}>
              {plan.valid ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Parts" value={plan.parts.toLocaleString()} />
                    <Stat
                      label="Each part"
                      value={formatBytes(plan.chunkBytes)}
                      hint={`${fullParts.toLocaleString()} of them`}
                    />
                    <Stat
                      label="Final part"
                      value={formatBytes(plan.lastPartBytes)}
                      hint={dividesExactly ? 'Full — divides exactly' : 'The remainder'}
                    />
                    <Stat label="Total written" value={formatBytes(source.size)} hint="Original is kept" />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{partName(source.name, 1)}</Badge>
                    <Badge>{partName(source.name, 2)}</Badge>
                    {plan.parts > 3 && <Badge>…</Badge>}
                    {plan.parts > 2 && <Badge>{partName(source.name, plan.parts)}</Badge>}
                  </div>

                  {plan.tooManyParts && (
                    <Alert tone="warn" title="That is a lot of parts.">
                      Part numbers are padded to three digits, so past 999 the names no longer sort in numeric
                      order and the Join tool would reassemble them in the wrong sequence. Choose a larger part
                      size.
                    </Alert>
                  )}
                </div>
              ) : (
                <Alert tone="warn" title="Nothing to split yet">
                  {plan.problem}
                </Alert>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Split complete" />}
        </>
      }
      aside={
        <>
          <Section title="Part size">
            <div className="space-y-3">
              <PresetRow
                presets={PRESETS.map((p) => ({
                  label: p.label,
                  hint: p.hint,
                  value: { value: p.value, unit: p.unit },
                }))}
                active={{ value: size, unit }}
                onSelect={(preset) => {
                  setSize(preset.value);
                  setUnit(preset.unit);
                }}
              />
              <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                <Field label="Size of each part">
                  <NumberInput value={size} min={1} step={1} onValueChange={setSize} />
                </Field>
                <Field label="Unit">
                  <Select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as SizeUnit)}
                    options={[
                      { value: 'MB', label: 'MB' },
                      { value: 'GB', label: 'GB' },
                    ]}
                  />
                </Field>
              </div>
              <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                MB and GB here are binary — 1 MB is 1,048,576 bytes, the same as Finder reports.{' '}
                {chunkBytes > 0 && `Each part is ${chunkBytes.toLocaleString()} bytes.`}
              </p>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} showCollision={false} />
          </Section>

          <Section title="How the parts work">
            <div className="space-y-2 text-[11.5px] leading-[1.5] text-ink-faint">
              <p>
                Parts are named <span className="font-mono">name.ext.001.part</span>,{' '}
                <span className="font-mono">name.ext.002.part</span> … and are plain byte ranges, not archives:
                no single part opens on its own.
              </p>
              <p>
                Put every part back together with the <strong className="text-ink-soft">Join Split Files</strong>{' '}
                tool, which sorts them by name and rebuilds the original.
              </p>
              <p>The original file is never modified or deleted, and an existing part file is never replaced.</p>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={plan.valid ? `Split into ${plan.parts} parts` : 'Split'}
            icon="Split"
            disabled={!source || !plan.valid}
            disabledReason={!source ? 'Add a file first.' : (plan.problem ?? 'Choose a smaller part size.')}
          />
        </>
      }
    />
  );
}
