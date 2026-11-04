/**
 * Geometry of the radial menu.
 *
 * Every number the native glass mask needs is defined here once and sent verbatim
 * to Rust in `radial_set_layout`, so the blur behind the ring and the SVG drawn on
 * top of it can never drift apart.
 *
 * Coordinates are CSS pixels, origin at the top-left of the radial window. Angles
 * are radians, measured clockwise from the +x axis (screen space, y points down);
 * slot 0 is centred at 12 o'clock.
 */

export const WINDOW_SIZE = 400;
export const CENTER = WINDOW_SIZE / 2;

export const RING = {
  /** Outer edge of the petals. */
  outer: 180,
  /** Inner edge of the petals. */
  inner: 82,
  /** The free-floating disc in the middle. */
  core: 70,
} as const;

/**
 * The most petals a ring ever shows. Six is what a thumb-sized target allows at
 * this radius, and it is also about as many choices as a person weighs at a glance:
 * anything beyond it lives one level down, in a sub-ring.
 */
export const MAX_SLOTS = 6;
/** Channel between two neighbouring petals, in px (constant width, not constant angle). */
export const PETAL_GAP = 5;
/** Fillet radius of the petal corners. */
export const PETAL_CORNER = 14;
/** Pointer closer than this to the centre selects nothing (it is the "cancel" zone). */
export const DEAD_ZONE = 58;
/** Pointer farther than this from the centre stops selecting (flicks still count up to here). */
export const REACH = RING.outer + 60;

export interface Point {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;
export const TOP = -Math.PI / 2;

export function polar(r: number, angle: number, cx = CENTER, cy = CENTER): Point {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** Angle (radians, clockwise from +x) of the slot centre. */
export function slotCenterAngle(index: number, slots: number): number {
  return TOP + (index * TAU) / slots;
}

export function slotSpan(slots: number): number {
  return TAU / slots;
}

export function normalizeAngle(a: number): number {
  const m = a % TAU;
  return m < 0 ? m + TAU : m;
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * One petal: an annular sector whose four corners are filleted and whose two
 * sides are parallel to the radial through the slot centre, so the channel
 * between neighbours has a constant width.
 */
export function petalPath(
  slots: number,
  index: number,
  opts: { inner?: number; outer?: number; gap?: number; corner?: number; cx?: number; cy?: number } = {},
): string {
  const r0 = opts.inner ?? RING.inner;
  const r1 = opts.outer ?? RING.outer;
  const gap = opts.gap ?? PETAL_GAP;
  const rc = Math.min(opts.corner ?? PETAL_CORNER, (r1 - r0) / 2 - 1);
  const cx = opts.cx ?? CENTER;
  const cy = opts.cy ?? CENTER;

  const half = slotSpan(slots) / 2;
  const mid = slotCenterAngle(index, slots);
  const a0 = mid - half;
  const a1 = mid + half;
  const g = gap / 2;

  // Distances along the (offset) side lines at which the fillet circles touch them.
  const tOuter = Math.sqrt(Math.max(0, (r1 - rc) ** 2 - (g + rc) ** 2));
  const tInner = Math.sqrt(Math.max(0, (r0 + rc) ** 2 - (g + rc) ** 2));

  const unit = (a: number): Point => ({ x: Math.cos(a), y: Math.sin(a) });
  const normal = (a: number): Point => ({ x: -Math.sin(a), y: Math.cos(a) });

  /** Point `t` along the side line of the boundary at angle `a`, shifted `shift` px toward `dir`. */
  const onSide = (a: number, t: number, shift: number, dir: 1 | -1): Point => {
    const u = unit(a);
    const n = normal(a);
    return { x: cx + t * u.x + dir * shift * n.x, y: cy + t * u.y + dir * shift * n.y };
  };

  // Fillet circle centres and where they touch the arcs.
  const centre = (a: number, t: number, dir: 1 | -1): Point => onSide(a, t, g + rc, dir);
  const toward = (c: Point, r: number): Point => {
    const dx = c.x - cx;
    const dy = c.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
  };

  const cOuterStart = centre(a0, tOuter, 1);
  const cOuterEnd = centre(a1, tOuter, -1);
  const cInnerStart = centre(a0, tInner, 1);
  const cInnerEnd = centre(a1, tInner, -1);

  const sideOuterStart = onSide(a0, tOuter, g, 1);
  const sideOuterEnd = onSide(a1, tOuter, g, -1);
  const sideInnerStart = onSide(a0, tInner, g, 1);
  const sideInnerEnd = onSide(a1, tInner, g, -1);

  const arcOuterStart = toward(cOuterStart, r1);
  const arcOuterEnd = toward(cOuterEnd, r1);
  const arcInnerStart = toward(cInnerStart, r0);
  const arcInnerEnd = toward(cInnerEnd, r0);

  const p = (pt: Point) => `${fmt(pt.x)} ${fmt(pt.y)}`;
  const large = (from: Point, to: Point, r: number) => {
    const a = Math.atan2(from.y - cy, from.x - cx);
    const b = Math.atan2(to.y - cy, to.x - cx);
    return normalizeAngle(b - a) > Math.PI || r <= 0 ? 1 : 0;
  };

  return [
    `M ${p(sideOuterStart)}`,
    `A ${fmt(rc)} ${fmt(rc)} 0 0 1 ${p(arcOuterStart)}`,
    `A ${fmt(r1)} ${fmt(r1)} 0 ${large(arcOuterStart, arcOuterEnd, r1)} 1 ${p(arcOuterEnd)}`,
    `A ${fmt(rc)} ${fmt(rc)} 0 0 1 ${p(sideOuterEnd)}`,
    `L ${p(sideInnerEnd)}`,
    `A ${fmt(rc)} ${fmt(rc)} 0 0 1 ${p(arcInnerEnd)}`,
    `A ${fmt(r0)} ${fmt(r0)} 0 ${large(arcInnerStart, arcInnerEnd, r0)} 0 ${p(arcInnerStart)}`,
    `A ${fmt(rc)} ${fmt(rc)} 0 0 1 ${p(sideInnerStart)}`,
    'Z',
  ].join(' ');
}

/** A full circle as an SVG path (used for the core disc and its rim). */
export function circlePath(r: number, cx = CENTER, cy = CENTER): string {
  return `M ${fmt(cx - r)} ${fmt(cy)} a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0 a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0 Z`;
}

/**
 * Which slot the pointer is aiming at. `null` inside the dead zone and beyond
 * reach. Outside the ring it still returns the nearest slot, which is what makes
 * hold-and-flick selection forgiving.
 */
export function hitSlot(point: Point, slots: number, filled: number = slots): number | null {
  if (slots <= 0) return null;
  const dx = point.x - CENTER;
  const dy = point.y - CENTER;
  const r = Math.hypot(dx, dy);
  if (r < DEAD_ZONE || r > REACH) return null;
  const rel = normalizeAngle(Math.atan2(dy, dx) - TOP + slotSpan(slots) / 2);
  const index = Math.floor(rel / slotSpan(slots)) % slots;
  return index < filled ? index : null;
}

/** Position of a petal's content (icon + label) in window coordinates. */
export function petalAnchor(slots: number, index: number): Point {
  return polar((RING.inner + RING.outer) / 2, slotCenterAngle(index, slots));
}

/** The shape descriptor the native layer turns into a blur mask. */
export const RING_SHAPE = { kind: 'ring', outer: RING.outer, inner: RING.inner, core: RING.core } as const;

/**
 * Keep an angle continuous across the 0/2π seam, so a rotating highlight takes
 * the short way round from the last slot to the first.
 */
export function unwrapAngle(previous: number, next: number): number {
  let delta = (next - previous) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return previous + delta;
}
