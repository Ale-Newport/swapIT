import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import { formatBytes, formatDuration, sizeDelta } from '@/core/format';
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
import { Alert, Badge, Card, Field, Icon, Section, Select, Spinner } from '@/components/ui';
import { PRESETS, TARGETS, buildCompressOps, findPreset, summarise } from './logic';

const EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

/** Files are probed in chunks so the estimate fills in as it goes. */
const CHUNK = 20;

interface ProbedDuration {
  path: string;
  duration?: number | null;
}

export default function CompressAudio() {
  const files = useToolFiles({ kinds: ['audio'], filterName: 'Audio', extensions: EXTENSIONS });
  const run = useToolRun('audio/compress', 'Compress Audio');
  const { spec, update } = useOutputSpec({ suffix: '-small' });

  const [presetId, setPresetId] = useState('balanced');
  const [target, setTarget] = useState('mp3');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [measuring, setMeasuring] = useState(false);

  const preset = findPreset(presetId);

  // Lengths drive the size estimate. FFprobe reads one file at a time, so the
  // list is walked in chunks and the panel updates after each one.
  const pathKey = files.paths.join('\n');
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    setDurations({});
    if (inputs.length === 0) {
      setMeasuring(false);
      return;
    }
    let stale = false;
    setMeasuring(true);
    void (async () => {
      for (let i = 0; i < inputs.length; i += CHUNK) {
        if (stale) return;
        try {
          const infos = await call<ProbedDuration[]>('probe_media', { inputs: inputs.slice(i, i + CHUNK) });
          if (stale) return;
          setDurations((current) => {
            const next = { ...current };
            for (const info of infos) {
              if (typeof info.duration === 'number' && info.duration > 0) next[info.path] = info.duration;
            }
            return next;
          });
        } catch {
          // A file FFprobe cannot read simply stays out of the estimate.
        }
      }
      if (!stale) setMeasuring(false);
    })();
    return () => {
      stale = true;
    };
  }, [pathKey]);

  const summary = useMemo(
    () => summarise(files.files, durations, preset.bitrate),
    [files.files, durations, preset.bitrate],
  );
  const totalSeconds = useMemo(
    () => files.paths.reduce((sum, path) => sum + (durations[path] ?? 0), 0),
    [files.paths, durations],
  );
  const delta =
    summary.measuredBytes > 0 && summary.estimatedBytes > 0
      ? sizeDelta(summary.measuredBytes, summary.estimatedBytes)
      : null;

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Compress ${files.files.length} file${files.files.length === 1 ? '' : 's'} at ${preset.bitrate} kbps`,
      args: {
        inputs: files.paths,
        ops: buildCompressOps(presetId, target),
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop audio files here"
            hint="Anything FFmpeg can read — MP3, WAV, M4A, FLAC, OGG, AIFF, WMA"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="Estimated result"
              description={
                <>
                  {formatDuration(totalSeconds)} of audio at {preset.bitrate} kbps
                  {preset.mono ? ', mixed to mono' : ''}
                </>
              }
              actions={measuring ? <Spinner /> : undefined}
            >
              {delta ? (
                <Card className="flex items-center gap-6 bg-canvas" padded={false}>
                  <div className="flex flex-1 items-center gap-6 px-4 py-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Now</p>
                      <p className="text-[14px] font-medium text-ink">{formatBytes(summary.measuredBytes)}</p>
                    </div>
                    <Icon name="ArrowRight" size={14} className="text-ink-faint" />
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Roughly</p>
                      <p className="text-[14px] font-medium text-ink">{formatBytes(summary.estimatedBytes)}</p>
                    </div>
                    <Badge tone={delta.smaller ? 'success' : 'warn'} className="ml-auto">
                      {delta.label}
                    </Badge>
                  </div>
                </Card>
              ) : (
                <p className="text-[12.5px] text-ink-faint">
                  {measuring ? 'Measuring the files…' : 'No lengths could be read, so there is nothing to estimate from.'}
                </p>
              )}

              {summary.pending > 0 && !measuring && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  {summary.pending} file{summary.pending === 1 ? '' : 's'} left out of the estimate — FFprobe could not
                  read {summary.pending === 1 ? 'its' : 'their'} length. {summary.pending === 1 ? 'It' : 'They'} will
                  still be compressed.
                </p>
              )}

              {delta && !delta.smaller && (
                <Alert tone="warn" className="mt-3" title="This preset would make the files bigger">
                  The originals are already smaller than {preset.bitrate} kbps. Pick a lower preset, or leave them as
                  they are.
                </Alert>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Quality">
            <div className="space-y-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    p.id === presetId
                      ? 'border-ink bg-ink/5'
                      : 'border-line bg-panel hover:border-line-strong'
                  }`}
                >
                  <span className="flex-1">
                    <span className="block text-[13px] font-medium text-ink">{p.label}</span>
                    <span className="block text-[11.5px] text-ink-faint">{p.hint}</span>
                  </span>
                  {p.id === presetId && <Icon name="Check" size={14} className="mt-0.5 shrink-0 text-ink" />}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Output format">
            <Field label="Format" hint="Both formats support an exact bitrate, and keep embedded cover art.">
              <Select value={target} onChange={(e) => setTarget(e.target.value)} options={TARGETS} />
            </Field>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Compress at ${preset.bitrate} kbps`}
            icon="Minimize2"
            disabled={files.isEmpty}
            disabledReason="Add at least one audio file first."
          />
        </>
      }
    />
  );
}
