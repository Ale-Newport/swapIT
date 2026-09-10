import { useEffect, useMemo, useState } from 'react';
import { appPaths, call, ensureDir } from '@/core/bridge';
import { formatDuration } from '@/core/format';
import { parentDir } from '@/core/save';
import { newJobId } from '@/core/tasks';
import type { OutputSpec } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OptionsGrid,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Button, Field, Input, Section, Segmented, Select, Spinner, Switch } from '@/components/ui';
import {
  COMMON_FORMATS,
  COMMON_SAMPLE_RATES,
  type TrackSummary,
  buildIntermediateOps,
  checkCompatibility,
  mergedName,
  startOffsets,
} from './logic';

const EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'ac3', 'mka', 'au',
];

const CHUNK = 20;

/**
 * One folder, reused by every run, rather than a new one per merge: the copies
 * inside it are cleared as soon as the join is done, so nothing is left to tell
 * one run's leftovers from another's.
 */
const STAGING_FOLDER = 'toolbox-audio-merge';

interface ProbedTrack {
  path: string;
  duration?: number | null;
  audio?: { codec: string; sampleRate?: number | null; channels?: number | null } | null;
}

/**
 * Throw away the re-encoded copies the conversion stage wrote.
 *
 * They are a second full copy of every track, useless the moment the join
 * finishes. `secure_delete` is the one backend command that removes files — the
 * frontend has no filesystem-remove permission — so it does the clearing, with a
 * single pass and only over paths this run wrote inside its own staging folder.
 */
async function discardStaged(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await call('secure_delete', { jobId: newJobId(), inputs: paths, passes: 1 });
  } catch {
    // Temp files the OS clears anyway — never worth failing a finished merge over.
  }
}

export default function MergeAudio() {
  const files = useToolFiles({ kinds: ['audio'], filterName: 'Audio', extensions: EXTENSIONS });
  const run = useToolRun('audio/merge', 'Merge Audio');
  const { spec, update } = useOutputSpec();

  const [probed, setProbed] = useState<Record<string, ProbedTrack>>({});
  const [reading, setReading] = useState(false);
  const [convertChoice, setConvertChoice] = useState<boolean | null>(null);
  const [monoChoice, setMonoChoice] = useState<boolean | null>(null);
  const [common, setCommon] = useState('mp3');
  const [rate, setRate] = useState(44100);
  const [name, setName] = useState('');
  const [stageError, setStageError] = useState<string | null>(null);

  const pathKey = files.paths.join('\n');
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    setProbed({});
    if (inputs.length === 0) {
      setReading(false);
      return;
    }
    let stale = false;
    setReading(true);
    void (async () => {
      for (let i = 0; i < inputs.length; i += CHUNK) {
        if (stale) return;
        try {
          const infos = await call<ProbedTrack[]>('probe_media', { inputs: inputs.slice(i, i + CHUNK) });
          if (stale) return;
          setProbed((current) => {
            const next = { ...current };
            for (const info of infos) next[info.path] = info;
            return next;
          });
        } catch {
          // Unreadable files stay out of the compatibility check.
        }
      }
      if (!stale) setReading(false);
    })();
    return () => {
      stale = true;
    };
  }, [pathKey]);

  const tracks: TrackSummary[] = useMemo(
    () =>
      files.files.map((file) => {
        const info = probed[file.path];
        return {
          path: file.path,
          extension: file.extension.toLowerCase(),
          duration: info?.duration ?? 0,
          codec: info?.audio?.codec ?? '',
          sampleRate: info?.audio?.sampleRate ?? 0,
          channels: info?.audio?.channels ?? 0,
        };
      }),
    [files.files, probed],
  );

  const compatibility = useMemo(() => checkCompatibility(tracks), [tracks]);
  const offsets = useMemo(() => startOffsets(tracks), [tracks]);
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration > 0 ? t.duration : 0), 0);

  const convert = convertChoice ?? !compatibility.copyable;
  const mono = monoChoice ?? compatibility.channelsDiffer;
  const defaultName = files.files.length > 0 ? mergedName(files.files[0].name) : '';
  const blockedByChannels = convert && compatibility.channelsDiffer && !mono;

  const execute = async () => {
    setStageError(null);
    run.reset();
    const originals = files.paths;
    if (originals.length < 2) return;

    // Filled in by the conversion stage, and cleared however this function ends.
    let staged: string[] = [];
    let joined: string[] = [];

    try {
      let inputs = originals;

      if (convert) {
        let temp: string;
        try {
          const paths = await appPaths();
          temp = `${paths.temp.replace(/\/+$/, '')}/${STAGING_FOLDER}`;
          await ensureDir(temp);
        } catch {
          setStageError('Toolbox could not create a working folder for the converted files. Check your disk space.');
          return;
        }
        const converted = await run.execute({
          command: 'process_video',
          total: originals.length,
          inputs: originals,
          label: `Convert ${originals.length} files to ${common.toUpperCase()}`,
          args: {
            inputs: originals,
            ops: buildIntermediateOps(common, rate, mono),
            output: { mode: 'custom', dir: temp, suffix: null, collision: 'rename', filename: null },
          },
        });
        staged = (converted?.results ?? [])
          .map((result) => result.path)
          .filter((path) => path.startsWith(`${temp}/`));

        // Whatever this stage produced is a pile of throwaway temp files, so the
        // result panel must never be left holding it: a stage that ends here
        // clears the result, and only the join below can put one back. A thrown
        // error has already cleared it and is on `run.error`.
        if (!converted) return;
        if (converted.cancelled) {
          run.reset();
          return;
        }
        if (converted.failures.length > 0 || converted.results.length !== originals.length) {
          run.reset();
          setStageError(
            'Some files could not be converted to a common format, so nothing was merged. Remove the failed files and try again.',
          );
          return;
        }
        inputs = converted.results.map((result) => result.path);
      }

      // `concat_media` resolves "same folder" against its first input, which after
      // a conversion is a temporary file — so the folder is pinned explicitly.
      const target: OutputSpec = {
        ...spec,
        mode: 'custom',
        dir: spec.mode === 'custom' ? spec.dir : parentDir(originals[0]),
        filename: (name.trim() || defaultName) || null,
      };

      const merged = await run.execute({
        command: 'concat_media',
        total: 1,
        inputs: originals,
        label: `Merge ${inputs.length} files`,
        args: { inputs, output: target, reEncode: false },
      });
      joined = (merged?.results ?? []).map((result) => result.path);
    } finally {
      // The merged file itself is never in the sweep, even if it was saved into
      // the staging folder under an intermediate's name.
      await discardStaged(staged.filter((path) => !joined.includes(path)));
    }
  };

  const sortByName = () => {
    void files.set([...files.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((f) => f.path));
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop the audio files to join"
            hint="They are joined top to bottom — drag a row to change the order"
            accept="Folders are expanded automatically"
            allowFolders
            reorderable
          />

          {files.files.length > 0 && (
            <Section
              title="Order"
              description={
                totalDuration > 0
                  ? `${files.files.length} tracks · ${formatDuration(totalDuration)} in total`
                  : `${files.files.length} tracks`
              }
              actions={
                <>
                  {reading && <Spinner />}
                  <Button size="sm" variant="ghost" onClick={sortByName} disabled={files.files.length < 2}>
                    Sort A–Z
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void files.set([...files.paths].reverse())}
                    disabled={files.files.length < 2}
                  >
                    Reverse
                  </Button>
                </>
              }
            >
              <ol className="divide-y divide-line">
                {tracks.map((track, index) => (
                  <li key={track.path} className="flex items-center gap-3 py-1.5 text-[12.5px]">
                    <span className="w-6 shrink-0 tabular-nums text-ink-faint">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-ink" title={track.path}>
                      {files.files[index]?.name}
                    </span>
                    <span className="hidden shrink-0 text-[11.5px] uppercase text-ink-faint sm:inline">
                      {track.codec || track.extension}
                    </span>
                    <span className="hidden shrink-0 text-[11.5px] text-ink-faint md:inline">
                      {track.sampleRate > 0 ? `${track.sampleRate / 1000} kHz` : '—'}
                      {track.channels > 0 ? ` · ${track.channels === 1 ? 'mono' : 'stereo'}` : ''}
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-ink-faint">
                      {track.duration > 0 ? formatDuration(track.duration) : '—'}
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-[11.5px] text-ink-faint">
                      at {formatDuration(offsets[index])}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {files.files.length > 1 && !compatibility.copyable && (
            <Alert
              tone={convert ? 'info' : 'warn'}
              title={convert ? 'These files will be converted before they are joined' : 'These files do not match'}
            >
              They have {compatibility.reasons.join(', ')}. A straight join copies the audio untouched, which only works
              when every file is identical in those respects.{' '}
              {convert
                ? `Each one is rewritten as ${common.toUpperCase()} at ${rate / 1000} kHz first.`
                : 'Turn on “Convert to a common format” or the join will fail.'}
            </Alert>
          )}

          {stageError && <Alert tone="danger" title="The merge did not run">{stageError}</Alert>}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Merged" />}
        </>
      }
      aside={
        <>
          <Section title="How to join">
            <div className="space-y-3">
              <Field
                inline
                label="Convert to a common format"
                hint={convert ? 'Every file is rewritten first' : 'Copies the audio untouched'}
              >
                <Switch checked={convert} onCheckedChange={setConvertChoice} />
              </Field>

              {convert ? (
                <>
                  <OptionsGrid>
                    <Field label="Format">
                      <Select value={common} onChange={(e) => setCommon(e.target.value)} options={COMMON_FORMATS} />
                    </Field>
                    <Field label="Sample rate">
                      <Select
                        value={String(rate)}
                        onChange={(e) => setRate(Number(e.target.value))}
                        options={COMMON_SAMPLE_RATES.map((r) => ({ value: String(r), label: `${r / 1000} kHz` }))}
                      />
                    </Field>
                  </OptionsGrid>
                  <Field label="Channels" hint={compatibility.channelsDiffer ? 'The files differ, so they have to be matched up.' : undefined}>
                    <Segmented
                      value={mono ? 'mono' : 'keep'}
                      onChange={(v) => setMonoChoice(v === 'mono')}
                      options={[
                        { value: 'keep', label: 'Keep' },
                        { value: 'mono', label: 'Mono' },
                      ]}
                      className="w-full"
                    />
                  </Field>
                  <p className="text-[11.5px] text-ink-faint">
                    MP3 and M4A are re-encoded at the encoder&rsquo;s default quality. Choose WAV or FLAC to lose nothing
                    on the way in.
                  </p>
                </>
              ) : (
                <p className="text-[11.5px] text-ink-faint">
                  The audio packets are copied straight through — instant, and with no quality loss. Every file has to
                  share the same codec, sample rate and channel count.
                </p>
              )}
            </div>
          </Section>

          <Section title="Merged file">
            <Field label="Name" hint="The extension is chosen for you.">
              <Input
                value={name}
                placeholder={defaultName || 'audio-merged'}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {totalDuration > 0 && (
              <p className="mt-2 text-[12px] text-ink-soft">
                Final length <Badge tone="accent">{formatDuration(totalDuration)}</Badge>
              </p>
            )}
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Merge"
            icon="Combine"
            disabled={files.files.length < 2 || blockedByChannels}
            disabledReason={
              files.files.length < 2
                ? 'Add at least two audio files.'
                : 'The files have different channel counts — choose Mono so they can be joined.'
            }
          />
        </>
      }
    />
  );
}
