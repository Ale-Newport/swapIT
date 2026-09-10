/**
 * FFmpeg's `reverse` filter cannot stream: it decodes the whole clip into
 * memory before writing the first frame. Everything here exists so the UI can
 * tell the user what that will cost before they start.
 */

export type ReverseRisk = 'quick' | 'slow' | 'heavy' | 'unknown';

/** Clips longer than this are actively discouraged. */
export const HEAVY_SECONDS = 120;
const SLOW_SECONDS = 30;

export function reverseRisk(duration: number | null | undefined): ReverseRisk {
  if (duration === null || duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return 'unknown';
  }
  if (duration > HEAVY_SECONDS) return 'heavy';
  if (duration > SLOW_SECONDS) return 'slow';
  return 'quick';
}

/**
 * Rough size of the decoded frame buffer FFmpeg has to hold: width × height ×
 * 1.5 bytes per yuv420p frame, times the frame count. Real usage varies with
 * the pixel format and FFmpeg's own overhead, so this is presented as an
 * estimate, never as a promise.
 */
export function estimateFrameBuffer(
  width: number | null | undefined,
  height: number | null | undefined,
  fps: number | null | undefined,
  duration: number | null | undefined,
): number | null {
  const w = Number(width);
  const h = Number(height);
  const f = Number(fps);
  const d = Number(duration);
  if (![w, h, f, d].every((n) => Number.isFinite(n) && n > 0)) return null;
  return Math.round(w * h * 1.5 * f * d);
}

export function riskHeadline(risk: ReverseRisk, duration: number | null | undefined): string {
  switch (risk) {
    case 'quick':
      return 'Short enough to reverse comfortably';
    case 'slow':
      return 'This will take a while';
    case 'heavy':
      return `Long clips are a bad fit for reversing (${Math.round((duration ?? 0) / 60)} minutes)`;
    default:
      return 'Length unknown';
  }
}

export function riskAdvice(risk: ReverseRisk): string {
  switch (risk) {
    case 'quick':
      return 'FFmpeg still buffers every frame in memory, but at this length that is a second or two of work.';
    case 'slow':
      return 'Every frame is decoded into memory first. Expect the progress bar to sit still for a long stretch before anything is written.';
    case 'heavy':
      return `Above ${HEAVY_SECONDS / 60} minutes the whole clip has to fit in RAM at once — this can exhaust memory and take many minutes. Trim the clip down to the part you actually want reversed first.`;
    default:
      return 'The duration could not be read, so the memory cost cannot be estimated. Reversing still buffers the entire clip in memory.';
  }
}
