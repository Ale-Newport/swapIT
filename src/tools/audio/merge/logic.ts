/** What `probe_media` tells us about one track, reduced to what merging needs. */
export interface TrackSummary {
  path: string;
  extension: string;
  duration: number;
  codec: string;
  sampleRate: number;
  channels: number;
}

/** Containers that survive a stream-copy join once every input matches. */
export const COMMON_FORMATS = [
  { value: 'mp3', label: 'MP3 (.mp3)' },
  { value: 'wav', label: 'WAV — lossless (.wav)' },
  { value: 'flac', label: 'FLAC — lossless (.flac)' },
  { value: 'm4a', label: 'M4A / AAC (.m4a)' },
];

export const COMMON_SAMPLE_RATES = [44100, 48000];

export interface Compatibility {
  /** True when the files can be joined without touching the audio. */
  copyable: boolean;
  /** Plain-language descriptions of what differs. */
  reasons: string[];
  /** Channel counts differ, which a copy-join cannot bridge. */
  channelsDiffer: boolean;
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Decide whether a plain stream-copy join will work. Only tracks FFprobe could
 * read take part: an unreadable file is not evidence of a mismatch.
 */
export function checkCompatibility(tracks: TrackSummary[]): Compatibility {
  const known = tracks.filter((t) => t.codec);
  const reasons: string[] = [];
  if (known.length < 2) return { copyable: true, reasons, channelsDiffer: false };

  const codecs = distinct(known.map((t) => t.codec));
  const rates = distinct(known.map((t) => t.sampleRate).filter((r) => r > 0));
  const channels = distinct(known.map((t) => t.channels).filter((c) => c > 0));
  const extensions = distinct(tracks.map((t) => t.extension).filter(Boolean));

  if (extensions.length > 1) reasons.push(`different containers (${extensions.join(', ')})`);
  if (codecs.length > 1) reasons.push(`different codecs (${codecs.join(', ')})`);
  if (rates.length > 1) reasons.push(`different sample rates (${rates.map((r) => `${r / 1000} kHz`).join(', ')})`);
  if (channels.length > 1) reasons.push(`different channel counts (${channels.join(' and ')})`);

  return { copyable: reasons.length === 0, reasons, channelsDiffer: channels.length > 1 };
}

/**
 * The `ops` payload that rewrites every input into one identical shape before
 * they are joined. `audioOnly` drops artwork and picture streams, which is what
 * makes the copy-join safe: every intermediate then holds exactly one audio
 * stream with the same codec, rate and channel count.
 */
export function buildIntermediateOps(format: string, sampleRate: number, mono: boolean): Record<string, unknown> {
  if (!COMMON_FORMATS.some((f) => f.value === format)) {
    throw new Error(`“${format}” is not one of the formats files can be merged through.`);
  }
  const ops: Record<string, unknown> = { format, audioOnly: true };
  if (sampleRate > 0) ops.sampleRate = sampleRate;
  if (mono) ops.toMono = true;
  return ops;
}

/** Where each track starts inside the merged file. */
export function startOffsets(tracks: Array<{ duration: number }>): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const track of tracks) {
    offsets.push(running);
    running += Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0;
  }
  return offsets;
}

/** Default name for the joined file, derived from the first track. */
export function mergedName(firstName: string): string {
  const stem = firstName.replace(/\.[^.]+$/, '').trim();
  return `${stem || 'audio'}-merged`;
}
