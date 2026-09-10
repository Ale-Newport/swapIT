import { formatTimecode, parseTimecode } from '@/core/format';

const TIME_HINT = 'use 12, 1:23 or 0:01:23.5';

export interface ClipSelection {
  /** Seconds to seek to — always a finite number, 0 when the field is empty. */
  start: number;
  /** Seconds to keep, or null for "to the end of the video". */
  duration: number | null;
  /** How much footage the clip really covers, when the source length is known. */
  effective: number | null;
  startError: string | null;
  durationError: string | null;
}

/**
 * Turn the two free-text time fields into numbers FFmpeg can use, with messages
 * a person can act on. `sourceDuration` is optional: without ffprobe the fields
 * still work, they just cannot be range-checked.
 */
export function resolveClip(
  startText: string,
  durationText: string,
  sourceDuration: number | null,
): ClipSelection {
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

export type GifWeight = 'ok' | 'large' | 'huge';

export interface GifEstimate {
  frames: number;
  width: number;
  height: number;
  /** Rough byte estimate — GIF compression varies hugely with the footage. */
  bytes: number;
  level: GifWeight;
}

/**
 * A palette-indexed GIF frame lands around a fifth of a byte per pixel once
 * LZW and inter-frame deltas have done their work. It is only ever an order of
 * magnitude, which is exactly what the warning needs.
 */
const BYTES_PER_PIXEL = 0.19;

export function estimateGif(opts: {
  durationSec: number | null;
  fps: number;
  width: number;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}): GifEstimate | null {
  const { durationSec, fps, width } = opts;
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (!Number.isFinite(fps) || fps <= 0) return null;
  if (!Number.isFinite(width) || width <= 0) return null;

  const aspect =
    opts.sourceWidth && opts.sourceHeight && opts.sourceWidth > 0
      ? opts.sourceHeight / opts.sourceWidth
      : 9 / 16;
  const height = Math.max(2, Math.round((width * aspect) / 2) * 2);
  const frames = Math.max(1, Math.round(durationSec * fps));
  const bytes = Math.round(frames * width * height * BYTES_PER_PIXEL);
  const level: GifWeight =
    bytes > 40_000_000 || frames > 600 ? 'huge' : bytes > 12_000_000 || frames > 300 ? 'large' : 'ok';
  return { frames, width, height, bytes, level };
}
