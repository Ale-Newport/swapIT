/** Above this much boost, anything already near full scale will clip. */
export const CLIPPING_WARNING_DB = 6;

export const MIN_DB = -20;
export const MAX_DB = 20;

/** Decibels to the linear multiplier FFmpeg's `volume` filter takes. */
export function dbToLinear(db: number): number {
  if (!Number.isFinite(db)) return 1;
  return Math.pow(10, db / 20);
}

/** The inverse, for showing a multiplier back as decibels. */
export function linearToDb(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return MIN_DB;
  return 20 * Math.log10(multiplier);
}

/** Rounded for display: 6 dB → "2.00×". */
export function formatMultiplier(db: number): string {
  return `${dbToLinear(db).toFixed(2)}×`;
}

export interface OutputFormat {
  value: string;
  label: string;
  codec: string | null;
  bitrate: boolean;
}

export const OUTPUT_FORMATS: OutputFormat[] = [
  { value: 'same', label: 'Same as the source', codec: null, bitrate: false },
  { value: 'mp3', label: 'MP3 (.mp3)', codec: 'libmp3lame', bitrate: true },
  { value: 'm4a', label: 'M4A / AAC (.m4a)', codec: 'aac', bitrate: true },
  { value: 'wav', label: 'WAV — lossless (.wav)', codec: 'pcm_s16le', bitrate: false },
  { value: 'flac', label: 'FLAC — lossless (.flac)', codec: 'flac', bitrate: false },
];

export const BITRATES = ['320k', '256k', '192k', '160k', '128k', '96k'];

export function findOutputFormat(value: string): OutputFormat {
  const found = OUTPUT_FORMATS.find((f) => f.value === value);
  if (!found) throw new Error(`“${value}” is not an output format this tool can write.`);
  return found;
}

/**
 * The container half of the `ops` payload. `process_video` only forwards
 * `-b:a` when it is not in `audioOnly` mode, so containers with a bitrate
 * control name their encoder explicitly and pair it with `videoCodec: 'copy'`,
 * which also carries embedded cover art across.
 */
export function buildFormatOps(format: string, bitrate: string): Record<string, unknown> {
  const target = findOutputFormat(format);
  if (target.value === 'same') return { audioOnly: true };
  if (target.bitrate && target.codec) {
    return {
      format: target.value,
      videoCodec: 'copy',
      audioCodec: target.codec,
      audioBitrate: bitrate,
    };
  }
  return { format: target.value, audioOnly: true };
}

/** The full `ops` payload for `process_video`. */
export function buildVolumeOps(db: number, format: string, bitrate: string): Record<string, unknown> {
  return {
    ...buildFormatOps(format, bitrate),
    // Four decimals is well below anything audible and keeps the filter string short.
    volume: Number(dbToLinear(db).toFixed(4)),
  };
}
