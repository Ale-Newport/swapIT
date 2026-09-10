export interface MergeStream {
  codec: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  pixFmt: string | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface MergeFile {
  name: string;
  duration: number | null;
  video: MergeStream | null;
  audio: MergeStream | null;
}

export interface MergeAnalysis {
  /** Sum of the lengths that are known. */
  totalDuration: number;
  /** How many files had no readable length. */
  unknownDurations: number;
  /** Reasons a stream copy would be rejected by FFmpeg. */
  mismatches: string[];
  /** Differences that survive a stream copy but are worth saying out loud. */
  notes: string[];
  /** True when the files must be re-encoded to join cleanly. */
  needsReEncode: boolean;
  /** Set when the audio tracks make the re-encode path impossible. */
  audioWarning: string | null;
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function listOf(values: string[]): string {
  return values.join(', ');
}

/**
 * Compare the files chosen for a join. FFmpeg's fast path (`-c copy` through the
 * concat demuxer) needs identical codecs and geometry; anything else has to be
 * re-encoded, and it is much friendlier to say so before the run fails.
 */
export function analyzeMerge(files: MergeFile[]): MergeAnalysis {
  const mismatches: string[] = [];
  const notes: string[] = [];

  const totalDuration = files.reduce((sum, f) => sum + (f.duration ?? 0), 0);
  const unknownDurations = files.filter((f) => f.duration === null).length;

  if (files.length < 2) {
    return {
      totalDuration,
      unknownDurations,
      mismatches,
      notes,
      needsReEncode: false,
      audioWarning: null,
    };
  }

  const videos = files.map((f) => f.video).filter((v): v is MergeStream => Boolean(v));
  if (videos.length > 0) {
    const codecs = distinct(videos.map((v) => v.codec).filter(Boolean));
    if (codecs.length > 1) mismatches.push(`Video codecs differ (${listOf(codecs)})`);

    const sizes = distinct(
      videos.filter((v) => v.width && v.height).map((v) => `${v.width}×${v.height}`),
    );
    if (sizes.length > 1) mismatches.push(`Resolutions differ (${listOf(sizes)})`);

    const pixFmts = distinct(videos.map((v) => v.pixFmt).filter((p): p is string => Boolean(p)));
    if (pixFmts.length > 1) mismatches.push(`Pixel formats differ (${listOf(pixFmts)})`);

    const rates = distinct(
      videos.filter((v) => v.fps).map((v) => `${Math.round((v.fps as number) * 100) / 100}`),
    );
    if (rates.length > 1) notes.push(`Frame rates differ (${listOf(rates)} fps)`);
  }
  if (videos.length > 0 && videos.length < files.length) {
    mismatches.push(`${files.length - videos.length} file has no video track`);
  }

  const audios = files.map((f) => f.audio).filter((a): a is MergeStream => Boolean(a));
  if (audios.length > 0) {
    const codecs = distinct(audios.map((a) => a.codec).filter(Boolean));
    if (codecs.length > 1) mismatches.push(`Audio codecs differ (${listOf(codecs)})`);

    const sampleRates = distinct(
      audios.filter((a) => a.sampleRate).map((a) => `${a.sampleRate} Hz`),
    );
    if (sampleRates.length > 1) mismatches.push(`Audio sample rates differ (${listOf(sampleRates)})`);

    const channels = distinct(audios.filter((a) => a.channels).map((a) => `${a.channels}`));
    if (channels.length > 1) mismatches.push(`Channel counts differ (${listOf(channels)})`);
  }

  let audioWarning: string | null = null;
  if (audios.length === 0) {
    audioWarning =
      'None of these files have an audio track. Re-encoding expects one in every file, so join them with re-encoding off.';
  } else if (audios.length < files.length) {
    const silent = files.length - audios.length;
    audioWarning = `${silent} of ${files.length} files have no audio track. Re-encoding expects one in every file, so either join files that all have audio, or all have none.`;
  }

  return {
    totalDuration,
    unknownDurations,
    mismatches,
    notes,
    needsReEncode: mismatches.length > 0,
    audioWarning,
  };
}
