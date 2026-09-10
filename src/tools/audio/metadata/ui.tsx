import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { asToolboxError, call } from '@/core/bridge';
import { formatBytes, formatDuration } from '@/core/format';
import type { ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { ErrorDisplay, FileDropZone, ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, EmptyState, Field, Icon, Section, Select, Spinner, Stat } from '@/components/ui';
import { findCoverArt, formatBitrate, formatChannels, formatSampleRate, tagLabel } from './logic';
import type { MediaInfo } from './logic';

/** Module-level so the identity stays stable across renders. */
const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function AudioMetadata() {
  const files = useToolFiles({ kinds: ['audio'], extensions: AUDIO_EXTENSIONS, filterName: 'Audio' });
  const navigate = useNavigate();
  const [infos, setInfos] = useState<MediaInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const pathKey = files.paths.join('\n');
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    if (inputs.length === 0) {
      setInfos([]);
      setError(null);
      return;
    }
    let stale = false;
    setLoading(true);
    setError(null);
    void call<MediaInfo[]>('probe_media', { inputs })
      .then((result) => {
        if (stale) return;
        setInfos(result);
        setSelected((current) => (current && result.some((i) => i.path === current) ? current : (result[0]?.path ?? null)));
      })
      .catch((err) => {
        if (!stale) {
          setInfos([]);
          setError(asToolboxError(err));
        }
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [pathKey, reloadToken]);

  const info = useMemo(() => infos.find((i) => i.path === selected) ?? infos[0] ?? null, [infos, selected]);
  const cover = info ? findCoverArt(info.streams) : null;
  const audio = info?.audio ?? null;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop audio files here"
            hint="Everything is read locally with FFprobe — nothing leaves your Mac"
            allowFolders
          />

          {loading && (
            <div className="flex items-center gap-2 py-6 text-[12.5px] text-ink-faint">
              <Spinner /> Reading media information…
            </div>
          )}

          {error && <ErrorDisplay error={error} onRetry={() => setReloadToken((t) => t + 1)} />}

          {infos.length > 1 && (
            <Section title="File" description={`${infos.length} files read`}>
              <Field label="Showing details for">
                <Select
                  value={info?.path ?? ''}
                  onChange={(e) => setSelected(e.target.value)}
                  options={infos.map((i) => ({ value: i.path, label: i.name }))}
                />
              </Field>
            </Section>
          )}

          {info && (
            <>
              <Section
                title={info.name}
                description={info.formatLong || info.formatName || 'Audio file'}
                actions={
                  <CopyButton
                    value={() => JSON.stringify(info, null, 2)}
                    label="Copy JSON"
                    size="sm"
                  />
                }
              >
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Duration" value={formatDuration(info.duration)} />
                  <Stat
                    label="Codec"
                    value={audio?.codec ? audio.codec.toUpperCase() : '—'}
                    hint={audio?.codecLong || undefined}
                  />
                  <Stat
                    label="Bitrate"
                    value={formatBitrate(audio?.bitrate ?? info.bitrate)}
                    hint={audio?.bitrate ? undefined : 'container average'}
                  />
                  <Stat label="Sample rate" value={formatSampleRate(audio?.sampleRate)} />
                  <Stat label="Channels" value={formatChannels(audio?.channels, audio?.channelLayout)} />
                  <Stat label="Size" value={formatBytes(info.size)} />
                </div>
              </Section>

              {cover && (
                <Alert
                  tone="info"
                  title="This file has embedded cover art"
                  action={
                    <Button
                      size="sm"
                      icon="Disc3"
                      onClick={() => navigate('/t/audio/cover-art', { state: { files: [info.path] } })}
                    >
                      Extract it
                    </Button>
                  }
                >
                  {cover.width && cover.height
                    ? `${cover.width} × ${cover.height} ${cover.codec.toUpperCase()} picture stored inside the file.`
                    : `A ${cover.codec.toUpperCase()} picture is stored inside the file.`}
                </Alert>
              )}

              <Section
                title="Tags"
                description={info.tags.length > 0 ? `${info.tags.length} tag${info.tags.length === 1 ? '' : 's'}` : undefined}
                actions={
                  info.tags.length > 0 ? (
                    <CopyButton
                      value={() => info.tags.map(([k, v]) => `${tagLabel(k)}: ${v}`).join('\n')}
                      label="Copy tags"
                      size="sm"
                      variant="ghost"
                    />
                  ) : undefined
                }
              >
                {info.tags.length === 0 ? (
                  <EmptyState
                    icon="Tags"
                    title="No tags in this file"
                    description="Nothing was written into the container — no title, artist or album."
                  />
                ) : (
                  <dl className="divide-y divide-line">
                    {info.tags.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3 py-1.5">
                        <dt className="truncate text-[12.5px] text-ink-faint" title={key}>
                          {tagLabel(key)}
                        </dt>
                        <dd className="selectable break-words text-[12.5px] text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Section>

              {info.streams.length > 1 && (
                <Section title="Streams" description={`${info.streams.length} streams in the container`}>
                  <ul className="divide-y divide-line">
                    {info.streams.map((stream) => (
                      <li key={stream.index} className="flex items-center gap-3 py-1.5 text-[12.5px]">
                        <Icon
                          name={stream.kind === 'video' ? 'Image' : 'AudioLines'}
                          size={14}
                          className="shrink-0 text-ink-faint"
                        />
                        <span className="w-6 shrink-0 tabular-nums text-ink-faint">#{stream.index}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">
                          {stream.codecLong || stream.codec || stream.kind}
                        </span>
                        {stream.width && stream.height && (
                          <Badge>
                            {stream.width} × {stream.height}
                          </Badge>
                        )}
                        {stream.sampleRate ? <Badge>{formatSampleRate(stream.sampleRate)}</Badge> : null}
                        {stream.language && <Badge>{stream.language}</Badge>}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {infos.length > 1 && (
                <div className="flex justify-end">
                  <CopyButton
                    value={() => JSON.stringify(infos, null, 2)}
                    label={`Copy all ${infos.length} as JSON`}
                    size="sm"
                    variant="ghost"
                  />
                </div>
              )}
            </>
          )}
        </>
      }
    />
  );
}
