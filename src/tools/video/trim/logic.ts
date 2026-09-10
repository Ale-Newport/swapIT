import { parseTimecode } from '@/core/format';

/** Shortest clip the handles can produce, in seconds. */
export const MIN_CLIP = 0.05;

export interface Range {
  start: number;
  end: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Move one handle of the range, keeping start before end and both inside the
 * clip. Returns a new range — the handles never cross.
 */
export function moveHandle(range: Range, which: 'start' | 'end', time: number, duration: number): Range {
  const limit = Math.max(MIN_CLIP, duration);
  if (which === 'start') {
    const start = clamp(time, 0, Math.max(0, range.end - MIN_CLIP));
    return { start, end: clamp(range.end, start + MIN_CLIP, limit) };
  }
  const end = clamp(time, Math.min(range.start + MIN_CLIP, limit), limit);
  return { start: clamp(range.start, 0, end - MIN_CLIP), end };
}

/** Read a typed time field: "12", "1:23", "01:02:03" or "1m20s". */
export function parseTimeField(text: string, duration: number): number | null {
  const seconds = parseTimecode(text);
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  return clamp(seconds, 0, Math.max(MIN_CLIP, duration));
}

export function clipLength(range: Range): number {
  return Math.max(0, range.end - range.start);
}

export interface TrimSettings {
  copyStreams: boolean;
  crf: number;
  preset: string;
}

/** Build the `ops` payload for `process_video`. */
export function buildOps(range: Range, duration: number, settings: TrimSettings): Record<string, unknown> {
  const ops: Record<string, unknown> = {
    start: range.start > 0 ? Number(range.start.toFixed(3)) : undefined,
    // Trimming to the very end needs no -t at all.
    end: range.end < duration - 0.01 ? Number(range.end.toFixed(3)) : undefined,
  };
  if (settings.copyStreams) {
    ops.copyStreams = true;
  } else {
    ops.crf = settings.crf;
    ops.preset = settings.preset;
  }
  return ops;
}
