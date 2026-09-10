/**
 * Video size estimation.
 *
 * The model is deliberately simple and stated in full so the number can be
 * argued with:
 *
 *   video bitrate = bpp × width × height × 30 × (fps ÷ 30)^0.75 × quality
 *   bytes         = (video bitrate + audio bitrate) × seconds ÷ 8
 *
 * `bpp` is bits per pixel per frame for the codec at streaming quality, anchored
 * on H.264 1080p30 ≈ 8 Mbps — the figure YouTube publishes. The frame-rate
 * exponent is below one because consecutive frames get more similar as the rate
 * rises, so 60 fps costs well under twice 30 fps.
 *
 * Real encoders vary with content: a static talking head can land 60% under the
 * estimate, confetti and foliage 60% over. `VARIANCE` carries that honestly.
 */

export const FPS_EXPONENT = 0.75;
export const VARIANCE = 0.35;

export type CodecId = 'h264' | 'h265' | 'vp9' | 'av1';

export interface Codec {
  id: CodecId;
  label: string;
  /** Bits per pixel per frame at quality 1.0. */
  bpp: number;
  note: string;
}

export const CODECS: Codec[] = [
  { id: 'h264', label: 'H.264 / AVC', bpp: 0.13, note: 'Plays everywhere; the safe default' },
  { id: 'h265', label: 'H.265 / HEVC', bpp: 0.075, note: 'About 45% smaller than H.264' },
  { id: 'vp9', label: 'VP9', bpp: 0.085, note: 'YouTube and web delivery' },
  { id: 'av1', label: 'AV1', bpp: 0.062, note: 'Smallest files, slowest to encode' },
];

export type QualityId = 'low' | 'standard' | 'high' | 'max';

export interface QualityTier {
  id: QualityId;
  label: string;
  factor: number;
  note: string;
}

export const QUALITY_TIERS: QualityTier[] = [
  { id: 'low', label: 'Low', factor: 0.55, note: 'Small file, artefacts visible in motion' },
  { id: 'standard', label: 'Standard', factor: 1, note: 'Streaming and upload quality' },
  { id: 'high', label: 'High', factor: 1.6, note: 'Clean enough to edit from' },
  { id: 'max', label: 'Maximum', factor: 2.4, note: 'Near transparent, archival' },
];

export function codecById(id: string): Codec | undefined {
  return CODECS.find((c) => c.id === id);
}

export function qualityById(id: string): QualityTier | undefined {
  return QUALITY_TIERS.find((q) => q.id === id);
}

/** Video-only bitrate in bits per second, or null when an input is impossible. */
export function videoBitrateBps(
  width: number,
  height: number,
  fps: number,
  bpp: number,
  qualityFactor: number,
): number | null {
  if (![width, height, fps, bpp, qualityFactor].every((n) => Number.isFinite(n) && n > 0)) return null;
  return bpp * width * height * 30 * Math.pow(fps / 30, FPS_EXPONENT) * qualityFactor;
}

export interface EstimateInput {
  width: number;
  height: number;
  fps: number;
  bpp: number;
  qualityFactor: number;
  seconds: number;
  audioBps: number;
}

export interface Estimate {
  videoBps: number;
  audioBps: number;
  totalBps: number;
  bytes: number;
  lowBytes: number;
  highBytes: number;
  bytesPerMinute: number;
}

export function estimate(input: EstimateInput): Estimate | null {
  const videoBps = videoBitrateBps(input.width, input.height, input.fps, input.bpp, input.qualityFactor);
  if (videoBps === null) return null;
  if (!Number.isFinite(input.seconds) || input.seconds < 0) return null;
  if (!Number.isFinite(input.audioBps) || input.audioBps < 0) return null;
  const totalBps = videoBps + input.audioBps;
  const bytes = (totalBps * input.seconds) / 8;
  return {
    videoBps,
    audioBps: input.audioBps,
    totalBps,
    bytes,
    lowBytes: bytes * (1 - VARIANCE),
    highBytes: bytes * (1 + VARIANCE),
    bytesPerMinute: (totalBps * 60) / 8,
  };
}

/** Video bitrate that lands a file of `targetBytes`, once audio is paid for. */
export function videoBitrateForTarget(targetBytes: number, seconds: number, audioBps: number): number | null {
  if (!Number.isFinite(targetBytes) || !Number.isFinite(seconds) || !Number.isFinite(audioBps)) return null;
  if (targetBytes <= 0 || seconds <= 0 || audioBps < 0) return null;
  return (targetBytes * 8) / seconds - audioBps;
}

export interface ResolutionPreset {
  label: string;
  width: number;
  height: number;
}

export const RESOLUTIONS: ResolutionPreset[] = [
  { label: '480p', width: 854, height: 480 },
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '4K', width: 3840, height: 2160 },
  { label: '8K', width: 7680, height: 4320 },
  { label: 'Vertical 1080', width: 1080, height: 1920 },
  { label: 'Square 1080', width: 1080, height: 1080 },
];

export const FPS_PRESETS = [23.976, 24, 25, 30, 50, 60, 120];

export const AUDIO_PRESETS = [
  { value: 0, label: 'No audio' },
  { value: 64, label: '64 kbps — speech' },
  { value: 128, label: '128 kbps — standard' },
  { value: 192, label: '192 kbps — good' },
  { value: 256, label: '256 kbps — high' },
  { value: 320, label: '320 kbps — maximum' },
  { value: 1536, label: '1536 kbps — uncompressed 48 kHz stereo' },
];

export function parseNonNegative(text: string): number | null {
  const raw = text.trim().replace(/[\s,_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function trim(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart = ''] = fixed.split('.');
  const frac = fracPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function formatBitrate(bitsPerSecond: number | null, decimals = 2): string {
  if (bitsPerSecond === null || !Number.isFinite(bitsPerSecond)) return '—';
  if (bitsPerSecond >= 1e6) return `${trim(bitsPerSecond / 1e6, decimals)} Mbps`;
  if (bitsPerSecond >= 1e3) return `${trim(bitsPerSecond / 1e3, decimals)} kbps`;
  return `${trim(bitsPerSecond, 0)} bit/s`;
}

/** Decimal byte size — the convention encoders and platforms quote. */
export function formatSize(bytes: number | null, decimals = 2): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1e12) return `${trim(bytes / 1e12, decimals)} TB`;
  if (bytes >= 1e9) return `${trim(bytes / 1e9, decimals)} GB`;
  if (bytes >= 1e6) return `${trim(bytes / 1e6, decimals)} MB`;
  if (bytes >= 1e3) return `${trim(bytes / 1e3, decimals)} kB`;
  return `${trim(bytes, 0)} B`;
}
