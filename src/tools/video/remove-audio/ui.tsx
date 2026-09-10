import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
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
import { Alert, Badge, Field, Icon, Section, Select, Spinner, Switch } from '@/components/ui';
import {
  describeAudioStream,
  summarise,
  summaryLine,
  type AudioState,
  type AudioStreamLike,
} from './logic';

interface ProbedMedia {
  path: string;
  audio?: AudioStreamLike | null;
}

interface Entry {
  state: AudioState;
  stream: AudioStreamLike | null;
}

const QUALITY = [
  { value: '18', label: 'High — larger file' },
  { value: '23', label: 'Balanced' },
  { value: '28', label: 'Small — softer detail' },
];

/**
 * One ffprobe per file, four at a time, reporting each answer as it lands so a
 * 300-file drop fills in progressively instead of blocking on the whole batch.
 */
async function probeAudio(
  paths: string[],
  onResult: (path: string, entry: Entry) => void,
  signal: { cancelled: boolean },
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(4, paths.length) }, async () => {
    while (next < paths.length && !signal.cancelled) {
      const path = paths[next++];
      try {
        const [info] = await call<ProbedMedia[]>('probe_media', { inputs: [path] });
        onResult(
          path,
          info?.audio ? { state: 'has-audio', stream: info.audio } : { state: 'silent', stream: null },
        );
      } catch {
        onResult(path, { state: 'unknown', stream: null });
      }
    }
  });
  await Promise.all(workers);
}

export default function RemoveAudio() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos' });
  const run = useToolRun('video/remove-audio', 'Remove Audio');
  const { spec, update } = useOutputSpec({ suffix: '-muted' });

  const [streamCopy, setStreamCopy] = useState(true);
  const [crf, setCrf] = useState('23');
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  const paths = files.paths;
  const pathKey = paths.join('|');
  useEffect(() => {
    if (paths.length === 0) {
      setEntries({});
      return;
    }
    const signal = { cancelled: false };
    setEntries(Object.fromEntries(paths.map((p) => [p, { state: 'checking' as AudioState, stream: null }])));
    void probeAudio(
      paths,
      (path, entry) => {
        if (signal.cancelled) return;
        setEntries((prev) => (path in prev ? { ...prev, [path]: entry } : prev));
      },
      signal,
    );
    return () => {
      signal.cancelled = true;
    };
    // `paths` is a new array on every render; the joined key is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const rows = useMemo(
    () =>
      files.files.map((file) => ({
        file,
        entry: entries[file.path] ?? { state: 'checking' as AudioState, stream: null },
      })),
    [files.files, entries],
  );

  const summary = useMemo(() => summarise(rows.map((r) => r.entry.state)), [rows]);
  const targets = useMemo(
    () => rows.filter((r) => r.entry.state !== 'silent').map((r) => r.file.path),
    [rows],
  );

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: targets.length,
      inputs: targets,
      label: `Remove audio from ${targets.length} video${targets.length === 1 ? '' : 's'}`,
      args: {
        inputs: targets,
        ops: {
          removeAudio: true,
          copyStreams: streamCopy,
          crf: streamCopy ? undefined : Number(crf),
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
            label="Drop videos here"
            hint="MP4, MOV, MKV, AVI, WebM — the picture is kept exactly as it is"
            allowFolders
          />

          {!files.isEmpty && (
            <Section
              title="Audio tracks"
              description={summaryLine(summary)}
              actions={summary.checking > 0 ? <Spinner /> : <Badge>{targets.length} to process</Badge>}
            >
              <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {rows.map(({ file, entry }) => (
                  <li key={file.path} className="flex items-center gap-2.5 bg-panel px-3 py-2">
                    <Icon
                      name={entry.state === 'silent' ? 'VolumeX' : 'AudioLines'}
                      size={14}
                      className={entry.state === 'silent' ? 'shrink-0 text-ink-faint' : 'shrink-0 text-ink-soft'}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={file.path}>
                      {file.name}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(file.size)}</span>
                    {entry.state === 'checking' && <Badge>Checking…</Badge>}
                    {entry.state === 'has-audio' && <Badge tone="accent">{describeAudioStream(entry.stream)}</Badge>}
                    {entry.state === 'silent' && <Badge tone="warn">No audio — skipped</Badge>}
                    {entry.state === 'unknown' && <Badge tone="warn">Could not read</Badge>}
                  </li>
                ))}
              </ul>
              {summary.silent > 0 && (
                <Alert tone="info" className="mt-3">
                  {summary.silent} file{summary.silent === 1 ? ' has' : 's have'} no audio track at all, so
                  {summary.silent === 1 ? ' it is' : ' they are'} left untouched — no copy is written.
                </Alert>
              )}
              {summary.unknown > 0 && (
                <Alert tone="warn" className="mt-2">
                  {summary.unknown} file{summary.unknown === 1 ? '' : 's'} could not be inspected. They are still
                  processed, and any real problem will show up as a failure in the results.
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
          <Section title="How to write it">
            <div className="space-y-3">
              <Field
                inline
                label="Copy the video stream"
                hint="No re-encode — seconds, not minutes, and no quality loss"
              >
                <Switch checked={streamCopy} onCheckedChange={setStreamCopy} />
              </Field>
              {streamCopy ? (
                <Alert tone="info">
                  The video stream is copied byte for byte and only the audio is dropped. The result keeps the original
                  codec, resolution and quality.
                </Alert>
              ) : (
                <>
                  <Field label="Quality" hint="Applies to H.264, H.265 and VP9 output.">
                    <Select value={crf} onChange={(e) => setCrf(e.target.value)} options={QUALITY} />
                  </Field>
                  <Alert tone="warn">
                    Re-encoding takes far longer and loses a little quality. Only turn the copy off if a file refuses to
                    mute — some unusual codecs cannot be copied into their own container.
                  </Alert>
                </>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Remove audio"
            icon="VolumeX"
            disabled={targets.length === 0}
            disabledReason={
              files.isEmpty ? 'Add at least one video first.' : 'None of these files has an audio track to remove.'
            }
          />
        </>
      }
    />
  );
}
