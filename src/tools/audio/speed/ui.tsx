import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import { formatDuration } from '@/core/format';
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
import { Alert, Field, Icon, NumberInput, Section, Select, Slider } from '@/components/ui';

/** The slice of `probe_media`'s MediaInfo this tool needs. */
interface ProbedDuration {
  path: string;
  duration?: number | null;
}

const PRESETS = [
  { label: '0.5×', value: 0.5, hint: 'Half speed' },
  { label: '0.75×', value: 0.75, hint: 'Three quarters' },
  { label: '1×', value: 1, hint: 'Original speed' },
  { label: '1.25×', value: 1.25, hint: 'Slightly faster' },
  { label: '1.5×', value: 1.5, hint: 'Half again as fast' },
  { label: '2×', value: 2, hint: 'Double speed' },
];

const FORMATS = [
  { value: 'same', label: 'Same as the source' },
  { value: 'mp3', label: 'MP3 (.mp3)' },
  { value: 'm4a', label: 'M4A / AAC (.m4a)' },
  { value: 'wav', label: 'WAV — lossless (.wav)' },
  { value: 'flac', label: 'FLAC — lossless (.flac)' },
  { value: 'ogg', label: 'OGG Vorbis (.ogg)' },
];

/** Module-level so the identity stays stable across renders. */
const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function ChangeAudioSpeed() {
  const files = useToolFiles({ kinds: ['audio'], extensions: AUDIO_EXTENSIONS, filterName: 'Audio' });
  const run = useToolRun('audio/speed', 'Change Audio Speed');
  const { spec, update } = useOutputSpec();
  const [speed, setSpeed] = useState(1.5);
  const [format, setFormat] = useState('same');
  const [durations, setDurations] = useState<Record<string, number | null>>({});

  // Durations drive the "new length" preview. A quick read, not a tracked job.
  const pathKey = files.paths.join('\n');
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    if (inputs.length === 0) {
      setDurations({});
      return;
    }
    let stale = false;
    void call<ProbedDuration[]>('probe_media', { inputs })
      .then((infos) => {
        if (stale) return;
        const next: Record<string, number | null> = {};
        for (const info of infos) next[info.path] = info.duration ?? null;
        setDurations(next);
      })
      .catch(() => {
        // FFprobe is optional here — the tool still runs without the preview.
        if (!stale) setDurations({});
      });
    return () => {
      stale = true;
    };
  }, [pathKey]);

  const totals = useMemo(() => {
    let before = 0;
    let known = 0;
    for (const path of files.paths) {
      const d = durations[path];
      if (typeof d === 'number') {
        before += d;
        known += 1;
      }
    }
    return { before, after: speed > 0 ? before / speed : 0, known };
  }, [files.paths, durations, speed]);

  const unchanged = Math.abs(speed - 1) < 0.001;

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Change speed of ${files.files.length} file${files.files.length === 1 ? '' : 's'} to ${speed}×`,
      args: {
        inputs: files.paths,
        ops: {
          audioOnly: true,
          speed,
          format: format === 'same' ? undefined : format,
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
            label="Drop audio files here"
            hint="MP3, M4A, WAV, FLAC, OGG, AIFF, Opus — batches welcome"
            allowFolders
          />

          <Alert tone="info" title="Pitch is preserved">
            Toolbox uses FFmpeg&rsquo;s <code className="font-mono text-[11.5px]">atempo</code> filter, which stretches
            time without raising or lowering voices. To shift the pitch instead, use Change Pitch. Tags are copied
            where the output format supports them; embedded cover art is not.
          </Alert>

          {files.files.length > 0 && totals.known > 0 && (
            <Section
              title="New length"
              description={
                <>
                  {formatDuration(totals.before)} → {formatDuration(totals.after)} in total at {speed}×
                </>
              }
            >
              <ul className="divide-y divide-line">
                {files.files.slice(0, 8).map((file) => {
                  const d = durations[file.path];
                  return (
                    <li key={file.path} className="flex items-center gap-3 py-1.5 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate text-ink" title={file.path}>
                        {file.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-faint">{formatDuration(d)}</span>
                      <Icon name="ArrowRight" size={13} className="shrink-0 text-ink-faint" />
                      <span className="shrink-0 tabular-nums font-medium text-ink">
                        {typeof d === 'number' ? formatDuration(d / speed) : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {files.files.length > 8 && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  …and {files.files.length - 8} more file{files.files.length - 8 === 1 ? '' : 's'}.
                </p>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Speed">
            <div className="space-y-3">
              <PresetRow presets={PRESETS} active={speed} onSelect={setSpeed} />
              <Field label={`${speed}× playback`} hint="0.25× is four times longer, 4× is four times shorter.">
                <Slider min={0.25} max={4} step={0.05} value={speed} onChange={(v) => setSpeed(Number(v.toFixed(2)))} />
              </Field>
              <Field label="Exact factor">
                <NumberInput
                  value={speed}
                  min={0.25}
                  max={4}
                  step={0.05}
                  suffix="×"
                  onValueChange={(v) => setSpeed(Math.min(4, Math.max(0.25, v || 1)))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Output format">
            <Field
              label="Format"
              hint="Audio is re-encoded at the encoder's default quality (128 kbps for MP3 and M4A). Pick WAV or FLAC to stay lossless."
            >
              <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
            </Field>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Change to ${speed}×`}
            icon="FastForward"
            disabled={files.isEmpty || unchanged}
            disabledReason={
              files.isEmpty ? 'Add at least one audio file first.' : 'Pick a speed other than 1× to change anything.'
            }
          />
        </>
      }
    />
  );
}
