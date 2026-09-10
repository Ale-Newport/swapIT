import { parseTimecode } from '@/core/format';

export interface ParsedTimestamp {
  seconds: number | null;
  error: string | null;
}

/**
 * Read the timecode field. `duration` is optional — without ffprobe the field
 * still accepts any positive time, it just cannot be range-checked.
 */
export function parseTimestamp(text: string, duration: number | null): ParsedTimestamp {
  const raw = text.trim();
  if (!raw) return { seconds: 0, error: null };
  const parsed = parseTimecode(raw);
  if (parsed === null || !Number.isFinite(parsed)) {
    return { seconds: null, error: `"${raw}" is not a time — use 12, 1:23 or 0:01:23.5.` };
  }
  if (parsed < 0) return { seconds: null, error: 'The time cannot be negative.' };
  if (duration !== null && duration > 0 && parsed >= duration) {
    return { seconds: null, error: 'That time is past the end of the video.' };
  }
  return { seconds: parsed, error: null };
}

/** Keep a timestamp inside the video, leaving a frame of room at the end. */
export function clampTimestamp(seconds: number, duration: number | null): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  if (duration === null || duration <= 0) return seconds;
  return Math.min(seconds, Math.max(0, duration - 0.05));
}

/**
 * Scrubber granularity: one frame when the frame rate is known, otherwise a
 * step that keeps long videos usable without a thousand tiny increments.
 */
export function scrubStep(duration: number | null, fps: number | null): number {
  if (fps && fps > 0 && fps < 1000) return Math.round((1 / fps) * 1000) / 1000;
  if (duration !== null && duration > 3600) return 1;
  if (duration !== null && duration > 300) return 0.5;
  return 0.1;
}

/** Evenly spaced marks used by the quick-pick row, always inside the video. */
export function markPositions(duration: number | null): Array<{ label: string; seconds: number }> {
  if (duration === null || duration <= 0) return [];
  return [0, 0.1, 0.25, 0.5, 0.75].map((fraction) => ({
    label: fraction === 0 ? 'Start' : `${Math.round(fraction * 100)}%`,
    seconds: clampTimestamp(Math.round(duration * fraction * 100) / 100, duration),
  }));
}
