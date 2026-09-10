/** The Ghostscript profiles the backend accepts. */
export type CompressPreset = 'screen' | 'ebook' | 'printer' | 'prepress';

const PRESETS: CompressPreset[] = ['screen', 'ebook', 'printer', 'prepress'];

/** Image resolution each profile downsamples to, for the "what will this do" hint. */
const PRESET_DPI: Record<CompressPreset, number> = {
  screen: 72,
  ebook: 150,
  printer: 300,
  prepress: 300,
};

/** Ghostscript refuses anything outside this band, so the UI never sends it. */
export const MIN_DPI = 36;
export const MAX_DPI = 600;

export interface CompressOpts {
  preset: CompressPreset;
  dpi?: number;
  grayscale: boolean;
}

export function isCompressPreset(value: string): value is CompressPreset {
  return (PRESETS as string[]).includes(value);
}

export function presetDpi(preset: CompressPreset): number {
  return PRESET_DPI[preset];
}

/**
 * Assemble the options object. An out-of-range or missing DPI falls back to the
 * profile's own resolution rather than failing the run, and an unknown profile
 * lands on the balanced one — the same default the backend uses.
 */
export function buildCompressOpts(
  preset: string,
  grayscale: boolean,
  dpi: number | null,
): CompressOpts {
  const safePreset: CompressPreset = isCompressPreset(preset) ? preset : 'ebook';
  if (dpi === null || !Number.isFinite(dpi)) {
    return { preset: safePreset, grayscale };
  }
  return {
    preset: safePreset,
    grayscale,
    dpi: Math.min(MAX_DPI, Math.max(MIN_DPI, Math.round(dpi))),
  };
}

/** One line describing what the run will do, shown next to the action button. */
export function describeCompression(opts: CompressOpts): string {
  const dpi = opts.dpi ?? presetDpi(opts.preset);
  const colour = opts.grayscale ? ', converted to grayscale' : '';
  return `Images are downsampled to ${dpi} dpi${colour}. Text stays sharp at any size.`;
}
