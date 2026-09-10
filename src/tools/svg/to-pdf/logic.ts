/**
 * Page geometry for SVG → PDF. A PDF point is 1/72 inch and a CSS pixel is
 * 1/96 inch, so the artwork's own size converts at 0.75 points per pixel; the
 * raster resolution is then derived from how big the artwork ends up *on the
 * page*, which is what actually decides how sharp it prints.
 */

export const PT_PER_PX = 72 / 96;

export type PageSizeId = 'artwork' | 'a4' | 'letter';
export type Orientation = 'auto' | 'portrait' | 'landscape';

/** Portrait dimensions in PostScript points, matching pdf-lib's PageSizes. */
export const PAGE_SIZES: Record<Exclude<PageSizeId, 'artwork'>, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export const DPI_CHOICES = [150, 300, 600] as const;

/** Canvas limits: beyond these WebKit fails to allocate, silently. */
export const MAX_SIDE = 12000;
export const MAX_PIXELS = 50_000_000;

export interface PdfOptions {
  pageSize: PageSizeId;
  orientation: Orientation;
  /** Blank border around the artwork, in points. */
  margin: number;
  dpi: number;
}

export interface PdfLayout {
  pageWidth: number;
  pageHeight: number;
  /** Where the artwork sits on the page, in PDF user space (origin bottom-left). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Size of the raster to embed. */
  pixelWidth: number;
  pixelHeight: number;
  /** The DPI actually used, lowered when the requested one is undrawable. */
  effectiveDpi: number;
}

export function pdfLayout(artworkWidthPx: number, artworkHeightPx: number, opts: PdfOptions): PdfLayout {
  const artW = (artworkWidthPx > 0 ? artworkWidthPx : 1) * PT_PER_PX;
  const artH = (artworkHeightPx > 0 ? artworkHeightPx : 1) * PT_PER_PX;
  const margin = Math.max(0, opts.margin);

  let pageWidth: number;
  let pageHeight: number;
  let x: number;
  let y: number;
  let width: number;
  let height: number;

  if (opts.pageSize === 'artwork') {
    width = artW;
    height = artH;
    pageWidth = artW + margin * 2;
    pageHeight = artH + margin * 2;
    x = margin;
    y = margin;
  } else {
    const [portraitW, portraitH] = PAGE_SIZES[opts.pageSize];
    const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && artW > artH);
    pageWidth = landscape ? portraitH : portraitW;
    pageHeight = landscape ? portraitW : portraitH;
    // A margin wider than half the page would leave nothing to draw into.
    const m = Math.min(margin, (Math.min(pageWidth, pageHeight) - 2) / 2);
    const boxW = pageWidth - m * 2;
    const boxH = pageHeight - m * 2;
    const scale = Math.min(boxW / artW, boxH / artH);
    width = artW * scale;
    height = artH * scale;
    x = m + (boxW - width) / 2;
    y = m + (boxH - height) / 2;
  }

  const dpi = Number.isFinite(opts.dpi) && opts.dpi > 0 ? opts.dpi : 300;
  let pixelW = (width / 72) * dpi;
  let pixelH = (height / 72) * dpi;
  const overSide = Math.max(pixelW / MAX_SIDE, pixelH / MAX_SIDE, 1);
  const overArea = Math.sqrt(Math.max((pixelW * pixelH) / MAX_PIXELS, 1));
  const factor = Math.max(overSide, overArea);
  if (factor > 1) {
    pixelW /= factor;
    pixelH /= factor;
  }

  return {
    pageWidth,
    pageHeight,
    x,
    y,
    width,
    height,
    pixelWidth: Math.max(1, Math.round(pixelW)),
    pixelHeight: Math.max(1, Math.round(pixelH)),
    effectiveDpi: Math.max(1, Math.round(dpi / factor)),
  };
}

// ------------------------------------------------------------------ svg size

export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const UNIT_PX: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
};

export function lengthToPx(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i.exec(raw.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = UNIT_PX[match[2].toLowerCase()];
  return factor === undefined ? null : value * factor;
}

export function parseViewBox(raw: string | null | undefined): ViewBox | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { minX, minY, width, height };
}

export interface Intrinsic {
  width: number | null;
  height: number | null;
  hasSize: boolean;
}

export function readIntrinsic(source: string): Intrinsic {
  const none: Intrinsic = { width: null, height: null, hasSize: false };
  if (!source.trim()) return none;
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return none;
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg') return none;
  const viewBox = parseViewBox(root.getAttribute('viewBox') ?? root.getAttribute('viewbox'));
  const width = lengthToPx(root.getAttribute('width')) ?? viewBox?.width ?? null;
  const height = lengthToPx(root.getAttribute('height')) ?? viewBox?.height ?? null;
  return { width, height, hasSize: Boolean(width && height) };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Pin the markup to an exact pixel size so it rasterises at that resolution. */
export function prepareSvg(source: string, width: number, height: number): string {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('This file is not valid XML, so it cannot be drawn. Open it in the SVG Viewer to see why.');
  }
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg') {
    throw new Error('This file has no <svg> root element, so there is nothing to put on a page.');
  }
  const intrinsic = readIntrinsic(source);
  if (!root.getAttribute('viewBox') && !root.getAttribute('viewbox') && intrinsic.width && intrinsic.height) {
    root.setAttribute('viewBox', `0 0 ${intrinsic.width} ${intrinsic.height}`);
  }
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(root);
}

/** Points to millimetres, for telling the user how big the page is. */
export function pointsToMm(points: number): number {
  return (points / 72) * 25.4;
}
