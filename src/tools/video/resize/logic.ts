/** Target-size maths for the video resizer. Pure and testable. */

export interface Dims {
  width: number | null;
  height: number | null;
}

export interface SourceSize {
  w: number;
  h: number;
}

export const RESOLUTIONS = [
  { label: '480p', value: 480 },
  { label: '720p', value: 720 },
  { label: '1080p', value: 1080 },
  { label: '1440p', value: 1440 },
  { label: '4K', value: 2160 },
];

export const ASPECTS = [
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '4:5', value: '4:5', ratio: 4 / 5 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
];

/** Encoders work in 2×2 colour blocks, so every dimension has to be even. */
export function evenDim(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/**
 * A resolution preset names the short side for landscape footage. Portrait video
 * gets the number applied to its width instead, so "720p" stays 720p either way.
 */
export function resolutionDims(target: number, source: SourceSize | null): Dims {
  const portrait = Boolean(source && source.h > source.w);
  return portrait ? { width: evenDim(target), height: null } : { width: null, height: evenDim(target) };
}

/** An aspect preset keeps the source's longer side and recomputes the other. */
export function aspectDims(ratio: number, source: SourceSize): Dims {
  const longest = Math.max(source.w, source.h);
  if (ratio >= 1) return { width: evenDim(longest), height: evenDim(longest / ratio) };
  return { width: evenDim(longest * ratio), height: evenDim(longest) };
}

/** What the output will actually measure, mirroring FFmpeg's `-2` rounding. */
export function predict(dims: Dims, source: SourceSize | null, noUpscale: boolean): SourceSize | null {
  if (!source || !source.w || !source.h) return null;
  const { width, height } = dims;
  if (!width && !height) return null;
  if (width && height) return { w: evenDim(width), h: evenDim(height) };
  if (width) {
    const w = noUpscale ? Math.min(width, source.w) : width;
    return { w: evenDim(w), h: evenDim((source.h * w) / source.w) };
  }
  const h = noUpscale ? Math.min(height as number, source.h) : (height as number);
  return { w: evenDim((source.w * h) / source.h), h: evenDim(h) };
}

/** A scale filter that caps the height and never enlarges a smaller video. */
export function capHeightFilter(height: number): string {
  return `scale=-2:'trunc(min(ih,${evenDim(height)})/2)*2':flags=lanczos`;
}

/** A scale filter that caps the width and never enlarges a smaller video. */
export function capWidthFilter(width: number): string {
  return `scale='trunc(min(iw,${evenDim(width)})/2)*2':-2:flags=lanczos`;
}

export interface ResizeSettings {
  noUpscale: boolean;
  crf: number;
  preset: string;
}

/** "Don't enlarge" is only expressible while exactly one side is pinned. */
export function canAvoidUpscaling(dims: Dims): boolean {
  return Boolean(dims.width) !== Boolean(dims.height);
}

/** Build the `ops` payload for `process_video`. */
export function buildOps(dims: Dims, settings: ResizeSettings): Record<string, unknown> {
  const ops: Record<string, unknown> = { crf: settings.crf, preset: settings.preset };
  const width = dims.width ? evenDim(dims.width) : null;
  const height = dims.height ? evenDim(dims.height) : null;

  if (settings.noUpscale && canAvoidUpscaling(dims)) {
    ops.extraFilters = [height ? capHeightFilter(height) : capWidthFilter(width as number)];
    return ops;
  }
  if (width) ops.width = width;
  if (height) ops.height = height;
  return ops;
}

/** Read a dimension field: blank means "work it out from the other side". */
export function parseDim(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(16384, Math.round(n));
}

/** How far the target strays from the source's shape, as a ratio of ratios. */
export function distortion(dims: Dims, source: SourceSize | null): number {
  if (!source || !source.w || !source.h || !dims.width || !dims.height) return 0;
  const target = dims.width / dims.height;
  const original = source.w / source.h;
  return Math.abs(target - original) / original;
}

export function matchResolution(dims: Dims, source: SourceSize | null): number | null {
  for (const r of RESOLUTIONS) {
    const preset = resolutionDims(r.value, source);
    if (preset.width === dims.width && preset.height === dims.height) return r.value;
  }
  return null;
}
