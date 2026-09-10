/**
 * Size maths for turning a vector into pixels. The DOM work is limited to
 * reading the root element and writing an explicit size back onto it, which is
 * what makes an <img> rasterise at the resolution we asked for.
 */

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

/** CSS pixels for an SVG length, or null for %/em and other relative units. */
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
  /** The size the artwork claims, in CSS pixels. Null when it declares none. */
  width: number | null;
  height: number | null;
  viewBox: ViewBox | null;
  ratio: number | null;
  hasSize: boolean;
}

export function readIntrinsic(source: string): Intrinsic {
  const none: Intrinsic = { width: null, height: null, viewBox: null, ratio: null, hasSize: false };
  if (!source.trim()) return none;
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return none;
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg') return none;

  const viewBox = parseViewBox(root.getAttribute('viewBox') ?? root.getAttribute('viewbox'));
  const width = lengthToPx(root.getAttribute('width')) ?? viewBox?.width ?? null;
  const height = lengthToPx(root.getAttribute('height')) ?? viewBox?.height ?? null;
  const ratio = width && height ? width / height : viewBox ? viewBox.width / viewBox.height : null;
  return { width, height, viewBox, ratio, hasSize: Boolean(width && height) };
}

export type SizeMode = 'scale' | 'exact';

export interface SizeOptions {
  mode: SizeMode;
  /** Multiplier applied to the intrinsic size in `scale` mode. */
  scale: number;
  width: number;
  height: number;
  lockAspect: boolean;
}

export type TargetResult = { ok: true; width: number; height: number } | { ok: false; message: string };

/** WebKit refuses canvases beyond roughly this, and fails silently when it does. */
export const MAX_SIDE = 12000;
export const MAX_PIXELS = 50_000_000;

export function computeTarget(intrinsic: Intrinsic, opts: SizeOptions): TargetResult {
  let width: number;
  let height: number;

  if (opts.mode === 'scale') {
    if (!intrinsic.hasSize || !intrinsic.width || !intrinsic.height) {
      return {
        ok: false,
        message:
          'This SVG declares no width, height or viewBox, so there is no size to multiply. Switch to “Exact size” and type the pixels you want.',
      };
    }
    const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
    width = Math.round(intrinsic.width * scale);
    height = Math.round(intrinsic.height * scale);
  } else {
    width = Math.round(opts.width);
    height = opts.lockAspect && intrinsic.ratio ? Math.round(width / intrinsic.ratio) : Math.round(opts.height);
  }

  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { ok: false, message: 'Give the image a width and a height of at least 1 pixel.' };
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    return {
      ok: false,
      message: `${width} × ${height} is too large to draw — keep each side under ${MAX_SIDE.toLocaleString()} pixels.`,
    };
  }
  if (width * height > MAX_PIXELS) {
    return {
      ok: false,
      message: `${width} × ${height} is ${(
        (width * height) /
        1_000_000
      ).toFixed(0)} megapixels, more than this app can draw in one go. Use a smaller size.`,
    };
  }
  return { ok: true, width, height };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Give the markup an explicit pixel size so the browser rasterises it at that
 * resolution, adding the viewBox it needs to actually scale rather than just
 * sitting in a bigger box.
 */
export function prepareSvg(source: string, width: number, height: number): string {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('This file is not valid XML, so it cannot be drawn. Open it in the SVG Viewer to see why.');
  }
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg') {
    throw new Error('This file has no <svg> root element, so there is nothing to draw.');
  }

  const intrinsic = readIntrinsic(source);
  if (!root.getAttribute('viewBox') && !root.getAttribute('viewbox') && intrinsic.width && intrinsic.height) {
    // Without a viewBox the artwork would keep its original size inside a
    // larger canvas instead of scaling up to it.
    root.setAttribute('viewBox', `0 0 ${intrinsic.width} ${intrinsic.height}`);
  }
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(root);
}
