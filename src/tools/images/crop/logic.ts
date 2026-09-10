export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The eight resize grips, named after compass points. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type Direction = -1 | 0 | 1;

/** Smallest crop we let a drag produce, in image pixels. */
export const MIN_CROP = 8;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Round to whole pixels and force the rectangle inside the image. */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const minSide = Math.max(1, Math.min(MIN_CROP, bounds.width, bounds.height));
  const width = clamp(Math.round(rect.width), minSide, Math.max(minSide, bounds.width));
  const height = clamp(Math.round(rect.height), minSide, Math.max(minSide, bounds.height));
  return {
    x: clamp(Math.round(rect.x), 0, Math.max(0, bounds.width - width)),
    y: clamp(Math.round(rect.y), 0, Math.max(0, bounds.height - height)),
    width,
    height,
  };
}

export function moveRect(start: Rect, dx: number, dy: number, bounds: Size): Rect {
  return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, bounds);
}

/**
 * Build a rectangle that grows away from a fixed anchor point, shrinking
 * proportionally when it would leave the image. `direction` is +1 to grow right
 * or down from the anchor, -1 to grow left or up, and 0 to grow both ways.
 */
export function rectFromAnchor(
  anchor: Point,
  dirX: Direction,
  dirY: Direction,
  width: number,
  height: number,
  bounds: Size,
): Rect {
  const maxWidth =
    dirX === 1 ? bounds.width - anchor.x : dirX === -1 ? anchor.x : 2 * Math.min(anchor.x, bounds.width - anchor.x);
  const maxHeight =
    dirY === 1
      ? bounds.height - anchor.y
      : dirY === -1
        ? anchor.y
        : 2 * Math.min(anchor.y, bounds.height - anchor.y);

  let w = Math.max(1, width);
  let h = Math.max(1, height);
  // One scale factor for both sides keeps the aspect ratio while fitting.
  const factor = Math.min(1, maxWidth > 0 ? maxWidth / w : 0, maxHeight > 0 ? maxHeight / h : 0);
  w *= factor;
  h *= factor;

  const x = dirX === 1 ? anchor.x : dirX === -1 ? anchor.x - w : anchor.x - w / 2;
  const y = dirY === 1 ? anchor.y : dirY === -1 ? anchor.y - h : anchor.y - h / 2;
  return clampRect({ x, y, width: w, height: h }, bounds);
}

/** Drag one grip. `ratio` is width ÷ height, or null when the shape is free. */
export function resizeRect(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: Size,
  ratio: number | null,
): Rect {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.startsWith('n');
  const south = handle.startsWith('s');

  if (ratio && ratio > 0) {
    const centreX = start.x + start.width / 2;
    const centreY = start.y + start.height / 2;

    if ((west || east) && (north || south)) {
      // Corner: width leads, the opposite corner stays put.
      const anchor = {
        x: east ? start.x : start.x + start.width,
        y: south ? start.y : start.y + start.height,
      };
      const width = Math.max(MIN_CROP, start.width + (east ? dx : -dx));
      return rectFromAnchor(anchor, east ? 1 : -1, south ? 1 : -1, width, width / ratio, bounds);
    }
    if (west || east) {
      // Side grip: width leads, the height grows symmetrically about the centre.
      const anchor = { x: east ? start.x : start.x + start.width, y: centreY };
      const width = Math.max(MIN_CROP, start.width + (east ? dx : -dx));
      return rectFromAnchor(anchor, east ? 1 : -1, 0, width, width / ratio, bounds);
    }
    // Top or bottom grip: height leads.
    const anchor = { x: centreX, y: south ? start.y : start.y + start.height };
    const height = Math.max(MIN_CROP, start.height + (south ? dy : -dy));
    return rectFromAnchor(anchor, 0, south ? 1 : -1, height * ratio, height, bounds);
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (west) left = clamp(start.x + dx, 0, bounds.width);
  if (east) right = clamp(start.x + start.width + dx, 0, bounds.width);
  if (north) top = clamp(start.y + dy, 0, bounds.height);
  if (south) bottom = clamp(start.y + start.height + dy, 0, bounds.height);

  if (east) right = Math.min(bounds.width, Math.max(right, left + MIN_CROP));
  else if (west) left = Math.max(0, Math.min(left, right - MIN_CROP));
  if (south) bottom = Math.min(bounds.height, Math.max(bottom, top + MIN_CROP));
  else if (north) top = Math.max(0, Math.min(top, bottom - MIN_CROP));

  return clampRect({ x: left, y: top, width: right - left, height: bottom - top }, bounds);
}

/** Reshape an existing selection to a ratio without moving its centre. */
export function fitAspect(rect: Rect, ratio: number, bounds: Size): Rect {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  return rectFromAnchor(centre, 0, 0, rect.width, rect.width / ratio, bounds);
}

/** A starting selection: centred, covering `fraction` of the image. */
export function centeredRect(bounds: Size, ratio: number | null, fraction = 0.9): Rect {
  const centre = { x: bounds.width / 2, y: bounds.height / 2 };
  if (!ratio || ratio <= 0) {
    return rectFromAnchor(centre, 0, 0, bounds.width * fraction, bounds.height * fraction, bounds);
  }
  const width = bounds.width * fraction;
  return rectFromAnchor(centre, 0, 0, width, width / ratio, bounds);
}

/** Drag a brand-new selection from `origin` to `current`. */
export function drawRect(origin: Point, current: Point, bounds: Size, ratio: number | null): Rect {
  const dirX: Direction = current.x >= origin.x ? 1 : -1;
  const dirY: Direction = current.y >= origin.y ? 1 : -1;
  let width = Math.abs(current.x - origin.x);
  let height = Math.abs(current.y - origin.y);
  if (ratio && ratio > 0) {
    // Follow whichever axis the pointer moved furthest along.
    if (width / ratio >= height) height = width / ratio;
    else width = height * ratio;
  }
  return rectFromAnchor(
    origin,
    dirX,
    dirY,
    Math.max(MIN_CROP, width),
    Math.max(MIN_CROP, height),
    bounds,
  );
}

/** "3:2" for a 1500 × 1000 selection — handy feedback while dragging. */
export function describeRatio(rect: Rect): string {
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(w, h) || 1;
  const rw = w / divisor;
  const rh = h / divisor;
  // Ratios like 1493:997 tell nobody anything — fall back to a decimal.
  if (rw > 40 || rh > 40) return `${(w / h).toFixed(2)} : 1`;
  return `${rw}:${rh}`;
}
