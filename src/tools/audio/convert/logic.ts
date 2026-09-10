/**
 * Audio containers Toolbox can write, and how each one has to be driven.
 *
 * `process_video` only forwards `-b:a` when it is *not* running in `audioOnly`
 * mode, so a container whose bitrate we want to control is encoded with an
 * explicit codec plus `videoCodec: 'copy'` — the copy keeps embedded cover art
 * instead of letting FFmpeg try to re-encode the artwork as H.264. Containers
 * that cannot take that treatment (OGG rejects a copied JPEG picture stream)
 * or that gain nothing from it (the lossless ones) use `audioOnly`, which adds
 * `-vn` and lets the muxer pick its standard encoder.
 */
export interface AudioFormat {
  value: string;
  label: string;
  /** The FFmpeg encoder the container is written with. */
  codec: string;
  lossless: boolean;
  /** True when Toolbox can request an exact bitrate for this container. */
  bitrate: boolean;
  /** Sample rates the encoder accepts, or null when it takes any. */
  sampleRates: number[] | null;
  hint: string;
}

export const AUDIO_FORMATS: AudioFormat[] = [
  {
    value: 'mp3',
    label: 'MP3 (.mp3)',
    codec: 'libmp3lame',
    lossless: false,
    bitrate: true,
    sampleRates: null,
    hint: 'Plays on everything ever made.',
  },
  {
    value: 'm4a',
    label: 'M4A / AAC (.m4a)',
    codec: 'aac',
    lossless: false,
    bitrate: true,
    sampleRates: null,
    hint: 'Apple’s default — better than MP3 at the same size.',
  },
  {
    value: 'opus',
    label: 'Opus (.opus)',
    codec: 'libopus',
    lossless: false,
    bitrate: true,
    sampleRates: [48000],
    hint: 'The best quality per megabyte, but not every player reads it.',
  },
  {
    value: 'ogg',
    label: 'OGG Vorbis (.ogg)',
    codec: 'libvorbis',
    lossless: false,
    bitrate: false,
    sampleRates: null,
    hint: 'Open format. Encoded at FFmpeg’s default quality — pick MP3 or M4A to set an exact bitrate.',
  },
  {
    value: 'wav',
    label: 'WAV (.wav)',
    codec: 'pcm_s16le',
    lossless: true,
    bitrate: false,
    sampleRates: null,
    hint: 'Uncompressed 16-bit PCM. Large, but exact.',
  },
  {
    value: 'flac',
    label: 'FLAC (.flac)',
    codec: 'flac',
    lossless: true,
    bitrate: false,
    sampleRates: null,
    hint: 'Lossless and about half the size of WAV.',
  },
  {
    value: 'aiff',
    label: 'AIFF (.aiff)',
    codec: 'pcm_s16be',
    lossless: true,
    bitrate: false,
    sampleRates: null,
    hint: 'Uncompressed, the Apple counterpart to WAV.',
  },
];

export const BITRATES = ['320k', '256k', '192k', '160k', '128k', '96k', '64k'];

const DEFAULT_SAMPLE_RATES = [44100, 48000, 22050];

/**
 * Lossless codecs FFprobe reports that are not raw PCM. Every `pcm_*` variant
 * counts too — AIFF alone arrives as `pcm_s16be`, and WAV can be any of
 * `pcm_s16le`, `pcm_s24le`, `pcm_f32le`, `pcm_u8` and more — so the prefix does
 * that half of the work rather than a list that keeps missing one.
 */
const LOSSLESS_CODECS = new Set(['flac', 'alac', 'wavpack', 'tta', 'ape', 'mlp', 'truehd']);

/** True when the source was never lossily compressed, so no detail has been lost yet. */
export function isLosslessCodec(codec: string | null | undefined): boolean {
  if (!codec) return false;
  const name = codec.toLowerCase();
  return name.startsWith('pcm_') || LOSSLESS_CODECS.has(name);
}

export function findFormat(value: string): AudioFormat {
  const found = AUDIO_FORMATS.find((f) => f.value === value);
  if (!found) {
    throw new Error(`“${value}” is not an audio format Toolbox can write. Pick one from the list.`);
  }
  return found;
}

/** Sample rates offered for a format. Opus only ever encodes at 48 kHz. */
export function sampleRateChoices(format: string): number[] {
  return findFormat(format).sampleRates ?? DEFAULT_SAMPLE_RATES;
}

/** Fall back to "keep the source rate" when the chosen rate is not encodable. */
export function usableSampleRate(format: string, rate: number): number {
  if (rate <= 0) return 0;
  return sampleRateChoices(format).includes(rate) ? rate : 0;
}

export interface ConvertChoices {
  format: string;
  bitrate: string;
  /** 0 keeps the source sample rate. */
  sampleRate: number;
  mono: boolean;
}

/** The `ops` payload for `process_video`. */
export function buildConvertOps(choices: ConvertChoices): Record<string, unknown> {
  const format = findFormat(choices.format);
  const ops: Record<string, unknown> = { format: format.value };

  const rate = usableSampleRate(format.value, choices.sampleRate);
  if (rate > 0) ops.sampleRate = rate;
  if (choices.mono) ops.toMono = true;

  if (format.bitrate) {
    ops.videoCodec = 'copy';
    ops.audioCodec = format.codec;
    ops.audioBitrate = choices.bitrate;
  } else {
    ops.audioOnly = true;
  }
  return ops;
}

/** Bytes a constant-bitrate stream of this length occupies. */
export function estimateBytes(seconds: number, bitrate: string): number {
  const kbps = parseInt(bitrate, 10);
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(kbps) || kbps <= 0) return 0;
  return Math.round((seconds * kbps * 1000) / 8);
}
