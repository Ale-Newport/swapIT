export type ResizeMode = 'fit' | 'fill' | 'exact' | 'percent';

export interface Size {
  width: number;
  height: number;
}

export interface ResizeSettings {
  mode: ResizeMode;
  /** 0 means "not set" — the backend treats a missing side as unbounded. */
  width: number;
  height: number;
  percent: number;
  allowUpscale: boolean;
}

/**
 * Aspect-preserving fit, matching the maths the Rust `image` crate uses so the
 * number shown in the UI is the number the file ends up with.
 */
function fitToBox(source: Size, boxWidth: number, boxHeight: number): Size {
  const ratio = Math.min(boxWidth / source.width, boxHeight / source.height);
  return {
    width: Math.max(1, Math.round(source.width * ratio)),
    height: Math.max(1, Math.round(source.height * ratio)),
  };
}

/** The size `process_images` will produce for `source` under these settings. */
export function predictSize(source: Size, s: ResizeSettings): Size {
  if (source.width <= 0 || source.height <= 0) return source;

  if (s.mode === 'percent') {
    const factor = Math.max(1, s.percent) / 100;
    return {
      width: Math.max(1, Math.round(source.width * factor)),
      height: Math.max(1, Math.round(source.height * factor)),
    };
  }

  const targetWidth = Math.max(0, Math.round(s.width || 0));
  const targetHeight = Math.max(0, Math.round(s.height || 0));
  if (targetWidth === 0 && targetHeight === 0) return source;

  if (s.mode === 'exact' || s.mode === 'fill') {
    return { width: Math.max(1, targetWidth), height: Math.max(1, targetHeight) };
  }

  const boxWidth = targetWidth === 0 ? Number.POSITIVE_INFINITY : targetWidth;
  const boxHeight = targetHeight === 0 ? Number.POSITIVE_INFINITY : targetHeight;
  // "fit" never grows an image unless upscaling was asked for.
  if (!s.allowUpscale && source.width <= boxWidth && source.height <= boxHeight) return source;
  return fitToBox(source, boxWidth, boxHeight);
}

/** The other side of the box when the aspect ratio is locked to the source. */
export function lockedCounterpart(source: Size, axis: 'width' | 'height', value: number): number {
  if (source.width <= 0 || source.height <= 0 || value <= 0) return 0;
  return axis === 'width'
    ? Math.max(1, Math.round((value * source.height) / source.width))
    : Math.max(1, Math.round((value * source.width) / source.height));
}

/** Why the run button is unavailable, or null when the settings are usable. */
export function describeProblem(s: ResizeSettings): string | null {
  if (s.mode === 'percent') {
    return s.percent > 0 ? null : 'Enter a percentage above zero.';
  }
  const hasWidth = s.width > 0;
  const hasHeight = s.height > 0;
  if (s.mode === 'fit') {
    return hasWidth || hasHeight ? null : 'Enter a width, a height, or both.';
  }
  return hasWidth && hasHeight ? null : 'This mode needs both a width and a height.';
}
