import { formatDuration } from '@/core/format';

/** Speed range the tool exposes. FFmpeg itself is happy far outside this. */
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 8;

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/**
 * The slider works on a log2 scale so that 0.5× and 2× sit the same distance
 * from 1×. Halving and doubling should feel symmetric.
 */
export function speedToSlider(speed: number): number {
  return Math.log2(clampSpeed(speed));
}

export function sliderToSpeed(position: number): number {
  return clampSpeed(Math.round(Math.pow(2, position) * 100) / 100);
}

export const SLIDER_MIN = Math.log2(MIN_SPEED);
export const SLIDER_MAX = Math.log2(MAX_SPEED);

/** "2x", "0.25x", "1.33x" — no trailing zeros. */
export function formatSpeed(speed: number): string {
  const rounded = Math.round(speed * 100) / 100;
  return `${rounded.toFixed(2).replace(/\.?0+$/, '')}x`;
}

/** How long the clip becomes. Returns null when the duration is unknown. */
export function resultingDuration(seconds: number | null | undefined, speed: number): number | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  if (!(speed > 0)) return null;
  return seconds / speed;
}

/**
 * `formatDuration` floors to whole seconds, which turns a sped-up three-second
 * clip into "0:00". Below ten seconds the tenth matters, so show it.
 */
export function formatClipLength(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 10) return `${Math.max(0, seconds).toFixed(1)}s`;
  return formatDuration(seconds);
}

/**
 * Mirrors `tempo_chain` in src-tauri/src/cmd/media.rs: `atempo` only accepts
 * 0.5–2.0, so anything further is reached by chaining stages. Knowing the chain
 * lets the UI say honestly what happens to the audio.
 */
export function tempoChain(factor: number): string[] {
  const out: string[] = [];
  if (!(factor > 0)) return out;
  let f = factor;
  while (f > 2) {
    out.push('atempo=2.0');
    f /= 2;
  }
  while (f < 0.5) {
    out.push('atempo=0.5');
    f /= 0.5;
  }
  if (Math.abs(f - 1) > 0.0001) out.push(`atempo=${f.toFixed(6)}`);
  return out;
}

/** One sentence explaining what the chosen speed does to the sound. */
export function describeAudio(speed: number, keepAudio: boolean): string {
  if (!keepAudio) return 'The audio track is dropped, so the result is silent.';
  if (Math.abs(speed - 1) < 0.0001) return 'At 1x nothing is retimed — the file is simply re-encoded.';
  const stages = tempoChain(speed).length;
  const direction = speed > 1 ? 'faster' : 'slower';
  return `Audio is retimed with ${stages} atempo stage${stages === 1 ? '' : 's'}, so voices sound ${direction} but keep their original pitch — no chipmunk effect.`;
}
