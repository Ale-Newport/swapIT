/**
 * Pitch shifting maths for `audio/pitch`.
 *
 * The backend builds the filter chain `asetrate=44100*pitch, aresample=44100`
 * followed by a tempo chain of `1/pitch`. That is exact only when the source is
 * already 44.1 kHz: for a 48 kHz file `asetrate` reinterprets the samples at the
 * wrong reference rate, so the audible shift lands about 1.4 semitones flat and
 * the file comes out 8.8% too long. Scaling the ratio by the file's real sample
 * rate fixes the shift, and the matching `speed` factor puts the length back.
 */

export const BASE_RATE = 44100;
export const SEMITONE_MIN = -12;
export const SEMITONE_MAX = 12;

/** Frequency multiplier for a shift in semitones: 2^(n/12). */
export function pitchRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export interface PitchOps {
  pitch: number;
  /** Only present when the source is not 44.1 kHz. */
  speed?: number;
  /**
   * Restores the source sample rate, which `aresample=44100` would otherwise
   * change. Left out when the chosen encoder cannot accept that rate — it is a
   * nicety, not part of the shift.
   */
  sampleRate?: number;
}

/**
 * Sample rates each output encoder accepts. libmp3lame refuses anything above
 * 48 kHz outright: FFmpeg reports “Could not open encoder before EOF” and
 * leaves a 0-byte file, so an 88.2 or 96 kHz source must be given a rate MP3
 * can carry. Formats that are absent take whatever the source had, and so does
 * “same as the source”, whose container already held the rate once.
 */
const ENCODER_RATES: Record<string, number[]> = {
  mp3: [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000],
};

/**
 * The rate to send as `-ar` for a source at `sampleRate` written as `format`.
 *
 * `-ar` only relabels the output: the filter chain has already resampled to
 * 44.1 kHz and the shift is `(44100 × pitch) / sampleRate` either way, so
 * substituting a rate the encoder supports costs nothing. Rates the source
 * divides by evenly are preferred, which keeps the 44.1 and 48 kHz families
 * apart (88.2 → 44.1, 96 → 48). Returns undefined when the encoder can take
 * nothing at or below the source rate, leaving `-ar` off the command line.
 */
export function encoderSampleRate(sampleRate: number, format?: string | null): number | undefined {
  const allowed = format ? ENCODER_RATES[format] : undefined;
  if (!allowed) return sampleRate;
  if (allowed.includes(sampleRate)) return sampleRate;
  const below = allowed.filter((rate) => rate < sampleRate);
  if (below.length === 0) return undefined;
  const divisors = below.filter((rate) => sampleRate % rate === 0);
  const candidates = divisors.length > 0 ? divisors : below;
  return candidates[candidates.length - 1];
}

/**
 * The `VideoOps` fields that produce an exact shift for a file at `sampleRate`,
 * written as `format` ('same' or an extension from the output selector).
 */
export function pitchOpsFor(
  ratio: number,
  sampleRate: number | null | undefined,
  format?: string | null,
): PitchOps {
  if (!sampleRate || sampleRate <= 0 || sampleRate === BASE_RATE) return { pitch: ratio };
  return {
    pitch: (ratio * sampleRate) / BASE_RATE,
    speed: sampleRate / BASE_RATE,
    sampleRate: encoderSampleRate(sampleRate, format),
  };
}

export interface RateGroup {
  sampleRate: number | null;
  paths: string[];
}

/**
 * One `process_video` call carries one set of options, so files that need
 * different compensation are run as separate groups. Order is preserved so the
 * results still read in the order the user added them.
 */
export function groupBySampleRate(items: Array<{ path: string; sampleRate: number | null }>): RateGroup[] {
  const groups: RateGroup[] = [];
  const byRate = new Map<number | null, RateGroup>();
  for (const item of items) {
    let group = byRate.get(item.sampleRate);
    if (!group) {
      group = { sampleRate: item.sampleRate, paths: [] };
      byRate.set(item.sampleRate, group);
      groups.push(group);
    }
    group.paths.push(item.path);
  }
  return groups;
}

/** "+3 semitones" / "−2 semitones" / "no change". */
export function semitoneLabel(semitones: number): string {
  if (semitones === 0) return 'No change';
  const sign = semitones > 0 ? '+' : '−';
  const n = Math.abs(semitones);
  return `${sign}${n} semitone${n === 1 ? '' : 's'}`;
}

/** Musical shorthand for whole-tone amounts, e.g. 12 → "one octave up". */
export function intervalName(semitones: number): string | null {
  const names = [
    'minor 2nd',
    'major 2nd',
    'minor 3rd',
    'major 3rd',
    'perfect 4th',
    'tritone',
    'perfect 5th',
    'minor 6th',
    'major 6th',
    'minor 7th',
    'major 7th',
    'octave',
  ];
  const n = Math.abs(semitones);
  if (n < 1 || n > 12) return null;
  const name = names[n - 1];
  return `${name} ${semitones > 0 ? 'up' : 'down'}`;
}
