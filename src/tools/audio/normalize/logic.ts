/** The loudnorm target the backend applies, restated for the UI. */
export const LOUDNESS_TARGET = { integrated: -16, truePeak: -1.5, range: 11 };

export interface OutputFormat {
  value: string;
  label: string;
  /** FFmpeg encoder, or null when the source container is kept. */
  codec: string | null;
  /** True when Toolbox can request an exact bitrate for this container. */
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
 * The container half of the `ops` payload.
 *
 * `process_video` only passes `-b:a` through when it is not in `audioOnly`
 * mode, so a container with a bitrate control is named explicitly and paired
 * with `videoCodec: 'copy'` — which also keeps embedded cover art. Everything
 * else uses `audioOnly`, where the muxer picks its standard encoder.
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
export function buildNormalizeOps(format: string, bitrate: string): Record<string, unknown> {
  return { ...buildFormatOps(format, bitrate), normalizeAudio: true };
}
