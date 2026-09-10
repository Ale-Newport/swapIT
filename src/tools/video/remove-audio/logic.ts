export interface AudioStreamLike {
  codec?: string | null;
  channels?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
}

/** 'checking' until ffprobe answers; 'unknown' when it could not be read. */
export type AudioState = 'checking' | 'has-audio' | 'silent' | 'unknown';

export function channelLabel(channels: number | null | undefined): string | null {
  const n = Number(channels);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return 'mono';
  if (n === 2) return 'stereo';
  if (n === 6) return '5.1';
  if (n === 8) return '7.1';
  return `${n} channels`;
}

export function formatBitrate(bitsPerSecond: number | null | undefined): string | null {
  const n = Number(bitsPerSecond);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(n / 1000)} kbps`;
}

/** "AAC · stereo · 192 kbps" — whichever parts ffprobe actually reported. */
export function describeAudioStream(stream: AudioStreamLike | null | undefined): string {
  if (!stream) return 'No audio track';
  const parts = [
    stream.codec ? stream.codec.toUpperCase() : null,
    channelLabel(stream.channels),
    formatBitrate(stream.bitrate),
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(' · ') : 'Audio track';
}

export interface AudioSummary {
  withAudio: number;
  silent: number;
  unknown: number;
  checking: number;
  /** Files worth sending to FFmpeg: anything not already known to be silent. */
  actionable: number;
}

export function summarise(states: AudioState[]): AudioSummary {
  const summary: AudioSummary = { withAudio: 0, silent: 0, unknown: 0, checking: 0, actionable: 0 };
  for (const state of states) {
    if (state === 'has-audio') summary.withAudio++;
    else if (state === 'silent') summary.silent++;
    else if (state === 'unknown') summary.unknown++;
    else summary.checking++;
    if (state !== 'silent') summary.actionable++;
  }
  return summary;
}

/** The line under the file list: what will happen when Run is pressed. */
export function summaryLine(summary: AudioSummary): string {
  if (summary.checking > 0) return `Checking ${summary.checking} more file${summary.checking === 1 ? '' : 's'}…`;
  const total = summary.withAudio + summary.silent + summary.unknown;
  if (total === 0) return 'Add videos to see which ones carry sound.';
  if (summary.actionable === 0) {
    return `None of these ${total} files has an audio track — there is nothing to remove.`;
  }
  const parts = [`${summary.withAudio} with sound`];
  if (summary.silent > 0) parts.push(`${summary.silent} already silent (skipped)`);
  if (summary.unknown > 0) parts.push(`${summary.unknown} unreadable (tried anyway)`);
  return parts.join(' · ');
}
