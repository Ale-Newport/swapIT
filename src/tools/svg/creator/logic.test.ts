import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STYLE,
  MIN_SIZE,
  arrowPath,
  boundsOf,
  canResize,
  centerOf,
  createShape,
  describeShape,
  duplicateShape,
  isDegenerate,
  moveInList,
  moveShape,
  newId,
  pathData,
  polyShape,
  rectFromPoints,
  resizeBounds,
  rotatePoint,
  setBounds,
  snapValue,
  toUser,
  type CircleShape,
  type LineShape,
  type PolyShape,
  type RectShape,
  type Shape,
  type TextShape,
} from './logic';

const rect = createShape('rect', { x: 10, y: 20 }, { x: 110, y: 70 }, DEFAULT_STYLE) as RectShape;
const circle = createShape('circle', { x: 0, y: 0 }, { x: 100, y: 60 }, DEFAULT_STYLE) as CircleShape;

describe('createShape', () => {
  it('normalises a rectangle drawn right-to-left', () => {
    const backwards = createShape('rect', { x: 110, y: 70 }, { x: 10, y: 20 }, DEFAULT_STYLE) as RectShape;
    expect(backwards).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('keeps a circle inside the box that was dragged', () => {
    expect(circle).toMatchObject({ cx: 50, cy: 30, r: 30 });
  });

  it('gives lines and arrows no fill, so the shaft is not filled in', () => {
    const line = createShape('line', { x: 0, y: 0 }, { x: 10, y: 10 }, DEFAULT_STYLE) as LineShape;
    expect(line.fill).toBe('none');
    expect(line).toMatchObject({ x1: 0, y1: 0, x2: 10, y2: 10 });
  });

  it('starts text with something visible in it', () => {
    const text = createShape('text', { x: 5, y: 5 }, { x: 5, y: 5 }, DEFAULT_STYLE) as TextShape;
    expect(text.text).toBe('Text');
    expect(text.stroke).toBe('none');
  });

  it('never produces a zero-sized shape', () => {
    const tiny = createShape('rect', { x: 4, y: 4 }, { x: 4, y: 4 }, DEFAULT_STYLE) as RectShape;
    expect(tiny.width).toBeGreaterThanOrEqual(MIN_SIZE);
  });

  it('hands out unique ids', () => {
    expect(newId()).not.toBe(newId());
  });
});

describe('boundsOf', () => {
  it('measures every kind of shape', () => {
    expect(boundsOf(rect)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(boundsOf(circle)).toEqual({ x: 20, y: 0, width: 60, height: 60 });
    const line = createShape('line', { x: 30, y: 40 }, { x: 10, y: 10 }, DEFAULT_STYLE);
    expect(boundsOf(line)).toEqual({ x: 10, y: 10, width: 20, height: 30 });
  });

  it('spans all the points of a polygon', () => {
    const poly = polyShape('polygon', [
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 20, y: 80 },
    ], DEFAULT_STYLE);
    expect(boundsOf(poly)).toEqual({ x: 0, y: 0, width: 50, height: 80 });
  });

  it('puts a text box above its baseline', () => {
    const text = { ...(createShape('text', { x: 100, y: 100 }, { x: 100, y: 100 }, DEFAULT_STYLE) as TextShape), fontSize: 10, text: 'abcd' };
    const bounds = boundsOf(text);
    expect(bounds.y).toBeLessThan(100);
    expect(bounds.height).toBeCloseTo(12);
    expect(bounds.width).toBeCloseTo(22);
  });

  it('finds the centre', () => {
    expect(centerOf(rect)).toEqual({ x: 60, y: 45 });
  });
});

describe('moveShape', () => {
  it('slides each kind by the same delta', () => {
    expect(boundsOf(moveShape(rect, 5, -5))).toEqual({ x: 15, y: 15, width: 100, height: 50 });
    expect(boundsOf(moveShape(circle, 10, 10))).toEqual({ x: 30, y: 10, width: 60, height: 60 });
    const poly = polyShape('path', [{ x: 0, y: 0 }, { x: 10, y: 10 }], DEFAULT_STYLE);
    expect((moveShape(poly, 1, 2) as PolyShape).points).toEqual([
      { x: 1, y: 2 },
      { x: 11, y: 12 },
    ]);
  });

  it('does not mutate the original', () => {
    const before = { ...rect };
    moveShape(rect, 100, 100);
    expect(rect).toEqual(before);
  });
});

describe('resizeBounds and setBounds', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };

  it('keeps the opposite corner fixed', () => {
    expect(resizeBounds(bounds, 'se', { x: 40, y: 30 })).toEqual({ x: 0, y: 0, width: 40, height: 30 });
    expect(resizeBounds(bounds, 'nw', { x: 40, y: 30 })).toEqual({ x: 40, y: 30, width: 60, height: 70 });
  });

  it('flips cleanly when a corner is dragged past the other side', () => {
    expect(resizeBounds(bounds, 'se', { x: -20, y: -10 })).toEqual({ x: -20, y: -10, width: 20, height: 10 });
  });

  it('refuses to collapse a shape to nothing', () => {
    const r = resizeBounds(bounds, 'se', { x: 0, y: 0 });
    expect(r.width).toBe(MIN_SIZE);
    expect(r.height).toBe(MIN_SIZE);
  });

  it('re-fits a circle inside the new bounds', () => {
    const resized = setBounds(circle, { x: 0, y: 0, width: 80, height: 40 }) as CircleShape;
    expect(resized).toMatchObject({ cx: 40, cy: 20, r: 20 });
  });

  it('leaves shapes without resize handles alone', () => {
    const line = createShape('line', { x: 0, y: 0 }, { x: 10, y: 10 }, DEFAULT_STYLE);
    expect(canResize(line)).toBe(false);
    expect(setBounds(line, { x: 50, y: 50, width: 10, height: 10 })).toBe(line);
  });
});

describe('rotatePoint', () => {
  it('turns a quarter circle about the centre', () => {
    expect(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)).toEqual({ x: 0, y: 10 });
  });

  it('is the inverse of itself', () => {
    const center = { x: 3, y: 7 };
    const there = rotatePoint({ x: 20, y: -4 }, center, 37);
    const back = rotatePoint(there, center, -37);
    expect(back.x).toBeCloseTo(20, 1);
    expect(back.y).toBeCloseTo(-4, 1);
  });

  it('short-circuits at zero degrees', () => {
    const point = { x: 1, y: 2 };
    expect(rotatePoint(point, { x: 0, y: 0 }, 0)).toBe(point);
  });
});

describe('path and arrow geometry', () => {
  it('writes a polyline, closed only for polygons', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(pathData(points, false)).toBe('M 0 0 L 10 0 L 10 10');
    expect(pathData(points, true)).toBe('M 0 0 L 10 0 L 10 10 Z');
    expect(pathData([], true)).toBe('');
  });

  it('puts the arrow head at the far end, pointing along the shaft', () => {
    const arrow = createShape('arrow', { x: 0, y: 0 }, { x: 100, y: 0 }, DEFAULT_STYLE) as LineShape;
    const d = arrowPath(arrow);
    expect(d.startsWith('M 0 0 L 100 0')).toBe(true);
    const wings = d.split('M ')[2];
    for (const pair of wings.split(' L ')) {
      const [x] = pair.trim().split(' ').map(Number);
      expect(x).toBeLessThanOrEqual(100);
    }
  });

  it('scales the head with the stroke width', () => {
    const thin = { ...(createShape('arrow', { x: 0, y: 0 }, { x: 100, y: 0 }, DEFAULT_STYLE) as LineShape), strokeWidth: 1 };
    const thick = { ...thin, strokeWidth: 12 };
    const headX = (shape: LineShape) => Number(arrowPath(shape).split('M ')[2].trim().split(' ')[0]);
    expect(headX(thick)).toBeLessThan(headX(thin));
  });
});

describe('editor helpers', () => {
  it('snaps to the grid, and passes values through when the grid is off', () => {
    expect(snapValue(13, 8)).toBe(16);
    expect(snapValue(11, 8)).toBe(8);
    expect(snapValue(13.4, 0)).toBe(13.4);
  });

  it('maps a pointer position into user units at any display scale', () => {
    const rectangle = { left: 100, top: 50, width: 400, height: 300 };
    expect(toUser(300, 200, rectangle, { width: 800, height: 600 })).toEqual({ x: 400, y: 300 });
    expect(toUser(100, 50, rectangle, { width: 800, height: 600 })).toEqual({ x: 0, y: 0 });
  });

  it('treats a click as a click, not a drawing', () => {
    expect(isDegenerate('rect', { x: 0, y: 0 }, { x: 1, y: 40 })).toBe(true);
    expect(isDegenerate('rect', { x: 0, y: 0 }, { x: 40, y: 40 })).toBe(false);
    expect(isDegenerate('line', { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(isDegenerate('line', { x: 0, y: 0 }, { x: 40, y: 0 })).toBe(false);
  });

  it('offsets a duplicate and gives it a new identity', () => {
    const copy = duplicateShape(rect) as RectShape;
    expect(copy.id).not.toBe(rect.id);
    expect(copy.x).toBe(rect.x + 16);
  });

  it('reorders layers and ignores impossible moves', () => {
    const list = ['a', 'b', 'c'];
    expect(moveInList(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveInList(list, 2, -2)).toEqual(['c', 'a', 'b']);
    expect(moveInList(list, 0, -1)).toBe(list);
    expect(moveInList(list, 2, 1)).toBe(list);
  });

  it('names layers in a way a person can scan', () => {
    expect(describeShape(rect)).toBe('Rectangle');
    const text = createShape('text', { x: 0, y: 0 }, { x: 0, y: 0 }, DEFAULT_STYLE) as Shape;
    expect(describeShape(text)).toBe('“Text”');
    expect(describeShape(polyShape('path', [{ x: 0, y: 0 }], DEFAULT_STYLE))).toBe('Path · 1 points');
  });

  it('normalises a rectangle from two arbitrary corners', () => {
    expect(rectFromPoints({ x: 5, y: 9 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 2, width: 4, height: 7 });
  });
});
