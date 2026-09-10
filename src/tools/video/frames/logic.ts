import { formatTimecode, parseTimecode } from '@/core/format';

const TIME_HINT = 'use 12, 1:23 or 0:01:23.5';

export interface TimeRange {
  start: number;
  duration: number | null;
  /** Seconds of footage actually covered, when the source length is known. */
  effective: number | null;
  startError: string | null;
  durationError: string | null;
}

/** Parse the "start at" / "length" fields into seconds, with usable messages. */
export function resolveRange(
  startText: string,
  durationText: string,
  sourceDuration: number | null,
): TimeRange {
  let start = 0;
  let startError: string | null = null;
  const rawStart = startText.trim();
  if (rawStart) {
    const parsed = parseTimecode(rawStart);
    if (parsed === null || !Number.isFinite(parsed)) {
      startError = `"${rawStart}" is not a time — ${TIME_HINT}.`;
    } else if (parsed < 0) {
      startError = 'The start time cannot be negative.';
    } else {
      start = parsed;
    }
  }
  if (!startError && sourceDuration !== null && sourceDuration > 0 && start >= sourceDuration) {
    startError = `The start time is past the end of the video (${formatTimecode(sourceDuration)}).`;
    start = 0;
  }

  let duration: number | null = null;
  let durationError: string | null = null;
  const rawDuration = durationText.trim();
  if (rawDuration) {
    const parsed = parseTimecode(rawDuration);
    if (parsed === null || !Number.isFinite(parsed)) {
      durationError = `"${rawDuration}" is not a length — ${TIME_HINT}.`;
    } else if (parsed <= 0) {
      durationError = 'The length must be more than zero.';
    } else {
      duration = parsed;
    }
  }

  let effective: number | null = null;
  if (sourceDuration !== null && sourceDuration > 0 && !startError) {
    const remaining = Math.max(0, sourceDuration - start);
    effective = duration === null ? remaining : Math.min(duration, remaining);
  } else if (duration !== null) {
    effective = duration;
  }

  return { start, duration, effective, startError, durationError };
}

export type FrameMode = 'all' | 'interval' | 'count';

export interface FrameEstimate {
  /** Null when the video length is unknown and the mode depends on it. */
  frames: number | null;
  level: 'ok' | 'large' | 'huge';
}

/**
 * How many stills the chosen mode will write. Matches the backend: "count"
 * spreads N frames evenly with `-frames:v N`, "interval" uses `fps=1/interval`
 * which also emits the frame at t=0.
 */
export function estimateFrames(
  mode: FrameMode,
  opts: { durationSec: number | null; sourceFps: number | null; interval: number; count: number },
): FrameEstimate {
  const { durationSec, sourceFps, interval, count } = opts;
  let frames: number | null = null;

  if (mode === 'count') {
    frames = Number.isFinite(count) && count > 0 ? Math.floor(count) : null;
  } else if (durationSec !== null && durationSec > 0) {
    if (mode === 'all') {
      frames = sourceFps && sourceFps > 0 ? Math.max(1, Math.round(durationSec * sourceFps)) : null;
    } else if (Number.isFinite(interval) && interval > 0) {
      frames = Math.floor(durationSec / interval) + 1;
    }
  }

  const level: FrameEstimate['level'] =
    frames === null ? 'ok' : frames > 2000 ? 'huge' : frames > 400 ? 'large' : 'ok';
  return { frames, level };
}

/**
 * The `duration` to send with the range.
 *
 * `extract_frames` seeks with `-ss start` and then spreads a fixed count over
 * `duration`, falling back to the *whole* source length when none is given
 * (src-tauri/src/cmd/media.rs). With a start time and no explicit length that
 * fps is computed against footage that has already been skipped, so only part
 * of the requested frames ever get written. Naming the remaining footage — the
 * same span the estimate counts — keeps the two in step. The other modes have
 * no such dependency, so they keep sending only what the user typed.
 */
export function rangeDuration(mode: FrameMode, range: TimeRange): number | null {
  if (range.duration !== null) return range.duration;
  return mode === 'count' ? range.effective : null;
}
