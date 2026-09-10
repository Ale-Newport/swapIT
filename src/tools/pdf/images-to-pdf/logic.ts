/** Page geometry for Images to PDF. Pure maths so it can be tested directly. */

export type PageSizeId = 'fit' | 'a4' | 'letter' | 'legal' | 'a3';
export type Orientation = 'auto' | 'portrait' | 'landscape';
export type FitMode = 'contain' | 'cover';

/** Portrait dimensions in PostScript points, matching pdf-lib's PageSizes. */
export const PAGE_SIZES: Record<Exclude<PageSizeId, 'fit'>, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
};

export interface LayoutOptions {
  pageSize: PageSizeId;
  orientation: Orientation;
  /** Blank border around the image, in points. */
  margin: number;
  fit: FitMode;
}

export interface PageLayout {
  pageWidth: number;
  pageHeight: number;
  /** Where the image is drawn, in PDF user space (origin bottom-left). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The area the image must not spill out of. */
  box: { x: number; y: number; width: number; height: number };
  /** True when `cover` made the image larger than the box, so it needs clipping. */
  clip: boolean;
}

/**
 * Work out the page size and the rectangle the image occupies on it.
 *
 * `fit` sizes the page to the image itself (plus the margin) so nothing is
 * scaled; the fixed sizes scale the image into the area left by the margin,
 * either fully visible (`contain`) or filling it edge to edge (`cover`).
 */
export function layoutImage(imageWidth: number, imageHeight: number, opts: LayoutOptions): PageLayout {
  const iw = imageWidth > 0 ? imageWidth : 1;
  const ih = imageHeight > 0 ? imageHeight : 1;
  const margin = Math.max(0, opts.margin);

  if (opts.pageSize === 'fit') {
    return {
      pageWidth: iw + margin * 2,
      pageHeight: ih + margin * 2,
      x: margin,
      y: margin,
      width: iw,
      height: ih,
      box: { x: margin, y: margin, width: iw, height: ih },
      clip: false,
    };
  }

  const [portraitW, portraitH] = PAGE_SIZES[opts.pageSize];
  const landscape =
    opts.orientation === 'landscape' || (opts.orientation === 'auto' && iw > ih);
  const pageWidth = landscape ? portraitH : portraitW;
  const pageHeight = landscape ? portraitW : portraitH;

  // A margin wider than half the page would leave nothing to draw into.
  const m = Math.min(margin, (Math.min(pageWidth, pageHeight) - 2) / 2);
  const boxW = pageWidth - m * 2;
  const boxH = pageHeight - m * 2;

  const scale =
    opts.fit === 'cover' ? Math.max(boxW / iw, boxH / ih) : Math.min(boxW / iw, boxH / ih);
  const width = iw * scale;
  const height = ih * scale;

  return {
    pageWidth,
    pageHeight,
    x: m + (boxW - width) / 2,
    y: m + (boxH - height) / 2,
    width,
    height,
    box: { x: m, y: m, width: boxW, height: boxH },
    clip: width > boxW + 0.01 || height > boxH + 0.01,
  };
}

/** Extensions pdf-lib can embed without help. Everything else is converted first. */
const EMBEDDABLE = new Set(['jpg', 'jpeg', 'png']);

export function isEmbeddable(extension: string): boolean {
  return EMBEDDABLE.has(extension.replace(/^\./, '').toLowerCase());
}

export function isPng(path: string): boolean {
  return /\.png$/i.test(path);
}

/**
 * The backend canonicalises input paths, so `/tmp/x` comes back as
 * `/private/tmp/x` on macOS. Index conversion results under both spellings so a
 * lookup by the path the user picked still finds them.
 */
export function pathVariants(path: string): string[] {
  return path.startsWith('/private/')
    ? [path, path.slice('/private'.length)]
    : [path, `/private${path}`];
}

/** A default PDF name derived from the first image, e.g. "IMG_0042" -> "IMG_0042". */
export function defaultPdfName(firstStem: string | undefined, count: number): string {
  const stem = (firstStem ?? '').trim();
  if (!stem) return 'images';
  return count > 1 ? `${stem}-and-${count - 1}-more` : stem;
}
