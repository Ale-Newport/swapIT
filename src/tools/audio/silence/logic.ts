import { parseTimecode } from '@/core/format';

/** FFmpeg is asked for at most a day of silence; the backend clamps to the same range. */
export const MIN_SECONDS = 0.1;
export const MAX_SECONDS = 24 * 3600;

export type DurationResult = { ok: true; seconds: number } | { ok: false; error: string };

/**
 * Accepts what people actually type for a length: `30`, `1:30`, `01:02:03`,
 * `2m30s` or `1.5`. Anything else comes back with a sentence explaining the
 * formats that do work.
 */
export function parseDurationInput(input: string): DurationResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter a length, for example 30 or 1:30.' };
  const seconds = parseTimecode(raw);
  if (seconds === null || Number.isNaN(seconds)) {
    return { ok: false, error: `“${raw}” is not a length. Try seconds (90), mm:ss (1:30) or hh:mm:ss (0:01:30).` };
  }
  if (seconds < MIN_SECONDS) {
    return { ok: false, error: 'The shortest silence Toolbox can make is a tenth of a second.' };
  }
  if (seconds > MAX_SECONDS) {
    return { ok: false, error: 'The longest silence Toolbox can make is 24 hours.' };
  }
  return { ok: true, seconds };
}

/** The name the backend will give the file, so the UI can show it before running. */
export function silenceFilename(seconds: number, format: string): string {
  return `silence-${Math.round(seconds)}s.${format}`;
}

/**
 * Size of the result, so a 24-hour WAV does not arrive as a 15 GB surprise.
 *
 * The source is `anullsrc` at 44.1 kHz stereo. WAV is exact and MP3 holds its
 * 128 kbps whatever it is fed, so both can be predicted. FLAC and AAC instead
 * pack digital silence down to almost nothing — a five-second M4A measures
 * 3 KB, not the 80 KB a constant 128 kbps would give — by an amount nobody can
 * predict, so those report null and the UI says "very small" instead.
 */
export function estimateBytes(seconds: number, format: string): number | null {
  const bitsPerSecond: Record<string, number> = {
    wav: 44100 * 16 * 2,
    mp3: 128_000,
  };
  const rate = bitsPerSecond[format];
  if (!rate) return null;
  return Math.round((seconds * rate) / 8);
}
