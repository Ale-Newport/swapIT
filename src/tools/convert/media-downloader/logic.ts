/**
 * Shapes and helpers for the yt-dlp bridge.
 *
 * `remote_media_info` returns yt-dlp's own view of a link, which is long, only
 * loosely ordered and full of codec strings nobody wants to read. Everything
 * that turns it into a table a person can scan lives here so it can be tested
 * without a network call.
 */

/** Mirrors `MediaFormat` in `src-tauri/src/cmd/misc.rs`. */
export interface MediaFormat {
  id: string;
  ext: string;
  /** "1920x1080" for video, "audio only" otherwise. */
  resolution: string;
  note: string;
  filesize: number | null;
  vcodec: string;
  acodec: string;
  fps: number | null;
}

/** Mirrors `RemoteMediaInfo` in `src-tauri/src/cmd/misc.rs`. */
export interface RemoteMediaInfo {
  title: string;
  uploader: string;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  extractor: string;
  isLive: boolean;
  formats: MediaFormat[];
}

export type QualityValue = 'best' | '1080' | '720' | '480' | 'audio-mp3' | 'audio-original';

export interface QualityPreset {
  value: QualityValue;
  label: string;
  hint: string;
  /** yt-dlp has to call FFmpeg for this preset — to merge two streams, or to re-encode. */
  needsFfmpeg?: boolean;
}

export const QUALITY_PRESETS: QualityPreset[] = [
  {
    value: 'best',
    label: 'Best video',
    hint: 'The highest resolution available, merged with the best audio.',
    needsFfmpeg: true,
  },
  { value: '1080', label: '1080p', hint: 'Capped at 1080p and written as MP4.', needsFfmpeg: true },
  { value: '720', label: '720p', hint: 'Capped at 720p and written as MP4.', needsFfmpeg: true },
  {
    value: '480',
    label: '480p',
    hint: 'Capped at 480p and written as MP4 — smallest usable video.',
    needsFfmpeg: true,
  },
  {
    value: 'audio-mp3',
    label: 'Audio · MP3',
    hint: 'Audio only, re-encoded to MP3 at the best quality.',
    needsFfmpeg: true,
  },
  { value: 'audio-original', label: 'Audio · original', hint: 'Audio only, kept in whatever format the source uses.' },
];

export interface DownloadChoices {
  /** A preset, or a raw format id picked from the table. */
  quality: string;
  playlist: boolean;
  embedThumbnail: boolean;
  writeSubtitles: boolean;
}

/**
 * How a choice reaches `download_media` (src-tauri/src/cmd/misc.rs).
 *
 * The command reads one `quality` string and matches it, in this order:
 *
 * | value                                    | what yt-dlp is asked for                        |
 * | ---------------------------------------- | ----------------------------------------------- |
 * | `audio-mp3`, `audio-original`, `best`     | fixed argument sets                             |
 * | all digits (`1080`, `720`, `480`)         | a height cap: `bestvideo[height<=N]+bestaudio…` |
 * | anything else                             | forwarded verbatim as `-f <value>`              |
 *
 * The height arm is matched *before* the raw-format arm, so an all-digit value can
 * only ever mean "cap the height here". Every common YouTube itag (18, 22, 137,
 * 140, 248, 251) is all digits, so those streams cannot be requested exactly:
 * asking for 248 would ask for `height<=248` and fetch a 144p file instead. The
 * format table therefore only offers the rows whose id survives the trip — see
 * `formatWireProblem`.
 */
export function buildDownloadOpts(choices: DownloadChoices): Record<string, unknown> {
  return {
    quality: choices.quality,
    playlist: choices.playlist,
    embedThumbnail: choices.embedThumbnail,
    writeSubtitles: choices.writeSubtitles,
  };
}

/** The characters `download_media` is willing to forward as a raw format id. */
const FORMAT_ID_CHARS = /^[A-Za-z0-9._+-]+$/;

export type FormatWireProblem = 'numeric' | 'characters';

/** Why a format id cannot be sent as an exact stream request, or null when it can. */
export function formatWireProblem(id: string): FormatWireProblem | null {
  const trimmed = id.trim();
  if (!trimmed || !FORMAT_ID_CHARS.test(trimmed)) return 'characters';
  if (/^\d+$/.test(trimmed)) return 'numeric';
  return null;
}

const FORMAT_WIRE_REASON: Record<FormatWireProblem, string> = {
  numeric:
    'A digits-only id means “at most this many pixels tall” on the way to yt-dlp, not “this exact stream”, so Toolbox will not send it. Use a quality preset instead.',
  characters:
    'This id contains characters Toolbox will not put in a command, so it cannot be requested exactly. Use a quality preset instead.',
};

/** A sentence explaining why a row is not selectable, or null when it is. */
export function formatWireReason(id: string): string | null {
  const problem = formatWireProblem(id);
  return problem ? FORMAT_WIRE_REASON[problem] : null;
}

/** True when picking this row would download exactly the stream it describes. */
export function isSelectableFormat(format: MediaFormat): boolean {
  return formatWireProblem(format.id) === null;
}

/**
 * True when yt-dlp has to hand the download to FFmpeg: merging a video stream with
 * a separate audio one, or re-encoding to MP3. A single raw format id is written
 * as it arrives, but a `137+140` style merge is muxed by FFmpeg.
 */
export function qualityNeedsFfmpeg(quality: string): boolean {
  const preset = QUALITY_PRESETS.find((p) => p.value === quality);
  if (preset) return Boolean(preset.needsFfmpeg);
  return quality.includes('+');
}

/**
 * True when the whole download needs FFmpeg. `--embed-thumbnail` is an FFmpeg
 * post-processor; subtitles are written as separate files and need nothing.
 */
export function needsFfmpeg(choices: Pick<DownloadChoices, 'quality' | 'embedThumbnail'>): boolean {
  return qualityNeedsFfmpeg(choices.quality) || choices.embedThumbnail;
}

/**
 * The same shape check the backend does, so the button can be honest before the
 * call rather than bouncing a request. The backend stays the authority — it also
 * refuses DRM-protected hosts, which is deliberately not duplicated here.
 */
export function urlProblem(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return 'Links must start with http:// or https://.';
  if (/\s/.test(trimmed)) return 'That link contains spaces — check that it was pasted whole.';
  if (!/^https?:\/\/[^/\s]+\./i.test(trimmed)) return 'That does not look like a complete web address.';
  return null;
}

export function isUsableUrl(raw: string): boolean {
  return raw.trim().length > 0 && urlProblem(raw) === null;
}

export type FormatKind = 'video+audio' | 'video' | 'audio' | 'unknown';

export function formatKind(format: MediaFormat): FormatKind {
  const hasVideo = Boolean(format.vcodec) && format.vcodec !== 'none';
  const hasAudio = Boolean(format.acodec) && format.acodec !== 'none';
  if (hasVideo && hasAudio) return 'video+audio';
  if (hasVideo) return 'video';
  if (hasAudio) return 'audio';
  return 'unknown';
}

/** Vertical resolution, or 0 when the format carries no picture. */
export function heightOf(format: MediaFormat): number {
  const pair = /(\d+)\s*[x×]\s*(\d+)/.exec(format.resolution);
  if (pair) return Number(pair[2]);
  const p = /(\d{3,4})p/.exec(format.resolution);
  if (p) return Number(p[1]);
  return 0;
}

/** "avc1.640028" → "avc1"; "none" and blanks disappear. */
function shortCodec(codec: string): string {
  if (!codec || codec === 'none') return '';
  return codec.split('.')[0];
}

export function codecLabel(format: MediaFormat): string {
  const parts = [shortCodec(format.vcodec), shortCodec(format.acodec)].filter(Boolean);
  return parts.length ? parts.join(' + ') : '—';
}

/** Best first: pictures before sound, then resolution, frame rate and size. */
export function sortFormats(formats: MediaFormat[]): MediaFormat[] {
  const rank = (f: MediaFormat) => (formatKind(f) === 'audio' ? 1 : 0);
  return [...formats].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (heightOf(a) !== heightOf(b)) return heightOf(b) - heightOf(a);
    if ((a.fps ?? 0) !== (b.fps ?? 0)) return (b.fps ?? 0) - (a.fps ?? 0);
    return (b.filesize ?? 0) - (a.filesize ?? 0);
  });
}

/** A one-line description of a chosen format, for the badge above the button. */
export function describeFormat(format: MediaFormat): string {
  const kind = formatKind(format);
  const where = kind === 'audio' ? 'audio only' : (format.resolution || 'video');
  const bits = [format.ext.toUpperCase(), where];
  if (format.note) bits.push(format.note);
  return bits.filter(Boolean).join(' · ');
}

export function findFormat(formats: MediaFormat[], id: string): MediaFormat | undefined {
  return formats.find((f) => f.id === id);
}

/** True when `quality` is a raw format id rather than one of the presets. */
export function isCustomFormat(quality: string): boolean {
  return !QUALITY_PRESETS.some((p) => p.value === quality);
}

/**
 * yt-dlp prints a running commentary; the useful half is the download line.
 * Anything else is shown as-is rather than hidden, so a stall is visible.
 */
export function tidyProgressLine(line: string | null): string | null {
  if (!line) return null;
  const trimmed = line.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^\[download\]\s*/i, '').replace(/\s+/g, ' ');
}
