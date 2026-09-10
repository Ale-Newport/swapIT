// optional-dependency: yt-dlp is required and gated by the tool page; FFmpeg is only
// needed by some choices, so it is probed here and blocks just those controls.
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { appPaths, asToolboxError, call, checkBinary } from '@/core/bridge';
import { formatBytes, formatDuration, shortenPath } from '@/core/format';
import { useTaskStore } from '@/core/tasks';
import type { BinaryStatus, ToolboxError } from '@/core/types';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, ResultPanel, ToolActions, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  Input,
  Section,
  Switch,
} from '@/components/ui';
import {
  QUALITY_PRESETS,
  buildDownloadOpts,
  codecLabel,
  describeFormat,
  findFormat,
  formatKind,
  formatWireReason,
  isCustomFormat,
  isSelectableFormat,
  isUsableUrl,
  needsFfmpeg,
  sortFormats,
  tidyProgressLine,
  urlProblem,
  type QualityPreset,
  type QualityValue,
  type RemoteMediaInfo,
} from './logic';

/** The preset row, with the choices FFmpeg is required for greyed out when it is absent. */
function QualityChips({
  presets,
  value,
  blocked,
  blockedTitle,
  onSelect,
}: {
  presets: QualityPreset[];
  value: string | undefined;
  blocked: (preset: QualityPreset) => boolean;
  blockedTitle: string;
  onSelect: (value: QualityValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((preset) => {
        const unavailable = blocked(preset);
        return (
          <button
            key={preset.value}
            type="button"
            disabled={unavailable}
            title={unavailable ? blockedTitle : preset.hint}
            onClick={() => onSelect(preset.value)}
            className={clsx(
              'rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors',
              unavailable
                ? // The chosen preset still reads as chosen when it cannot run, so the
                  // greyed-out chip and the button's reason describe the same thing.
                  value === preset.value
                  ? 'cursor-not-allowed border-line-strong bg-canvas text-ink-soft opacity-70'
                  : 'cursor-not-allowed border-line bg-canvas text-ink-faint opacity-55'
                : value === preset.value
                  ? 'border-ink bg-ink text-panel'
                  : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

export default function MediaDownloader() {
  const run = useToolRun('convert/media-downloader', 'Media Downloader');

  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<RemoteMediaInfo | null>(null);
  const [infoUrl, setInfoUrl] = useState('');
  const [infoError, setInfoError] = useState<ToolboxError | null>(null);
  const [reading, setReading] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
  const [showFormats, setShowFormats] = useState(false);

  const [quality, setQuality] = useState<string>('best');
  const [playlist, setPlaylist] = useState(false);
  const [embedThumbnail, setEmbedThumbnail] = useState(false);
  const [writeSubtitles, setWriteSubtitles] = useState(false);

  const [dir, setDir] = useState('');
  const [dirError, setDirError] = useState<string | null>(null);

  const [ffmpeg, setFfmpeg] = useState<BinaryStatus | null>(null);
  const [ffmpegChecked, setFfmpegChecked] = useState(false);
  const [ffmpegProbe, setFfmpegProbe] = useState(0);

  const liveLine = useTaskStore((s) => tidyProgressLine(s.tasks.find((t) => t.id === run.taskId)?.message ?? null));

  useEffect(() => {
    let stale = false;
    void appPaths()
      .then((paths) => {
        if (!stale) setDir((current) => current || paths.downloads);
      })
      .catch(() => {
        if (!stale) setDirError('Toolbox could not find your Downloads folder — choose where to save below.');
      });
    return () => {
      stale = true;
    };
  }, []);

  // yt-dlp calls FFmpeg to merge streams, cap a height or re-encode to MP3, but the
  // tool still works without it, so it is checked here rather than gating the page.
  useEffect(() => {
    let stale = false;
    void checkBinary('ffmpeg')
      .then((status) => {
        if (!stale) setFfmpeg(status);
      })
      .catch(() => {
        if (!stale) setFfmpeg(null);
      })
      .finally(() => {
        if (!stale) setFfmpegChecked(true);
      });
    return () => {
      stale = true;
    };
  }, [ffmpegProbe]);

  const trimmedUrl = url.trim();
  const problem = urlProblem(url);
  const ready = isUsableUrl(url);

  // Everything read from a link belongs to that link — an edited field shows nothing.
  const shownInfo = info && infoUrl === trimmedUrl ? info : null;
  const sorted = useMemo(() => (shownInfo ? sortFormats(shownInfo.formats) : []), [shownInfo]);
  const unselectable = sorted.filter((format) => !isSelectableFormat(format)).length;
  const custom = isCustomFormat(quality);
  const chosenFormat = custom && shownInfo ? findFormat(shownInfo.formats, quality) : undefined;
  const preset = QUALITY_PRESETS.find((p) => p.value === quality);

  const ffmpegLabel = ffmpeg?.label ?? 'FFmpeg';
  const ffmpegMissing = ffmpegChecked && !ffmpeg?.installed;
  const ffmpegBlocks = ffmpegMissing && needsFfmpeg({ quality, embedThumbnail });

  const changeUrl = (next: string) => {
    setUrl(next);
    if (next.trim() === infoUrl) return;
    // A format id only means something for the link it was read from.
    setInfoError(null);
    if (isCustomFormat(quality)) setQuality('best');
  };

  const fetchInfo = async () => {
    if (!ready || reading) return;
    setReading(true);
    setInfoError(null);
    setThumbBroken(false);
    try {
      const result = await call<RemoteMediaInfo>('remote_media_info', { url: trimmedUrl });
      setInfo(result);
      setInfoUrl(trimmedUrl);
      setShowFormats(false);
      // A format id from a previous link means nothing for this one.
      if (isCustomFormat(quality)) setQuality('best');
    } catch (err) {
      setInfo(null);
      setInfoError(asToolboxError(err));
    } finally {
      setReading(false);
    }
  };

  const pickFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') {
      setDir(picked);
      setDirError(null);
    }
  };

  const download = () =>
    void run.execute({
      command: 'download_media',
      total: 1,
      label: shownInfo ? `Download “${shownInfo.title}”` : 'Download media',
      args: {
        url: trimmedUrl,
        opts: buildDownloadOpts({ quality, playlist, embedThumbnail, writeSubtitles }),
        outputDir: dir,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <Alert tone="warn" title="Only download media you are allowed to keep">
            <p>
              This tool is for media you created yourself, media in the public domain, and media you are licensed to
              download. Toolbox refuses DRM-protected services outright and will not circumvent access controls,
              paywalls or sign-in walls — those links are rejected before anything is fetched.
            </p>
          </Alert>

          <Section title="Link">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={url}
                  spellCheck={false}
                  placeholder="https://…"
                  aria-label="Media link"
                  onChange={(e) => changeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void fetchInfo();
                  }}
                />
                <Button
                  icon="Search"
                  loading={reading}
                  disabled={!ready}
                  title={ready ? 'Read the link' : 'Paste a complete http:// or https:// link first'}
                  onClick={() => void fetchInfo()}
                >
                  Read link
                </Button>
              </div>
              {problem ? (
                <p className="text-[11.5px] text-danger">{problem}</p>
              ) : (
                <p className="text-[11.5px] text-ink-faint">
                  Reading the link first shows the title and every format on offer. You can also download straight away
                  with the settings on the right.
                </p>
              )}
            </div>
          </Section>

          {infoError && <ErrorDisplay error={infoError} onRetry={() => void fetchInfo()} />}

          {shownInfo && (
            <Section
              title="Media"
              description={shownInfo.extractor ? `Read by the ${shownInfo.extractor} extractor` : undefined}
              actions={
                shownInfo.webpageUrl ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="ExternalLink"
                    onClick={() => void openUrl(shownInfo.webpageUrl)}
                  >
                    Open page
                  </Button>
                ) : undefined
              }
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="h-[90px] w-40 shrink-0 overflow-hidden rounded-lg border border-line bg-canvas">
                  {shownInfo.thumbnail && !thumbBroken ? (
                    <img
                      src={shownInfo.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setThumbBroken(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-faint">
                      <Icon name="Film" size={22} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="selectable text-[13.5px] font-medium leading-snug text-ink">{shownInfo.title}</p>
                  <p className="text-[12px] text-ink-faint">{shownInfo.uploader || 'Uploader unknown'}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {shownInfo.isLive ? (
                      <Badge tone="warn">Live</Badge>
                    ) : (
                      <Badge>{formatDuration(shownInfo.duration)}</Badge>
                    )}
                    {shownInfo.extractor && <Badge>{shownInfo.extractor}</Badge>}
                    <Badge>
                      {shownInfo.formats.length} format{shownInfo.formats.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </div>
              </div>

              {shownInfo.isLive && (
                <Alert tone="warn" className="mt-3" title="This is a live stream">
                  yt-dlp keeps recording until the stream ends or you cancel the job, so the file grows for as long as
                  it runs.
                </Alert>
              )}
            </Section>
          )}

          {shownInfo && sorted.length > 0 && (
            <Section
              title="All formats"
              description={`${sorted.length} reported by yt-dlp · pick one to override the quality preset`}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={showFormats ? 'ChevronDown' : 'ChevronRight'}
                  onClick={() => setShowFormats((v) => !v)}
                >
                  {showFormats ? 'Hide' : 'Show'}
                </Button>
              }
            >
              {showFormats ? (
                <div className="space-y-2.5">
                  {unselectable > 0 && (
                    <Alert tone="info" title={`${unselectable} of these cannot be asked for by name`}>
                      A format whose id is only digits — the numbering YouTube uses — reaches yt-dlp as “no taller than
                      that many pixels” rather than as that exact stream, so Toolbox does not offer it. Use a quality
                      preset for those.
                    </Alert>
                  )}
                  <div className="max-h-80 overflow-auto rounded-lg border border-line">
                    <table className="w-full min-w-[620px] border-collapse text-[12px]">
                      <thead className="sticky top-0 bg-canvas">
                        <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                          <th className="px-2.5 py-1.5 font-medium">ID</th>
                          <th className="px-2.5 py-1.5 font-medium">Ext</th>
                          <th className="px-2.5 py-1.5 font-medium">Resolution</th>
                          <th className="px-2.5 py-1.5 font-medium">Note</th>
                          <th className="px-2.5 py-1.5 font-medium">Size</th>
                          <th className="px-2.5 py-1.5 font-medium">Codecs</th>
                          <th className="px-2.5 py-1.5 font-medium" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {sorted.map((format) => {
                          const selected = quality === format.id;
                          const kind = formatKind(format);
                          const wireReason = formatWireReason(format.id);
                          return (
                            <tr key={format.id} className={clsx('bg-panel', selected && 'bg-accent-soft')}>
                              <td className="px-2.5 py-1.5 font-mono text-[11.5px] text-ink">{format.id}</td>
                              <td className="px-2.5 py-1.5 text-ink-soft">{format.ext || '—'}</td>
                              <td className="px-2.5 py-1.5 text-ink-soft">
                                {kind === 'audio' ? 'audio only' : format.resolution || '—'}
                                {format.fps ? ` · ${Math.round(format.fps)} fps` : ''}
                              </td>
                              <td className="max-w-[9rem] truncate px-2.5 py-1.5 text-ink-faint" title={format.note}>
                                {format.note || '—'}
                              </td>
                              <td className="px-2.5 py-1.5 text-ink-soft">
                                {format.filesize ? `≈ ${formatBytes(format.filesize)}` : '—'}
                              </td>
                              <td className="px-2.5 py-1.5 font-mono text-[11px] text-ink-faint">
                                {codecLabel(format)}
                              </td>
                              <td className="px-2.5 py-1.5 text-right">
                                {selected ? (
                                  <Badge tone="accent">Chosen</Badge>
                                ) : wireReason ? (
                                  <span className="text-[11px] text-ink-faint" title={wireReason}>
                                    Preset only
                                  </span>
                                ) : (
                                  <Button size="sm" variant="ghost" onClick={() => setQuality(format.id)}>
                                    Use
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-faint">
                  The presets cover almost everything. Open this table when you need one exact stream — a specific
                  codec, a video-only track, or the smallest file that still looks right.
                </p>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={download} />}
          {run.result && <ResultPanel result={run.result} title="Downloaded" onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Quality">
            <div className="space-y-3">
              <QualityChips
                presets={QUALITY_PRESETS}
                value={custom ? undefined : quality}
                blocked={(p) => ffmpegMissing && Boolean(p.needsFfmpeg)}
                blockedTitle={`${ffmpegLabel} is not installed, and this preset needs it`}
                onSelect={(value) => setQuality(value)}
              />
              {custom ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">Format {quality}</Badge>
                    {chosenFormat && <span className="text-[11.5px] text-ink-faint">{describeFormat(chosenFormat)}</span>}
                  </div>
                  <p className="text-[11.5px] text-ink-faint">
                    A single stream is downloaded exactly as the site serves it. Video-only formats arrive without
                    sound.
                  </p>
                  <Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => setQuality('best')}>
                    Back to presets
                  </Button>
                </div>
              ) : (
                <p className="text-[11.5px] text-ink-faint">{preset?.hint}</p>
              )}

              {ffmpegMissing && (
                <Alert tone="warn" title={`${ffmpegLabel} is not installed`}>
                  <p>
                    Merging a video track with its audio, capping the height and re-encoding to MP3 all run through{' '}
                    {ffmpegLabel}. Without it, “Audio · original” and single-stream formats from the table still work.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="selectable rounded-md border border-warn/25 bg-panel px-2 py-1 font-mono text-[11.5px] text-ink">
                      {ffmpeg?.installHint ?? 'brew install ffmpeg'}
                    </code>
                    <CopyButton value={ffmpeg?.installHint ?? 'brew install ffmpeg'} label="Copy command" size="sm" />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="RefreshCw"
                      onClick={() => setFfmpegProbe((n) => n + 1)}
                    >
                      Check again
                    </Button>
                  </div>
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Options">
            <div className="space-y-1">
              <Field
                inline
                label="Embed the thumbnail"
                hint={
                  ffmpegMissing
                    ? `Adds the cover image to the file — needs ${ffmpegLabel}`
                    : 'Adds the cover image to the file'
                }
              >
                <Switch checked={embedThumbnail} onCheckedChange={setEmbedThumbnail} disabled={ffmpegMissing} />
              </Field>
              <Field inline label="Download captions" hint="Auto-generated English and Spanish, as separate files">
                <Switch checked={writeSubtitles} onCheckedChange={setWriteSubtitles} />
              </Field>
              <Field inline label="Allow playlists" hint="Off means only the one item the link points at">
                <Switch checked={playlist} onCheckedChange={setPlaylist} />
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                  <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                  <span className="truncate text-[12.5px] text-ink-soft" title={dir}>
                    {dir ? shortenPath(dir, 3) : 'No folder chosen'}
                  </span>
                </div>
                <Button size="sm" onClick={() => void pickFolder()}>
                  Browse
                </Button>
              </div>
              {dirError ? (
                <p className="text-[11.5px] text-danger">{dirError}</p>
              ) : (
                <p className="text-[11.5px] text-ink-faint">
                  Existing files are never replaced — yt-dlp skips a name it already finds here.
                </p>
              )}
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={download}
            label="Download"
            icon="CloudDownload"
            disabled={!ready || !dir || ffmpegBlocks}
            disabledReason={
              !ready
                ? 'Paste a complete link first.'
                : !dir
                  ? 'Choose a folder to save into.'
                  : `${ffmpegLabel} is not installed, and this choice needs it — pick “Audio · original” or install it.`
            }
          />
          {run.running && liveLine && <p className="truncate text-[11.5px] text-ink-faint">{liveLine}</p>}
        </>
      }
    />
  );
}
