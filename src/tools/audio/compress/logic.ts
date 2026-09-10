export interface CompressPreset {
  id: string;
  label: string;
  /** kbps of the encoded stream. */
  bitrate: number;
  mono: boolean;
  hint: string;
}

export const PRESETS: CompressPreset[] = [
  { id: 'voice', label: 'Voice', bitrate: 64, mono: true, hint: 'Mono 64 kbps — speech, lectures, voice notes' },
  { id: 'small', label: 'Small', bitrate: 96, mono: false, hint: '96 kbps — smallest size that still sounds like music' },
  { id: 'balanced', label: 'Balanced', bitrate: 160, mono: false, hint: '160 kbps — the everyday choice' },
  { id: 'high', label: 'High', bitrate: 256, mono: false, hint: '256 kbps — hard to tell from the original' },
  { id: 'maximum', label: 'Maximum', bitrate: 320, mono: false, hint: '320 kbps — as good as MP3 and AAC get' },
];

/** Containers that can be written with an exact bitrate. */
export const TARGETS = [
  { value: 'mp3', label: 'MP3 (.mp3)', codec: 'libmp3lame' },
  { value: 'm4a', label: 'M4A / AAC (.m4a)', codec: 'aac' },
];

export function findPreset(id: string): CompressPreset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`“${id}” is not one of the compression presets.`);
  return preset;
}

export function findTarget(value: string) {
  const target = TARGETS.find((t) => t.value === value);
  if (!target) throw new Error(`“${value}” cannot be written with an exact bitrate. Choose MP3 or M4A.`);
  return target;
}

/**
 * The `ops` payload for `process_video`. An explicit audio codec plus
 * `videoCodec: 'copy'` is what makes the backend forward `-b:a`; the copy also
 * carries embedded cover art across instead of re-encoding it as video.
 */
export function buildCompressOps(presetId: string, targetFormat: string): Record<string, unknown> {
  const preset = findPreset(presetId);
  const target = findTarget(targetFormat);
  const ops: Record<string, unknown> = {
    format: target.value,
    videoCodec: 'copy',
    audioCodec: target.codec,
    audioBitrate: `${preset.bitrate}k`,
  };
  if (preset.mono) ops.toMono = true;
  return ops;
}

/** Bytes a constant-bitrate stream of this length occupies. */
export function estimateBytes(seconds: number, kbps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (!Number.isFinite(kbps) || kbps <= 0) return 0;
  return Math.round((seconds * kbps * 1000) / 8);
}

export interface SavingsSummary {
  /** Total bytes of the files whose length is known. */
  measuredBytes: number;
  estimatedBytes: number;
  /** How many files still have no duration. */
  pending: number;
}

/**
 * Compare what the measured files weigh now with what they would weigh at the
 * chosen bitrate. Files that could not be probed are reported as `pending`
 * rather than silently guessed at.
 */
export function summarise(
  files: Array<{ path: string; size: number }>,
  durations: Record<string, number>,
  kbps: number,
): SavingsSummary {
  let measuredBytes = 0;
  let estimatedBytes = 0;
  let pending = 0;
  for (const file of files) {
    const seconds = durations[file.path];
    if (typeof seconds !== 'number' || seconds <= 0) {
      pending += 1;
      continue;
    }
    measuredBytes += file.size;
    estimatedBytes += estimateBytes(seconds, kbps);
  }
  return { measuredBytes, estimatedBytes, pending };
}
