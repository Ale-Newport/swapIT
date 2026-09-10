import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, shortenPath } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import { Badge, CopyButton, EmptyState, Icon, Section, Stat } from '@/components/ui';
import {
  formatBitrate,
  metadataJson,
  streamDetails,
  summaryStats,
  type MediaInfo,
} from './logic';

const KIND_ICON: Record<string, string> = {
  video: 'Video',
  audio: 'AudioLines',
  subtitle: 'Type',
  data: 'Braces',
};

export default function VideoMetadata() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos' });
  const run = useToolRun('video/metadata', 'Video Metadata');
  const [infos, setInfos] = useState<MediaInfo[]>([]);

  const paths = files.paths;
  const key = useMemo(() => JSON.stringify(paths), [paths]);

  const read = useCallback(async () => {
    if (paths.length === 0) {
      setInfos([]);
      return;
    }
    const result = await run.executeRaw<MediaInfo[]>({
      command: 'probe_media',
      total: paths.length,
      inputs: paths,
      label: `Read ${paths.length} file${paths.length === 1 ? '' : 's'}`,
      args: { inputs: paths },
    });
    setInfos(result ?? []);
  }, [paths, run]);

  // Read as soon as the selection changes — once per change, not per render.
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    void read();
  }, [key, read]);

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop videos here"
            hint="MP4, MOV, MKV, WebM, AVI — several at once is fine"
            allowFolders
          />

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void read()} />}

          {!run.running && !run.error && files.files.length > 0 && infos.length === 0 && (
            <Section title="Nothing read yet">
              <EmptyState
                icon="Info"
                title="No details were returned"
                description="Use “Read metadata” to try these files again."
              />
            </Section>
          )}

          {infos.map((info) => (
            <Section
              key={info.path}
              title={info.name}
              description={shortenPath(info.path, 3)}
              actions={
                <CopyButton
                  value={() => metadataJson([info])}
                  label="Copy JSON"
                  size="sm"
                  variant="ghost"
                />
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {summaryStats(info).map((tile) => (
                    <Stat key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />
                  ))}
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
                    Streams ({info.streams.length})
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="w-full min-w-[520px] border-collapse text-[12px]">
                      <thead>
                        <tr className="border-b border-line bg-canvas text-left text-[11px] uppercase tracking-wide text-ink-faint">
                          <th className="px-3 py-1.5 font-medium">#</th>
                          <th className="px-3 py-1.5 font-medium">Type</th>
                          <th className="px-3 py-1.5 font-medium">Codec</th>
                          <th className="px-3 py-1.5 font-medium">Details</th>
                          <th className="px-3 py-1.5 font-medium">Bitrate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.streams.map((stream) => (
                          <tr key={stream.index} className="border-b border-line/60 last:border-0">
                            <td className="px-3 py-1.5 text-ink-faint">{stream.index}</td>
                            <td className="px-3 py-1.5">
                              <span className="inline-flex items-center gap-1.5 text-ink-soft">
                                <Icon name={KIND_ICON[stream.kind] ?? 'File'} size={13} />
                                {stream.kind || 'unknown'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-ink selectable" title={stream.codecLong}>
                              {stream.codec || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-ink-soft selectable">{streamDetails(stream)}</td>
                            <td className="px-3 py-1.5 text-ink-soft">{formatBitrate(stream.bitrate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
                    Container tags ({info.tags.length})
                  </p>
                  {info.tags.length === 0 ? (
                    <p className="text-[12px] text-ink-faint">
                      This file carries no container tags — no title, encoder or creation date.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-line">
                      <table className="w-full border-collapse text-[12px]">
                        <tbody>
                          {info.tags.map(([tagKey, value]) => (
                            <tr key={tagKey} className="border-b border-line/60 last:border-0">
                              <td className="w-1/3 px-3 py-1.5 align-top text-ink-faint">{tagKey}</td>
                              <td className="px-3 py-1.5 text-ink selectable break-words">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </Section>
          ))}
        </>
      }
      aside={
        <>
          <Section title="Selection">
            <div className="space-y-3">
              <Stat
                label="Files read"
                value={`${infos.length} of ${files.files.length}`}
                hint={files.files.length > 0 ? formatBytes(files.totalSize) : undefined}
              />
              {infos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(infos.map((i) => i.video?.codec).filter(Boolean))].map((codec) => (
                    <Badge key={codec}>{codec}</Badge>
                  ))}
                </div>
              )}
              <CopyButton
                value={() => metadataJson(infos)}
                label={infos.length > 1 ? 'Copy all as JSON' : 'Copy as JSON'}
                size="md"
                disabled={infos.length === 0}
                className="w-full"
              />
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void read()}
            label="Read metadata"
            icon="Info"
            disabled={files.isEmpty}
            disabledReason="Add at least one video first."
          />
        </>
      }
    />
  );
}
