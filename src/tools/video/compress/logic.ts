/** Presets, the resolution cap filter and the size estimate — all pure. */

export interface CompressPreset {
  value: string;
  label: string;
  hint: string;
  crf: number;
  maxHeight: number | null;
}

export const PRESETS: CompressPreset[] = [
  { value: 'very-small', label: 'Very Small', hint: 'Messaging and email — 720p', crf: 32, maxHeight: 720 },
  { value: 'small', label: 'Small', hint: 'Noticeably lighter, still watchable', crf: 28, maxHeight: null },
  { value: 'balanced', label: 'Balanced', hint: 'The usual choice', crf: 23, maxHeight: null },
  { value: 'high', label: 'High Quality', hint: 'Barely touched, modest saving', crf: 20, maxHeight: null },
];

export const FORMATS = [
  { value: 'mp4', label: 'MP4 — plays everywhere' },
  { value: 'mkv', label: 'MKV — flexible container' },
  { value: 'webm', label: 'WebM — VP9 for the web' },
];

export const HEIGHT_CAPS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Keep original size' },
  { value: '1440', label: 'Cap at 1440p' },
  { value: '1080', label: 'Cap at 1080p' },
  { value: '720', label: 'Cap at 720p' },
  { value: '480', label: 'Cap at 480p' },
  { value: '360', label: 'Cap at 360p' },
];

/**
 * A scale filter that never enlarges a smaller video and always lands on even
 * dimensions, which H.264 and H.265 require. `-2` keeps the aspect ratio.
 */
export function capFilter(maxHeight: number): string {
  return `scale=-2:'trunc(min(ih,${maxHeight})/2)*2':flags=lanczos`;
}

export function videoCodecFor(format: string, preferred: 'libx264' | 'libx265'): string {
  return format === 'webm' ? 'libvpx-vp9' : preferred;
}

export function audioCodecFor(format: string): string {
  return format === 'webm' ? 'libopus' : 'aac';
}

export function matchPreset(crf: number, maxHeight: number | null): string {
  return PRESETS.find((p) => p.crf === crf && p.maxHeight === maxHeight)?.value ?? 'custom';
}

export interface CompressSettings {
  format: string;
  codec: 'libx264' | 'libx265';
  crf: number;
  maxHeight: number | null;
  preset: string;
  removeAudio: boolean;
  audioBitrate: string;
}

export function buildOps(s: CompressSettings): Record<string, unknown> {
  return {
    format: s.format,
    videoCodec: videoCodecFor(s.format, s.codec),
    crf: s.crf,
    preset: s.format === 'webm' ? undefined : s.preset,
    extraFilters: s.maxHeight ? [capFilter(s.maxHeight)] : undefined,
    removeAudio: s.removeAudio,
    audioCodec: s.removeAudio ? undefined : audioCodecFor(s.format),
    audioBitrate: s.removeAudio ? undefined : s.audioBitrate,
  };
}

// ------------------------------------------------------------------ estimate

/** Bits per pixel per frame that x264 needs at CRF 23 on typical footage. */
const BPP_AT_CRF_23 = 0.08;

/** Roughly how much less each encoder needs for the same look. */
const CODEC_EFFICIENCY: Record<string, number> = {
  'libx264': 1,
  'libx265': 0.65,
  'libvpx-vp9': 0.7,
};

export interface SourceClip {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

/** The height the video ends up at once the cap is applied — never upscaled. */
export function cappedHeight(sourceHeight: number, maxHeight: number | null): number {
  const h = maxHeight ? Math.min(sourceHeight, maxHeight) : sourceHeight;
  return Math.max(2, Math.floor(h / 2) * 2);
}

/** Video bitrate in kbps this encoder is likely to need. */
export function estimateVideoKbps(clip: SourceClip, crf: number, codec: string, maxHeight: number | null): number {
  if (!clip.width || !clip.height) return 0;
  const height = cappedHeight(clip.height, maxHeight);
  const width = Math.max(2, Math.floor((clip.width * (height / clip.height)) / 2) * 2);
  const fps = Math.min(120, Math.max(1, clip.fps || 30));
  // Every 6 points of CRF is roughly a halving or doubling of the bitrate.
  const bpp = BPP_AT_CRF_23 * Math.pow(2, (23 - crf) / 6);
  const efficiency = CODEC_EFFICIENCY[codec] ?? 1;
  return (width * height * fps * bpp * efficiency) / 1000;
}

/** Estimated output size in bytes for one clip. Deliberately approximate. */
export function estimateBytes(
  clip: SourceClip,
  opts: { crf: number; codec: string; maxHeight: number | null; audioKbps: number },
): number {
  if (!clip.duration || clip.duration <= 0) return 0;
  const video = estimateVideoKbps(clip, opts.crf, opts.codec, opts.maxHeight);
  const total = video + Math.max(0, opts.audioKbps);
  return Math.round(((total * 1000) / 8) * clip.duration);
}

export function parseAudioKbps(bitrate: string): number {
  const n = parseInt(bitrate, 10);
  return Number.isFinite(n) ? n : 0;
}
