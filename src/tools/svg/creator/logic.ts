/**
 * The document model and the geometry behind the editor. Shapes are plain data;
 * the component turns them into real `<rect>`, `<circle>` and `<path>` elements,
 * which is what makes hit-testing and export fall out for free.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'polygon' | 'path';

interface BaseShape {
  id: string;
  kind: ShapeKind;
  /** A colour, or 'none'. */
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  /** Degrees, applied about the shape's own centre. */
  rotation: number;
}

export interface RectShape extends BaseShape {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

export interface CircleShape extends BaseShape {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface EllipseShape extends BaseShape {
  kind: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface LineShape extends BaseShape {
  kind: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextShape extends BaseShape {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
}

export interface PolyShape extends BaseShape {
  kind: 'polygon' | 'path';
  points: Point[];
}

export type Shape = RectShape | CircleShape | EllipseShape | LineShape | TextShape | PolyShape;

export interface Doc {
  width: number;
  height: number;
  /** A colour, or 'none' for a transparent canvas. */
  background: string;
  shapes: Shape[];
}

export const FONT_STACK = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

export const DEFAULT_DOC: Doc = {
  width: 800,
  height: 600,
  background: '#ffffff',
  shapes: [],
};

export interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export const DEFAULT_STYLE: Style = {
  fill: '#93c5fd',
  stroke: '#1e3a8a',
  strokeWidth: 2,
  opacity: 1,
};

/** Smallest side a resize drag can produce, in user units. */
export const MIN_SIZE = 2;

export function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `s${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export const round = (value: number, decimals = 2) => Number(value.toFixed(decimals)) + 0;

export function snapValue(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/** Turn a pointer position into user units, whatever size the canvas is drawn at. */
export function toUser(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, doc: { width: number; height: number }): Point {
  const scaleX = rect.width > 0 ? doc.width / rect.width : 1;
  const scaleY = rect.height > 0 ? doc.height / rect.height : 1;
  return { x: round((clientX - rect.left) * scaleX), y: round((clientY - rect.top) * scaleY) };
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Rough width of a run of text — enough for a selection box, not for typesetting. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

export function boundsOf(shape: Shape): Rect {
  switch (shape.kind) {
    case 'rect':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case 'circle':
      return { x: shape.cx - shape.r, y: shape.cy - shape.r, width: shape.r * 2, height: shape.r * 2 };
    case 'ellipse':
      return { x: shape.cx - shape.rx, y: shape.cy - shape.ry, width: shape.rx * 2, height: shape.ry * 2 };
    case 'line':
    case 'arrow':
      return rectFromPoints({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
    case 'text':
      return {
        x: shape.x,
        y: shape.y - shape.fontSize * 0.8,
        width: textWidth(shape.text, shape.fontSize),
        height: shape.fontSize * 1.2,
      };
    case 'polygon':
    case 'path': {
      if (shape.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
  }
}

export function centerOf(shape: Shape): Point {
  const bounds = boundsOf(shape);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export function moveShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.kind) {
    case 'rect':
      return { ...shape, x: round(shape.x + dx), y: round(shape.y + dy) };
    case 'circle':
    case 'ellipse':
      return { ...shape, cx: round(shape.cx + dx), cy: round(shape.cy + dy) };
    case 'line':
    case 'arrow':
      return {
        ...shape,
        x1: round(shape.x1 + dx),
        y1: round(shape.y1 + dy),
        x2: round(shape.x2 + dx),
        y2: round(shape.y2 + dy),
      };
    case 'text':
      return { ...shape, x: round(shape.x + dx), y: round(shape.y + dy) };
    case 'polygon':
    case 'path':
      return { ...shape, points: shape.points.map((p) => ({ x: round(p.x + dx), y: round(p.y + dy) })) };
  }
}

/** Only the shapes that show resize handles can be given new bounds. */
export function canResize(shape: Shape): boolean {
  return shape.kind === 'rect' || shape.kind === 'circle' || shape.kind === 'ellipse';
}

export function setBounds(shape: Shape, rect: Rect): Shape {
  const width = Math.max(MIN_SIZE, rect.width);
  const height = Math.max(MIN_SIZE, rect.height);
  switch (shape.kind) {
    case 'rect':
      return { ...shape, x: round(rect.x), y: round(rect.y), width: round(width), height: round(height) };
    case 'circle': {
      const r = Math.max(MIN_SIZE / 2, Math.min(width, height) / 2);
      return { ...shape, cx: round(rect.x + width / 2), cy: round(rect.y + height / 2), r: round(r) };
    }
    case 'ellipse':
      return {
        ...shape,
        cx: round(rect.x + width / 2),
        cy: round(rect.y + height / 2),
        rx: round(width / 2),
        ry: round(height / 2),
      };
    default:
      return shape;
  }
}

export const HANDLES = ['nw', 'ne', 'se', 'sw'] as const;
export type Handle = (typeof HANDLES)[number];

/** New bounds after dragging one corner to `point`; the opposite corner stays put. */
export function resizeBounds(bounds: Rect, handle: Handle, point: Point): Rect {
  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;
  if (handle === 'nw' || handle === 'sw') left = point.x;
  else right = point.x;
  if (handle === 'nw' || handle === 'ne') top = point.y;
  else bottom = point.y;
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.max(MIN_SIZE, Math.abs(right - left)),
    height: Math.max(MIN_SIZE, Math.abs(bottom - top)),
  };
}

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  if (!degrees) return point;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: round(center.x + dx * cos - dy * sin),
    y: round(center.y + dx * sin + dy * cos),
  };
}

export function pathData(points: Point[], closed: boolean): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${round(first.x)} ${round(first.y)}${rest.map((p) => ` L ${round(p.x)} ${round(p.y)}`).join('')}${closed ? ' Z' : ''}`;
}

/** Shaft plus a two-stroke head, so an arrow is a single path with no marker defs. */
export function arrowPath(shape: LineShape): string {
  const { x1, y1, x2, y2 } = shape;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(6, shape.strokeWidth * 3.2);
  const wing = Math.PI / 7;
  const left = { x: x2 - size * Math.cos(angle - wing), y: y2 - size * Math.sin(angle - wing) };
  const right = { x: x2 - size * Math.cos(angle + wing), y: y2 - size * Math.sin(angle + wing) };
  return (
    `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}` +
    ` M ${round(left.x)} ${round(left.y)} L ${round(x2)} ${round(y2)} L ${round(right.x)} ${round(right.y)}`
  );
}

/** Build a shape from a drag between two points. */
export function createShape(kind: ShapeKind, from: Point, to: Point, style: Style): Shape {
  const base = { id: newId(), rotation: 0, ...style };
  const rect = rectFromPoints(from, to);
  switch (kind) {
    case 'circle':
      return {
        ...base,
        kind: 'circle',
        cx: round(rect.x + rect.width / 2),
        cy: round(rect.y + rect.height / 2),
        r: round(Math.max(MIN_SIZE / 2, Math.min(rect.width, rect.height) / 2)),
      };
    case 'ellipse':
      return {
        ...base,
        kind: 'ellipse',
        cx: round(rect.x + rect.width / 2),
        cy: round(rect.y + rect.height / 2),
        rx: round(Math.max(MIN_SIZE / 2, rect.width / 2)),
        ry: round(Math.max(MIN_SIZE / 2, rect.height / 2)),
      };
    case 'line':
    case 'arrow':
      return { ...base, kind, x1: round(from.x), y1: round(from.y), x2: round(to.x), y2: round(to.y), fill: 'none' };
    case 'text':
      return {
        ...base,
        kind: 'text',
        x: round(from.x),
        y: round(from.y),
        text: 'Text',
        fontSize: 32,
        fontWeight: 500,
        fontFamily: FONT_STACK,
        fill: style.stroke === 'none' ? '#111113' : style.stroke,
        stroke: 'none',
      };
    case 'polygon':
    case 'path':
      return { ...base, kind, points: [from, to] };
    case 'rect':
    default:
      return {
        ...base,
        kind: 'rect',
        x: round(rect.x),
        y: round(rect.y),
        width: round(Math.max(MIN_SIZE, rect.width)),
        height: round(Math.max(MIN_SIZE, rect.height)),
        rx: 0,
      };
  }
}

export function polyShape(kind: 'polygon' | 'path', points: Point[], style: Style): PolyShape {
  return {
    id: newId(),
    kind,
    rotation: 0,
    ...style,
    fill: kind === 'path' ? 'none' : style.fill,
    points: points.map((p) => ({ x: round(p.x), y: round(p.y) })),
  };
}

/** A drag this small was a click, not an attempt to draw something. */
export function isDegenerate(kind: ShapeKind, from: Point, to: Point): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (kind === 'line' || kind === 'arrow') return Math.hypot(dx, dy) < MIN_SIZE;
  return dx < MIN_SIZE || dy < MIN_SIZE;
}

export function duplicateShape(shape: Shape, offset = 16): Shape {
  return { ...moveShape(shape, offset, offset), id: newId() };
}

/** Move an item within a list, returning a new list. Out-of-range moves are no-ops. */
export function moveInList<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

const KIND_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  circle: 'Circle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  text: 'Text',
  polygon: 'Polygon',
  path: 'Path',
};

export function describeShape(shape: Shape): string {
  if (shape.kind === 'text') return shape.text.trim() ? `“${shape.text.slice(0, 22)}”` : 'Text';
  if (shape.kind === 'polygon' || shape.kind === 'path') {
    return `${KIND_LABELS[shape.kind]} · ${shape.points.length} points`;
  }
  return KIND_LABELS[shape.kind];
}

export function kindLabel(kind: ShapeKind): string {
  return KIND_LABELS[kind];
}
