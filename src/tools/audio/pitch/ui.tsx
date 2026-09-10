import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import type { BatchResult } from '@/core/types';
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
import { Alert, Badge, Field, NumberInput, Section, Select, Slider, Stat } from '@/components/ui';
import {
  SEMITONE_MAX,
  SEMITONE_MIN,
  groupBySampleRate,
  intervalName,
  pitchOpsFor,
  pitchRatio,
  semitoneLabel,
} from './logic';

/** The slice of `probe_media`'s MediaInfo this tool needs. */
interface ProbedRate {
  path: string;
  audio?: { sampleRate?: number | null } | null;
}

const PRESETS = [
  { label: '−12', value: -12, hint: 'One octave down' },
  { label: '−5', value: -5, hint: 'A fourth down' },
  { label: '−2', value: -2, hint: 'A whole tone down' },
  { label: '+2', value: 2, hint: 'A whole tone up' },
  { label: '+5', value: 5, hint: 'A fourth up' },
  { label: '+12', value: 12, hint: 'One octave up' },
];

const FORMATS = [
  { value: 'same', label: 'Same as the source' },
  { value: 'mp3', label: 'MP3 (.mp3)' },
  { value: 'm4a', label: 'M4A / AAC (.m4a)' },
  { value: 'wav', label: 'WAV — lossless (.wav)' },
  { value: 'flac', label: 'FLAC — lossless (.flac)' },
  { value: 'ogg', label: 'OGG Vorbis (.ogg)' },
];

const EMPTY_BATCH: BatchResult = { results: [], failures: [], cancelled: false, elapsedMs: 0 };

/** Module-level so the identity stays stable across renders. */
const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function ChangePitch() {
  const files = useToolFiles({ kinds: ['audio'], extensions: AUDIO_EXTENSIONS, filterName: 'Audio' });
  const run = useToolRun('audio/pitch', 'Change Pitch');
  const { spec, update } = useOutputSpec();
  const [semitones, setSemitones] = useState(2);
  const [format, setFormat] = useState('same');
  const [rates, setRates] = useState<Record<string, number | null>>({});
  const [probing, setProbing] = useState(false);
  /** True when FFprobe could not read the selection, so the shift is a guess. */
  const [probeFailed, setProbeFailed] = useState(false);
  /** Filled in only when the selection had to be split into sample-rate groups. */
  const [combined, setCombined] = useState<BatchResult | null>(null);

  const pathKey = files.paths.join('\n');
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    if (inputs.length === 0) {
      setRates({});
      setProbeFailed(false);
      return;
    }
    let stale = false;
    setProbing(true);
    void call<ProbedRate[]>('probe_media', { inputs })
      .then((infos) => {
        if (stale) return;
        const next: Record<string, number | null> = {};
        for (const info of infos) next[info.path] = info.audio?.sampleRate ?? null;
        setRates(next);
        setProbeFailed(false);
      })
      .catch(() => {
        // FFprobe is a declared dependency, so this is an unreadable file rather
        // than a missing binary. The shift falls back to FFmpeg's own 44.1 kHz
        // assumption, which the warning below says out loud.
        if (!stale) {
          setRates({});
          setProbeFailed(true);
        }
      })
      .finally(() => {
        if (!stale) setProbing(false);
      });
    return () => {
      stale = true;
    };
  }, [pathKey]);

  const ratio = pitchRatio(semitones);
  const interval = intervalName(semitones);

  const groups = useMemo(
    () => groupBySampleRate(files.paths.map((path) => ({ path, sampleRate: rates[path] ?? null }))),
    [files.paths, rates],
  );

  const execute = async () => {
    setCombined(null);
    if (groups.length === 0) return;
    const merged: BatchResult = { ...EMPTY_BATCH, results: [], failures: [] };
    for (const group of groups) {
      const ops = pitchOpsFor(ratio, group.sampleRate, format);
      const batch = await run.execute({
        command: 'process_video',
        total: group.paths.length,
        inputs: group.paths,
        label: `Shift ${group.paths.length} file${group.paths.length === 1 ? '' : 's'} by ${semitoneLabel(semitones).toLowerCase()}`,
        args: {
          inputs: group.paths,
          ops: {
            audioOnly: true,
            pitch: ops.pitch,
            speed: ops.speed,
            sampleRate: ops.sampleRate,
            format: format === 'same' ? undefined : format,
          },
          output: spec,
        },
      });
      // A null batch means the run threw or was cancelled. `useToolRun` clears
      // its own result on every call, so anything earlier groups already wrote
      // has to be put back on screen or those files vanish from the panel — the
      // run stopped part-way, which is what `cancelled` says in the panel.
      if (!batch) {
        if (merged.results.length > 0 || merged.failures.length > 0) {
          merged.cancelled = true;
          setCombined(merged);
        }
        return;
      }
      merged.results.push(...batch.results);
      merged.failures.push(...batch.failures);
      merged.elapsedMs += batch.elapsedMs;
      if (batch.cancelled) {
        merged.cancelled = true;
        break;
      }
    }
    if (groups.length > 1) setCombined(merged);
  };

  const onRun = () => void execute();
  const result = combined ?? run.result;
  const reset = () => {
    setCombined(null);
    run.reset();
  };

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

          <Alert tone="info" title="The length stays the same">
            Shifting the pitch resamples the audio and then corrects the tempo, so a three-minute song is still three
            minutes long — only higher or lower. Tags are copied where the output format supports them; embedded cover
            art is not.
          </Alert>

          {probeFailed && files.files.length > 0 && (
            <Alert tone="warn" title="The sample rates could not be read">
              The shift is measured against each file's own sample rate. FFprobe could not report it for this selection,
              so Toolbox falls back to FFmpeg's 44.1 kHz assumption: files recorded at another rate come out slightly
              off in both pitch and length.
            </Alert>
          )}

          {files.files.length > 0 && (
            <Section title="Shift" description={interval ? `${semitoneLabel(semitones)} — a ${interval}` : semitoneLabel(semitones)}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Semitones" value={semitoneLabel(semitones)} />
                <Stat label="Frequency ratio" value={`×${ratio.toFixed(4)}`} hint="2^(n/12)" />
                <Stat
                  label="A4 becomes"
                  value={`${(440 * ratio).toFixed(1)} Hz`}
                  hint="440 Hz reference"
                />
                <Stat
                  label="Sample rates"
                  value={
                    probing
                      ? 'Reading…'
                      : groups.length === 0
                        ? '—'
                        : groups
                            .map((g) => (g.sampleRate ? `${(g.sampleRate / 1000).toFixed(1)} kHz` : 'unknown'))
                            .join(', ')
                  }
                  hint={!probing && groups.length > 1 ? `${groups.length} groups` : undefined}
                />
              </div>
              {!probing && groups.length > 1 && (
                <p className="mt-3 text-[11.5px] text-ink-faint">
                  These files do not share one sample rate, so Toolbox runs {groups.length} passes — one per rate — to
                  keep the shift exact in every file.
                </p>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={onRun} />}
          {result && <ResultPanel result={result} onProcessAgain={reset} />}
        </>
      }
      aside={
        <>
          <Section
            title="Pitch"
            actions={<Badge tone={semitones === 0 ? 'neutral' : 'accent'}>{semitoneLabel(semitones)}</Badge>}
          >
            <div className="space-y-3">
              <PresetRow presets={PRESETS} active={semitones} onSelect={setSemitones} />
              <Field label="Semitones" hint="One octave is 12 semitones in either direction.">
                <Slider
                  min={SEMITONE_MIN}
                  max={SEMITONE_MAX}
                  step={1}
                  value={semitones}
                  onChange={(v) => setSemitones(Math.round(v))}
                />
              </Field>
              <Field label="Exact value">
                <NumberInput
                  value={semitones}
                  min={SEMITONE_MIN}
                  max={SEMITONE_MAX}
                  step={1}
                  suffix="st"
                  onValueChange={(v) =>
                    setSemitones(Math.min(SEMITONE_MAX, Math.max(SEMITONE_MIN, Math.round(v || 0))))
                  }
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
            onRun={onRun}
            label={semitones === 0 ? 'Shift pitch' : `Shift ${semitoneLabel(semitones).toLowerCase()}`}
            icon="Music4"
            disabled={files.isEmpty || semitones === 0 || probing}
            disabledReason={
              files.isEmpty
                ? 'Add at least one audio file first.'
                : semitones === 0
                  ? 'Pick a shift other than zero semitones.'
                  : 'Reading sample rates — the shift needs them to be exact.'
            }
          />
        </>
      }
    />
  );
}
