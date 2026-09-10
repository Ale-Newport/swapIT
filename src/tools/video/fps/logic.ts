/** Frame-rate maths and the FFmpeg payload. Pure and testable. */

export const FPS_PRESETS = [
  { label: '24', value: 24, hint: 'Cinema' },
  { label: '25', value: 25, hint: 'PAL / European broadcast' },
  { label: '30', value: 30, hint: 'The web default' },
  { label: '50', value: 50, hint: 'PAL, smooth' },
  { label: '60', value: 60, hint: 'Gaming and sport' },
];

/** Read a typed frame rate. FFmpeg copes well between 1 and 240. */
export function parseFps(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > 240) return null;
  return Math.round(n * 1000) / 1000;
}

export function formatFps(fps: number | null | undefined): string {
  if (!fps || !Number.isFinite(fps)) return '—';
  return String(Math.round(fps * 100) / 100);
}

export type Direction = 'up' | 'down' | 'same' | 'unknown';

export function direction(sourceFps: number | null | undefined, target: number): Direction {
  if (!sourceFps || !Number.isFinite(sourceFps)) return 'unknown';
  if (Math.abs(sourceFps - target) < 0.01) return 'same';
  return target > sourceFps ? 'up' : 'down';
}

/** What actually happens to the frames, in plain language. */
export function explain(sourceFps: number | null | undefined, target: number, interpolate: boolean): string {
  switch (direction(sourceFps, target)) {
    case 'up':
      return interpolate
        ? 'FFmpeg invents the frames in between by tracking motion between the real ones. Slow, and it can smear fast movement.'
        : 'Existing frames are repeated to fill the gaps. The file gets bigger; the motion looks exactly the same.';
    case 'down':
      return 'Surplus frames are dropped. Smaller file, slightly choppier motion.';
    case 'same':
      return 'The video already runs at this rate, so the frames pass through untouched.';
    default:
      return interpolate
        ? 'FFmpeg invents the in-between frames by tracking motion, whatever the source runs at. Slow, and it can smear fast movement.'
        : 'The frame rate is set on the way out, whatever the source runs at.';
  }
}

/** Motion-compensated interpolation — genuinely new frames, at a real cost. */
export function interpolateFilter(fps: number): string {
  return `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;
}

// ------------------------------------------------------------------ encoding

/** Containers FFmpeg can mux H.264 into. */
const H264_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'mkv', 'avi', 'flv', 'ts', 'mts', 'm2ts', '3gp']);

export interface Encoding {
  /** Named explicitly so the backend never falls back to the container default. */
  videoCodec: string;
  /** Set only when the source container cannot carry the encoded picture. */
  format?: string;
  /** VP9 needs `-b:v 0` before `-crf` means constant quality. */
  videoBitrate?: string;
  /** `-preset` reaches x264 and x265 only; other encoders ignore it. */
  supportsPreset: boolean;
}

/**
 * Which encoder to ask for, given the containers in this batch.
 *
 * `process_video` picks its encoder from the *output* extension (`codec_for` in
 * src-tauri/src/cmd/media.rs) and only forwards `-crf` to x264/x265/VP9 and
 * `-preset` to x264/x265. Left alone, an .avi would be encoded as mpeg4, where
 * both settings are dropped without a word, and .wmv/.mpg/.mpeg would be handed
 * H.264, which those containers cannot hold. So the codec is always named here,
 * and a container that cannot carry it is swapped for MP4.
 */
export function encodingFor(extensions: string[]): Encoding {
  const exts = extensions.map((e) => e.replace(/^\./, '').toLowerCase()).filter(Boolean);
  if (exts.length > 0 && exts.every((e) => e === 'webm')) {
    // VP9 keeps WebM intact. It has no speed presets, so the panel hides that control.
    return { videoCodec: 'libvpx-vp9', videoBitrate: '0', supportsPreset: false };
  }
  return {
    videoCodec: 'libx264',
    format: exts.every((e) => H264_CONTAINERS.has(e)) ? undefined : 'mp4',
    supportsPreset: true,
  };
}

export interface FpsSettings {
  interpolate: boolean;
  crf: number;
  preset: string;
  encoding: Encoding;
}

/** Build the `ops` payload for `process_video`. */
export function buildOps(fps: number, settings: FpsSettings): Record<string, unknown> {
  const { encoding } = settings;
  const ops: Record<string, unknown> = {
    crf: settings.crf,
    preset: encoding.supportsPreset ? settings.preset : undefined,
    videoCodec: encoding.videoCodec,
    videoBitrate: encoding.videoBitrate,
    format: encoding.format,
  };
  if (settings.interpolate) {
    // minterpolate sets the output rate itself; a second fps filter would fight it.
    ops.extraFilters = [interpolateFilter(fps)];
  } else {
    ops.fps = fps;
  }
  return ops;
}
