import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
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
import { Alert, Badge, Field, Section, Select, Spinner } from '@/components/ui';

/** The slice of `probe_media`'s MediaInfo this tool needs. */
interface ProbedChannels {
  path: string;
  audio?: { channels?: number | null; channelLayout?: string | null } | null;
}

interface ChannelInfo {
  channels: number | null;
  layout: string | null;
}

const FORMATS = [
  { value: 'same', label: 'Same as the source' },
  { value: 'mp3', label: 'MP3 (.mp3)' },
  { value: 'm4a', label: 'M4A / AAC (.m4a)' },
  { value: 'wav', label: 'WAV — lossless (.wav)' },
  { value: 'flac', label: 'FLAC — lossless (.flac)' },
  { value: 'ogg', label: 'OGG Vorbis (.ogg)' },
];

function channelLabel(info: ChannelInfo | undefined): string {
  if (!info || info.channels === null) return 'Unknown';
  if (info.channels === 1) return 'Mono';
  if (info.channels === 2) return 'Stereo';
  return info.layout ? `${info.channels} channels · ${info.layout}` : `${info.channels} channels`;
}

/** Module-level so the identity stays stable across renders. */
const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function StereoToMono() {
  const files = useToolFiles({ kinds: ['audio'], extensions: AUDIO_EXTENSIONS, filterName: 'Audio' });
  const run = useToolRun('audio/mono', 'Stereo to Mono');
  const { spec, update } = useOutputSpec();
  const [format, setFormat] = useState('same');
  const [channels, setChannels] = useState<Record<string, ChannelInfo>>({});
  const [probing, setProbing] = useState(false);

  const pathKey = files.paths.join('\n');
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    if (inputs.length === 0) {
      setChannels({});
      return;
    }
    let stale = false;
    setProbing(true);
    void call<ProbedChannels[]>('probe_media', { inputs })
      .then((infos) => {
        if (stale) return;
        const next: Record<string, ChannelInfo> = {};
        for (const info of infos) {
          next[info.path] = {
            channels: info.audio?.channels ?? null,
            layout: info.audio?.channelLayout ?? null,
          };
        }
        setChannels(next);
      })
      .catch(() => {
        // Without FFprobe every file is treated as "unknown" and still processed.
        if (!stale) setChannels({});
      })
      .finally(() => {
        if (!stale) setProbing(false);
      });
    return () => {
      stale = true;
    };
  }, [pathKey]);

  const split = useMemo(() => {
    const targets: string[] = [];
    const alreadyMono: string[] = [];
    let surround = 0;
    for (const path of files.paths) {
      const info = channels[path];
      if (info?.channels === 1) alreadyMono.push(path);
      else {
        targets.push(path);
        if (info && info.channels !== null && info.channels > 2) surround += 1;
      }
    }
    return { targets, alreadyMono, surround };
  }, [files.paths, channels]);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: split.targets.length,
      inputs: split.targets,
      label: `Mix ${split.targets.length} file${split.targets.length === 1 ? '' : 's'} down to mono`,
      args: {
        inputs: split.targets,
        ops: {
          audioOnly: true,
          toMono: true,
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

          {files.files.length > 0 && (
            <Section
              title="Channels"
              description={
                probing
                  ? 'Reading channel counts…'
                  : `${split.targets.length} to convert${split.alreadyMono.length ? ` · ${split.alreadyMono.length} already mono` : ''}`
              }
              actions={probing ? <Spinner /> : undefined}
            >
              <ul className="divide-y divide-line">
                {files.files.slice(0, 12).map((file) => {
                  const info = channels[file.path];
                  const isMono = info?.channels === 1;
                  return (
                    <li key={file.path} className="flex items-center gap-3 py-1.5 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate text-ink" title={file.path}>
                        {file.name}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-ink-faint">{channelLabel(info)}</span>
                      {isMono ? (
                        <Badge tone="warn">Skipped</Badge>
                      ) : (
                        <Badge tone="accent">To mono</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
              {files.files.length > 12 && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  …and {files.files.length - 12} more file{files.files.length - 12 === 1 ? '' : 's'}.
                </p>
              )}
            </Section>
          )}

          {split.alreadyMono.length > 0 && (
            <Alert tone="info" title={`${split.alreadyMono.length} file${split.alreadyMono.length === 1 ? ' is' : 's are'} already mono`}>
              They are left untouched — re-encoding them would only lose quality.
            </Alert>
          )}

          {split.surround > 0 && (
            <Alert tone="warn" title={`${split.surround} file${split.surround === 1 ? ' has' : 's have'} more than two channels`}>
              The mixdown averages the front left and right channels only, so centre, LFE and surround content is
              dropped. For film audio, downmix to stereo first.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Output format">
            <div className="space-y-3">
              <Field
                label="Format"
                hint="Audio is re-encoded at the encoder's default quality (128 kbps for MP3 and M4A). Pick WAV or FLAC to stay lossless."
              >
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                Left and right are averaged into one channel, which typically halves an uncompressed file and cuts a
                compressed one noticeably.
              </p>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={split.targets.length > 0 ? `Convert ${split.targets.length} to mono` : 'Convert to mono'}
            icon="Podcast"
            disabled={split.targets.length === 0 || probing}
            disabledReason={
              files.isEmpty
                ? 'Add at least one audio file first.'
                : probing
                  ? 'Reading channel counts so mono files can be left alone.'
                  : 'Every file you added is already mono, so there is nothing to convert.'
            }
          />
        </>
      }
    />
  );
}
