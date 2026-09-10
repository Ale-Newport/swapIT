import { useMemo } from 'react';
import { formatBytes } from '@/core/format';
import type { OutputSpec } from '@/core/types';
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
import { Alert, Badge, Field, Section, Select, Stat } from '@/components/ui';
import { reviewParts } from './logic';

export default function JoinSplitFiles() {
  const files = useToolFiles({ multiple: true, filterName: 'Part files' });
  const run = useToolRun('files/join', 'Join Split Files');
  const { spec, update } = useOutputSpec();

  const review = useMemo(
    () => reviewParts(files.files.map((f) => ({ path: f.path, name: f.name, size: f.size }))),
    [files.files],
  );

  const broken = review.missing.length > 0 || review.duplicates.length > 0 || review.bases.length > 1;

  /**
   * `join_files` creates (and therefore truncates) the destination before it
   * writes the first part, so it cannot honour a "skip" policy: choosing it
   * would destroy the existing file and then report the result as skipped. Only
   * the two policies the backend really implements are offered here, and a
   * "skip" inherited from the global setting is read as "keep both".
   */
  const collision: OutputSpec['collision'] = spec.collision === 'skip' ? 'rename' : spec.collision;

  const execute = () =>
    void run.execute({
      command: 'join_files',
      total: review.order.length || 1,
      inputs: review.order.map((p) => p.path),
      label: `Join ${review.order.length} parts into ${review.outputName}`,
      args: { inputs: review.order.map((p) => p.path), output: { ...spec, collision } },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop the parts here"
            hint="Every .001.part, .002.part … piece of one file. Order does not matter — they are sorted by name."
          />

          {review.order.length > 0 && (
            <Section
              title="Join order"
              description={`${review.order.length} part${review.order.length === 1 ? '' : 's'} · ${formatBytes(review.totalSize)} · rebuilt as ${review.outputName}`}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Stat label="Parts" value={review.order.length.toLocaleString()} />
                  <Stat label="Rebuilt size" value={formatBytes(review.totalSize)} />
                  <Stat label="Output file" value={review.outputName} hint="From the first part's name" />
                </div>

                {review.missing.length > 0 && (
                  <Alert
                    tone="danger"
                    title={`Part ${review.missing.slice(0, 8).join(', ')}${review.missing.length > 8 ? ` and ${review.missing.length - 8} more` : ''} ${review.missing.length === 1 ? 'is' : 'are'} missing.`}
                  >
                    Joining what you have will produce a file with a hole in it — usually unopenable. Add the
                    missing parts before running.
                  </Alert>
                )}

                {review.duplicates.length > 0 && (
                  <Alert tone="warn" title={`Part number ${review.duplicates.join(', ')} appears more than once.`}>
                    Two files claim the same position — most likely parts from two different folders were added
                    together. Remove the ones you do not want.
                  </Alert>
                )}

                {review.bases.length > 1 && (
                  <Alert tone="warn" title="These parts belong to different files.">
                    Found {review.bases.slice(0, 3).join(', ')}
                    {review.bases.length > 3 ? ` and ${review.bases.length - 3} more` : ''}. Join one set at a
                    time.
                  </Alert>
                )}

                {review.startsLate && review.missing.length === 0 && (
                  <Alert tone="warn" title="The numbering does not start at 1.">
                    The first part of this file does not seem to be in the list.
                  </Alert>
                )}

                {review.unnumbered > 0 && (
                  <Alert tone="info" title={`${review.unnumbered} file${review.unnumbered === 1 ? ' has' : 's have'} no part number.`}>
                    Files without a <span className="font-mono">.NNN.part</span> name are still joined, in the
                    name order shown below.
                  </Alert>
                )}

                <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {review.order.map((item, index) => (
                    <li key={item.path} className="flex items-center gap-3 bg-panel px-3 py-1.5">
                      <span className="w-6 shrink-0 text-right font-mono text-[11px] text-ink-faint">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink"
                        title={item.path}
                      >
                        {item.name}
                      </span>
                      {item.number === null ? (
                        <Badge tone="warn">No number</Badge>
                      ) : review.duplicates.includes(item.number) ? (
                        <Badge tone="warn">#{item.number} twice</Badge>
                      ) : (
                        <Badge>#{item.number}</Badge>
                      )}
                      <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(item.size)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Joined" />}
        </>
      }
      aside={
        <>
          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} showCollision={false} />
            <Field
              label="If the rebuilt file exists"
              hint="Joining writes the file in one pass, so it cannot be skipped."
              className="mt-3"
            >
              <Select
                value={collision}
                onChange={(e) => update({ collision: e.target.value as OutputSpec['collision'] })}
                options={[
                  { value: 'rename', label: 'Keep both (file_1)' },
                  { value: 'overwrite', label: 'Replace it' },
                ]}
              />
            </Field>
          </Section>

          <Section title="How joining works">
            <div className="space-y-2 text-[11.5px] leading-[1.5] text-ink-faint">
              <p>
                The parts are sorted by name and their bytes are written end to end — no checksum is involved,
                so a missing or reordered part produces a damaged file rather than an error.
              </p>
              <p>
                The name comes from the first part:{' '}
                <span className="font-mono">movie.mp4.001.part</span> rebuilds{' '}
                <span className="font-mono">movie.mp4</span>. The parts themselves are left on disk.
              </p>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={broken ? 'Join anyway' : 'Join parts'}
            icon="Combine"
            disabled={review.order.length < 2}
            disabledReason={
              review.order.length === 0 ? 'Add the part files first.' : 'Add at least two parts to join.'
            }
          />
        </>
      }
    />
  );
}
