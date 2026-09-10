/** The shortest clip the handles can produce. */
export const MIN_CLIP_SECONDS = 0.05;

/** Decoding a file into memory to draw it is only worth it up to this size. */
export const MAX_WAVEFORM_BYTES = 150 * 1024 * 1024;

/** Bars drawn across the waveform. */
export const WAVEFORM_BUCKETS = 900;

/**
 * Reduce raw PCM to one peak amplitude per bar. Every bucket covers at least
 * one sample, so a very short file still draws something instead of a gap.
 */
export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  if (buckets <= 0) return new Float32Array(0);
  const out = new Float32Array(buckets);
  if (samples.length === 0) return out;
  const size = samples.length / buckets;
  for (let i = 0; i < buckets; i += 1) {
    const from = Math.min(samples.length - 1, Math.floor(i * size));
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((i + 1) * size)));
    let peak = 0;
    for (let j = from; j < to; j += 1) {
      const value = Math.abs(samples[j]);
      if (value > peak) peak = value;
    }
    out[i] = peak;
  }
  return out;
}

/** Keep the start inside the file and at least a clip's length before the end. */
export function clampStart(value: number, end: number, duration: number): number {
  if (!(duration > 0)) return 0;
  const ceiling = Math.max(0, Math.min(end, duration) - MIN_CLIP_SECONDS);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, value), ceiling);
}

/** Keep the end inside the file and at least a clip's length after the start. */
export function clampEnd(value: number, start: number, duration: number): number {
  if (!(duration > 0)) return 0;
  const floor = Math.min(duration, Math.max(0, start) + MIN_CLIP_SECONDS);
  if (!Number.isFinite(value)) return duration;
  return Math.max(Math.min(value, duration), floor);
}

/** True when the chosen range would copy the whole file unchanged. */
export function isWholeFile(start: number, end: number, duration: number): boolean {
  if (!(duration > 0)) return true;
  return start <= 0.001 && end >= duration - 0.001;
}

/**
 * The `ops` payload for `process_video`.
 *
 * `copyStreams` asks the backend for `-c copy`, which lifts the audio packets
 * out untouched: instant, and with no second round of lossy encoding. It only
 * applies when no filter is in play, which is why this tool never changes the
 * format. Turning it off re-encodes, which cuts exactly at the chosen instant
 * instead of at the nearest packet boundary.
 */
export function buildTrimOps(start: number, end: number, reEncode: boolean): Record<string, unknown> {
  const ops: Record<string, unknown> = { audioOnly: true, end };
  if (start > 0) ops.start = start;
  if (!reEncode) ops.copyStreams = true;
  return ops;
}
