/** Shared shape of the `probe_media` command's reply. */
export interface StreamInfo {
  index: number;
  kind: string;
  codec: string;
  codecLong: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
  channelLayout?: string | null;
  pixFmt?: string | null;
  language?: string | null;
}

export interface MediaInfo {
  path: string;
  name: string;
  size: number;
  duration?: number | null;
  formatName: string;
  formatLong: string;
  bitrate?: number | null;
  streams: StreamInfo[];
  tags: Array<[string, string]>;
  video?: StreamInfo | null;
  audio?: StreamInfo | null;
}

/** Picture codecs that show up as a "video" stream inside an audio file. */
const PICTURE_CODECS = new Set(['mjpeg', 'png', 'bmp', 'gif', 'webp', 'jpeg', 'jpg']);

export interface CoverArt {
  codec: string;
  width: number | null;
  height: number | null;
}

/**
 * Embedded artwork is carried as a still picture stream. Anything else with a
 * moving frame rate is a real video track, not a cover.
 */
export function findCoverArt(streams: StreamInfo[]): CoverArt | null {
  for (const stream of streams) {
    if (stream.kind !== 'video') continue;
    if (!PICTURE_CODECS.has(stream.codec.toLowerCase())) continue;
    return {
      codec: stream.codec.toLowerCase(),
      width: stream.width ?? null,
      height: stream.height ?? null,
    };
  }
  return null;
}

/** "1,411 kbps" — kbps is how every audio app reports a bitrate. */
export function formatBitrate(bitsPerSecond: number | null | undefined): string {
  if (!bitsPerSecond || bitsPerSecond <= 0) return '—';
  const kbps = Math.round(bitsPerSecond / 1000);
  return `${kbps.toLocaleString()} kbps`;
}

export function formatSampleRate(hertz: number | null | undefined): string {
  if (!hertz || hertz <= 0) return '—';
  const khz = hertz / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

export function formatChannels(count: number | null | undefined, layout: string | null | undefined): string {
  if (!count || count <= 0) return '—';
  const name = count === 1 ? 'Mono' : count === 2 ? 'Stereo' : `${count} channels`;
  return layout && layout !== 'mono' && layout !== 'stereo' ? `${name} · ${layout}` : name;
}

/** Turn an FFprobe tag key such as `album_artist` or `TPE2` into a readable label. */
export function tagLabel(key: string): string {
  const known: Record<string, string> = {
    album_artist: 'Album artist',
    albumartist: 'Album artist',
    track: 'Track',
    disc: 'Disc',
    date: 'Date',
    tsrc: 'ISRC',
    tpe2: 'Album artist',
    tbpm: 'BPM',
    encoded_by: 'Encoded by',
    major_brand: 'Major brand',
    minor_version: 'Minor version',
    compatible_brands: 'Compatible brands',
  };
  const lower = key.toLowerCase();
  if (known[lower]) return known[lower];
  const spaced = lower.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
