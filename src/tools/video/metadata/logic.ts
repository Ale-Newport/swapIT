import { formatBytes, formatDuration } from '@/core/format';

/** Mirrors `StreamInfo` in `src-tauri/src/cmd/media.rs`. */
export interface StreamInfo {
  index: number;
  kind: string;
  codec: string;
  codecLong: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  channelLayout: string | null;
  pixFmt: string | null;
  language: string | null;
}

/** Mirrors `MediaInfo` in `src-tauri/src/cmd/media.rs`. */
export interface MediaInfo {
  path: string;
  name: string;
  size: number;
  duration: number | null;
  formatName: string;
  formatLong: string;
  bitrate: number | null;
  streams: StreamInfo[];
  tags: Array<[string, string]>;
  video: StreamInfo | null;
  audio: StreamInfo | null;
}

export function formatBitrate(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps) || bps <= 0) return '—';
  if (bps < 1000) return `${Math.round(bps)} bps`;
  if (bps < 1_000_000) return `${Math.round(bps / 1000)} kbps`;
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

export function formatFps(fps: number | null | undefined): string {
  if (fps === null || fps === undefined || !Number.isFinite(fps) || fps <= 0) return '—';
  const rounded = Math.round(fps * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} fps`;
}

export function formatResolution(width: number | null, height: number | null): string {
  if (!width || !height) return '—';
  return `${width} × ${height}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** "16:9" when the ratio is a tidy one, "2.39:1" when it is not. */
export function aspectRatio(width: number | null, height: number | null): string | null {
  if (!width || !height) return null;
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;
  if (w <= 50 && h <= 50) return `${w}:${h}`;
  return `${(width / height).toFixed(2)}:1`;
}

export function channelLabel(stream: StreamInfo): string {
  if (stream.channelLayout) return stream.channelLayout;
  if (!stream.channels) return '—';
  if (stream.channels === 1) return 'mono';
  if (stream.channels === 2) return 'stereo';
  return `${stream.channels} channels`;
}

/** One line describing what a stream actually contains. */
export function streamDetails(stream: StreamInfo): string {
  const parts: string[] = [];
  if (stream.kind === 'video') {
    if (stream.width && stream.height) parts.push(formatResolution(stream.width, stream.height));
    if (stream.fps) parts.push(formatFps(stream.fps));
    if (stream.pixFmt) parts.push(stream.pixFmt);
  } else if (stream.kind === 'audio') {
    if (stream.sampleRate) parts.push(`${(stream.sampleRate / 1000).toFixed(1).replace(/\.0$/, '')} kHz`);
    parts.push(channelLabel(stream));
  }
  if (stream.language) parts.push(stream.language);
  return parts.filter(Boolean).join(' · ') || '—';
}

export interface StatTile {
  label: string;
  value: string;
  hint?: string;
}

/** The seven tiles shown above the tables, in a fixed order. */
export function summaryStats(info: MediaInfo): StatTile[] {
  const video = info.video;
  const ratio = aspectRatio(video?.width ?? null, video?.height ?? null);
  return [
    { label: 'Duration', value: info.duration ? formatDuration(info.duration) : '—' },
    {
      label: 'Resolution',
      value: formatResolution(video?.width ?? null, video?.height ?? null),
      ...(ratio ? { hint: ratio } : {}),
    },
    { label: 'Frame rate', value: formatFps(video?.fps) },
    { label: 'Video codec', value: video?.codec || 'none', ...(video?.pixFmt ? { hint: video.pixFmt } : {}) },
    {
      label: 'Audio codec',
      value: info.audio?.codec || 'none',
      ...(info.audio ? { hint: channelLabel(info.audio) } : {}),
    },
    { label: 'Bitrate', value: formatBitrate(info.bitrate) },
    { label: 'Size', value: formatBytes(info.size), ...(info.formatName ? { hint: info.formatName } : {}) },
  ];
}

/** Everything ffprobe reported, as JSON a person can paste somewhere useful. */
export function metadataJson(infos: MediaInfo[]): string {
  const plain = infos.map((info) => ({
    file: info.name,
    path: info.path,
    size: info.size,
    duration: info.duration,
    container: { name: info.formatName, description: info.formatLong },
    bitrate: info.bitrate,
    streams: info.streams,
    tags: Object.fromEntries(info.tags),
  }));
  return JSON.stringify(plain.length === 1 ? plain[0] : plain, null, 2);
}
