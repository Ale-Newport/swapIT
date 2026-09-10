/**
 * Image size maths.
 *
 * Two of the three numbers here are exact: megapixels and the uncompressed
 * size (width × height × channels × bit depth ÷ 8), as is the decoded memory
 * footprint, which is what an application actually allocates when it opens the
 * file. The compressed estimates are a model built from bits-per-pixel figures
 * measured on ordinary photographic and screenshot content — useful for
 * planning, never exact for a specific picture.
 */

export function megapixels(width: number, height: number): number | null {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) return null;
  return (width * height) / 1e6;
}

/** Exact size of the raw pixel data with no compression and no headers. */
export function uncompressedBytes(
  width: number,
  height: number,
  bitsPerChannel: number,
  channels: number,
): number | null {
  if (![width, height, bitsPerChannel, channels].every((n) => Number.isFinite(n) && n > 0)) return null;
  return (width * height * channels * bitsPerChannel) / 8;
}

/**
 * What the image costs in RAM once decoded. Almost every toolkit expands to
 * 8-bit RGBA regardless of the file's own format, which is why a 4 MB JPEG can
 * cost 48 MB to display.
 */
export function decodedBytes(width: number, height: number, bytesPerPixel = 4): number | null {
  if (![width, height, bytesPerPixel].every((n) => Number.isFinite(n) && n > 0)) return null;
  return width * height * bytesPerPixel;
}

interface CurvePoint {
  quality: number;
  bpp: number;
}

/**
 * Bits per pixel for JPEG at a given quality on photographic content. Anchored
 * on the familiar case: a 12 MP photo at quality 85 lands near 4 MB.
 */
const JPEG_CURVE: CurvePoint[] = [
  { quality: 10, bpp: 0.25 },
  { quality: 20, bpp: 0.42 },
  { quality: 30, bpp: 0.6 },
  { quality: 40, bpp: 0.9 },
  { quality: 50, bpp: 1.15 },
  { quality: 60, bpp: 1.4 },
  { quality: 70, bpp: 1.75 },
  { quality: 75, bpp: 2.0 },
  { quality: 80, bpp: 2.3 },
  { quality: 85, bpp: 2.7 },
  { quality: 90, bpp: 3.4 },
  { quality: 95, bpp: 4.8 },
  { quality: 100, bpp: 8.0 },
];

/** Linear interpolation along the JPEG curve, clamped at both ends. */
export function jpegBpp(quality: number): number {
  if (!Number.isFinite(quality)) return JPEG_CURVE[0].bpp;
  const q = Math.min(100, Math.max(1, quality));
  if (q <= JPEG_CURVE[0].quality) return JPEG_CURVE[0].bpp;
  for (let i = 1; i < JPEG_CURVE.length; i++) {
    const prev = JPEG_CURVE[i - 1];
    const next = JPEG_CURVE[i];
    if (q <= next.quality) {
      const t = (q - prev.quality) / (next.quality - prev.quality);
      return prev.bpp + t * (next.bpp - prev.bpp);
    }
  }
  return JPEG_CURVE[JPEG_CURVE.length - 1].bpp;
}

export type PngContent = 'photo' | 'gradient' | 'screenshot' | 'flat' | 'lineart';

export interface PngProfile {
  id: PngContent;
  label: string;
  bpp: number;
  note: string;
}

export const PNG_PROFILES: PngProfile[] = [
  { id: 'photo', label: 'Photograph', bpp: 12, note: 'Noise defeats PNG — roughly 2:1 at best' },
  { id: 'gradient', label: 'Render or gradient', bpp: 6.5, note: 'Smooth tones, some banding-free detail' },
  { id: 'screenshot', label: 'UI screenshot', bpp: 2.6, note: 'Text and flat panels with a few images' },
  { id: 'flat', label: 'Flat colour graphic', bpp: 1.2, note: 'Logos, charts, large solid areas' },
  { id: 'lineart', label: 'Line art or icons', bpp: 0.5, note: 'Few colours, long identical runs' },
];

export function pngProfile(id: string): PngProfile {
  return PNG_PROFILES.find((p) => p.id === id) ?? PNG_PROFILES[0];
}

/**
 * How much cheaper grey is, and how much alpha costs. JPEG has no alpha channel
 * at all, so a fourth channel changes nothing there.
 */
export function channelFactor(channels: number, supportsAlpha: boolean): number {
  if (channels <= 1) return 0.45;
  if (channels === 2) return supportsAlpha ? 0.55 : 0.45;
  if (channels >= 4 && supportsAlpha) return 1.15;
  return 1;
}

/** Deeper files carry more entropy, so lossless formats grow with bit depth. */
export function depthFactor(bitsPerChannel: number): number {
  if (bitsPerChannel <= 8) return 1;
  if (bitsPerChannel <= 16) return 1.8;
  return 2.4;
}

export interface FormatEstimate {
  id: string;
  label: string;
  bytes: number;
  /** Uncompressed ÷ estimated, e.g. 9 for "9:1". */
  ratio: number;
  note: string;
}

export interface EstimateInput {
  width: number;
  height: number;
  bitsPerChannel: number;
  channels: number;
  jpegQuality: number;
  pngContent: PngContent;
}

/** JPEG, PNG and WebP estimates for one pixel grid. */
export function estimateFormats(input: EstimateInput): FormatEstimate[] {
  const { width, height, bitsPerChannel, channels, jpegQuality } = input;
  const raw = uncompressedBytes(width, height, bitsPerChannel, channels);
  if (raw === null) return [];
  const pixels = width * height;
  const profile = pngProfile(input.pngContent);

  const jpeg = (pixels * jpegBpp(jpegQuality) * channelFactor(channels, false)) / 8;
  const png = (pixels * profile.bpp * channelFactor(channels, true) * depthFactor(bitsPerChannel)) / 8;
  // WebP beats JPEG by roughly 25–30% at matched quality, and PNG by about 25%.
  const webpLossy = jpeg * 0.72;
  const webpLossless = png * 0.75;

  const rows: Array<[string, string, number, string]> = [
    ['jpeg', `JPEG · quality ${Math.round(jpegQuality)}`, jpeg, bitsPerChannel > 8 ? 'JPEG is 8-bit only — depth ignored' : 'No alpha channel'],
    ['png', `PNG · ${profile.label.toLowerCase()}`, png, profile.note],
    ['webp-lossy', 'WebP lossy', webpLossy, 'About 28% under JPEG at the same quality'],
    ['webp-lossless', 'WebP lossless', webpLossless, 'About 25% under PNG'],
  ];

  return rows.map(([id, label, bytes, note]) => ({
    id,
    label,
    bytes,
    ratio: bytes > 0 ? raw / bytes : 0,
    note,
  }));
}

export function parsePositive(text: string): number | null {
  const raw = text.trim().replace(/[\s,_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function trim(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart = ''] = fixed.split('.');
  const frac = fracPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Decimal byte sizes, matching how image tools report them. */
export function formatSize(bytes: number | null, decimals = 2): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1e9) return `${trim(bytes / 1e9, decimals)} GB`;
  if (bytes >= 1e6) return `${trim(bytes / 1e6, decimals)} MB`;
  if (bytes >= 1e3) return `${trim(bytes / 1e3, decimals)} kB`;
  return `${trim(bytes, 0)} B`;
}

export interface SizePreset {
  label: string;
  width: number;
  height: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { label: 'Phone 12 MP', width: 4032, height: 3024 },
  { label: 'DSLR 24 MP', width: 6000, height: 4000 },
  { label: 'Studio 48 MP', width: 8000, height: 6000 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
  { label: 'Square 1080', width: 1080, height: 1080 },
  { label: 'Icon 512', width: 512, height: 512 },
];
