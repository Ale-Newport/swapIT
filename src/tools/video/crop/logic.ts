/** Crop-rectangle geometry, in source pixels. Pure so it can be tested. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest crop the editor will produce, in source pixels. */
export const MIN_SIZE = 16;

export interface AspectPreset {
  label: string;
  value: string;
  ratio: number | null;
}

export const ASPECTS: AspectPreset[] = [
  { label: 'Free', value: 'free', ratio: null },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '4:5', value: '4:5', ratio: 4 / 5 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
];

export function ratioFor(value: string): number | null {
  return ASPECTS.find((a) => a.value === value)?.ratio ?? null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Push a rectangle back inside the frame without changing its size if possible. */
export function clampRect(rect: Rect, vw: number, vh: number): Rect {
  const w = clampNumber(rect.w, Math.min(MIN_SIZE, vw), vw);
  const h = clampNumber(rect.h, Math.min(MIN_SIZE, vh), vh);
  return {
    x: clampNumber(rect.x, 0, Math.max(0, vw - w)),
    y: clampNumber(rect.y, 0, Math.max(0, vh - h)),
    w,
    h,
  };
}

/**
 * H.264 and H.265 encode in 2×2 chroma blocks, so odd offsets or sizes either
 * fail outright or shift the colour plane. Everything is rounded down to even.
 */
export function evenRect(rect: Rect, vw: number, vh: number): Rect {
  const clamped = clampRect(rect, vw, vh);
  const w = Math.max(2, Math.floor(clamped.w / 2) * 2);
  const h = Math.max(2, Math.floor(clamped.h / 2) * 2);
  const x = Math.floor(clamped.x / 2) * 2;
  const y = Math.floor(clamped.y / 2) * 2;
  return {
    x: Math.min(x, Math.max(0, Math.floor((vw - w) / 2) * 2)),
    y: Math.min(y, Math.max(0, Math.floor((vh - h) / 2) * 2)),
    w: Math.min(w, Math.floor(vw / 2) * 2),
    h: Math.min(h, Math.floor(vh / 2) * 2),
  };
}

/** The biggest rectangle of this ratio that fits the frame, centred. */
export function largestRect(vw: number, vh: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: vw, h: vh };
  let w = vw;
  let h = w / ratio;
  if (h > vh) {
    h = vh;
    w = h * ratio;
  }
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

/** Reshape an existing rectangle to a ratio, keeping its centre. */
export function fitAspect(rect: Rect, ratio: number | null, vw: number, vh: number): Rect {
  if (!ratio) return clampRect(rect, vw, vh);
  let w = rect.w;
  let h = w / ratio;
  if (h > rect.h) {
    h = rect.h;
    w = h * ratio;
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }, vw, vh);
}

export function moveRect(rect: Rect, dx: number, dy: number, vw: number, vh: number): Rect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, vw, vh);
}

/** Grow a rectangle from a fixed corner to the requested size, honouring a ratio. */
function fromCorner(
  anchorX: number,
  anchorY: number,
  towardsLeft: boolean,
  towardsTop: boolean,
  wantW: number,
  wantH: number,
  ratio: number | null,
  vw: number,
  vh: number,
): Rect {
  const availW = towardsLeft ? anchorX : vw - anchorX;
  const availH = towardsTop ? anchorY : vh - anchorY;
  let w = clampNumber(wantW, 0, availW);
  let h = clampNumber(wantH, 0, availH);
  if (ratio) {
    h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
  }
  w = Math.max(Math.min(MIN_SIZE, availW), w);
  h = Math.max(Math.min(MIN_SIZE, availH), h);
  return {
    x: towardsLeft ? anchorX - w : anchorX,
    y: towardsTop ? anchorY - h : anchorY,
    w,
    h,
  };
}

/** Drag one of the eight handles by a delta in source pixels. */
export function resizeRect(
  base: Rect,
  handle: HandleId,
  dx: number,
  dy: number,
  vw: number,
  vh: number,
  ratio: number | null,
): Rect {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');

  let left = west ? base.x + dx : base.x;
  let right = east ? base.x + base.w + dx : base.x + base.w;
  let top = north ? base.y + dy : base.y;
  let bottom = south ? base.y + base.h + dy : base.y + base.h;

  if (west) left = Math.min(left, right - MIN_SIZE);
  if (east) right = Math.max(right, left + MIN_SIZE);
  if (north) top = Math.min(top, bottom - MIN_SIZE);
  if (south) bottom = Math.max(bottom, top + MIN_SIZE);

  left = clampNumber(left, 0, vw);
  right = clampNumber(right, 0, vw);
  top = clampNumber(top, 0, vh);
  bottom = clampNumber(bottom, 0, vh);

  const wantW = Math.max(MIN_SIZE, right - left);
  const wantH = Math.max(MIN_SIZE, bottom - top);

  if (!ratio) return clampRect({ x: left, y: top, w: wantW, h: wantH }, vw, vh);

  // Corner: the opposite corner stays put. Edge: the opposite edge stays put and
  // the other axis grows around the centre.
  if ((west || east) && (north || south)) {
    return clampRect(
      fromCorner(west ? right : left, north ? bottom : top, west, north, wantW, wantH, ratio, vw, vh),
      vw,
      vh,
    );
  }
  if (north || south) {
    const anchorY = north ? bottom : top;
    const availH = north ? anchorY : vh - anchorY;
    let h = clampNumber(wantH, MIN_SIZE, availH);
    let w = h * ratio;
    if (w > vw) {
      w = vw;
      h = w / ratio;
    }
    const cx = base.x + base.w / 2;
    return clampRect({ x: cx - w / 2, y: north ? anchorY - h : anchorY, w, h }, vw, vh);
  }
  const anchorX = west ? right : left;
  const availW = west ? anchorX : vw - anchorX;
  let w = clampNumber(wantW, MIN_SIZE, availW);
  let h = w / ratio;
  if (h > vh) {
    h = vh;
    w = h * ratio;
  }
  const cy = base.y + base.h / 2;
  return clampRect({ x: west ? anchorX - w : anchorX, y: cy - h / 2, w, h }, vw, vh);
}

/** Draw a brand-new rectangle by dragging from an anchor point. */
export function drawRect(
  anchorX: number,
  anchorY: number,
  pointX: number,
  pointY: number,
  ratio: number | null,
  vw: number,
  vh: number,
): Rect {
  const ax = clampNumber(anchorX, 0, vw);
  const ay = clampNumber(anchorY, 0, vh);
  const px = clampNumber(pointX, 0, vw);
  const py = clampNumber(pointY, 0, vh);
  return clampRect(
    fromCorner(ax, ay, px < ax, py < ay, Math.abs(px - ax), Math.abs(py - ay), ratio, vw, vh),
    vw,
    vh,
  );
}

/** True when the rectangle covers the whole frame, so cropping is a no-op. */
export function isFullFrame(rect: Rect, vw: number, vh: number): boolean {
  return rect.x <= 0 && rect.y <= 0 && rect.w >= vw - 1 && rect.h >= vh - 1;
}

export function ratioLabel(rect: Rect): string {
  if (!rect.w || !rect.h) return '—';
  const divisor = gcd(Math.round(rect.w), Math.round(rect.h));
  const w = Math.round(rect.w) / divisor;
  const h = Math.round(rect.h) / divisor;
  if (w <= 40 && h <= 40) return `${w}:${h}`;
  return `${(rect.w / rect.h).toFixed(2)}:1`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.max(1, a) : gcd(b, a % b);
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
 * Which encoder to ask for, given the source container.
 *
 * `process_video` picks its encoder from the *output* extension (`codec_for` in
 * src-tauri/src/cmd/media.rs) and only forwards `-crf` to x264/x265/VP9 and
 * `-preset` to x264/x265. Left alone, an .avi would be encoded as mpeg4, where
 * both settings are dropped without a word, and .wmv/.mpg/.mpeg would be handed
 * H.264, which those containers cannot hold. So the codec is always named here,
 * and a container that cannot carry it is swapped for MP4.
 */
export function encodingFor(extension: string): Encoding {
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (ext === 'webm') {
    // VP9 keeps WebM intact. It has no speed presets, so the panel hides that control.
    return { videoCodec: 'libvpx-vp9', videoBitrate: '0', supportsPreset: false };
  }
  return {
    videoCodec: 'libx264',
    format: !ext || H264_CONTAINERS.has(ext) ? undefined : 'mp4',
    supportsPreset: true,
  };
}

export interface CropSettings {
  crf: number;
  preset: string;
  encoding: Encoding;
}

/** Build the `ops` payload for `process_video`. */
export function buildOps(rect: Rect, vw: number, vh: number, settings: CropSettings): Record<string, unknown> {
  const snapped = evenRect(rect, vw, vh);
  const { encoding } = settings;
  return {
    crop: [snapped.x, snapped.y, snapped.w, snapped.h],
    crf: settings.crf,
    preset: encoding.supportsPreset ? settings.preset : undefined,
    videoCodec: encoding.videoCodec,
    videoBitrate: encoding.videoBitrate,
    format: encoding.format,
  };
}
