import { describe, it, expect } from 'vitest';
import {
  MIN_CROP,
  centeredRect,
  clampRect,
  describeRatio,
  drawRect,
  fitAspect,
  moveRect,
  rectFromAnchor,
  resizeRect,
  type Rect,
  type Size,
} from './logic';

const bounds: Size = { width: 1000, height: 800 };
const inside = (r: Rect, b: Size) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= b.width && r.y + r.height <= b.height;

describe('clampRect', () => {
  it('pulls a rectangle back inside the image', () => {
    expect(clampRect({ x: -50, y: -50, width: 200, height: 200 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
    expect(clampRect({ x: 950, y: 750, width: 200, height: 200 }, bounds)).toEqual({
      x: 800,
      y: 600,
      width: 200,
      height: 200,
    });
  });

  it('never returns a selection larger than the image', () => {
    const r = clampRect({ x: 0, y: 0, width: 5000, height: 5000 }, bounds);
    expect(r).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it('enforces a minimum size', () => {
    expect(clampRect({ x: 10, y: 10, width: 1, height: 1 }, bounds).width).toBe(MIN_CROP);
  });

  it('copes with an image smaller than the minimum crop', () => {
    const tiny: Size = { width: 4, height: 4 };
    const r = clampRect({ x: 0, y: 0, width: 1, height: 1 }, tiny);
    expect(inside(r, tiny)).toBe(true);
  });

  it('rounds to whole pixels — the backend takes integers', () => {
    const r = clampRect({ x: 10.4, y: 10.6, width: 99.5, height: 50.2 }, bounds);
    expect(Object.values(r).every(Number.isInteger)).toBe(true);
  });
});

describe('moveRect', () => {
  it('slides the selection without changing its size', () => {
    const r = moveRect({ x: 100, y: 100, width: 200, height: 200 }, 50, -30, bounds);
    expect(r).toEqual({ x: 150, y: 70, width: 200, height: 200 });
  });

  it('stops at the edge instead of clipping the selection', () => {
    const r = moveRect({ x: 900, y: 700, width: 100, height: 100 }, 500, 500, bounds);
    expect(r).toEqual({ x: 900, y: 700, width: 100, height: 100 });
  });
});

describe('resizeRect (free)', () => {
  it('drags the south-east corner outwards', () => {
    const r = resizeRect({ x: 100, y: 100, width: 200, height: 200 }, 'se', 50, 60, bounds, null);
    expect(r).toEqual({ x: 100, y: 100, width: 250, height: 260 });
  });

  it('drags the north-west corner and keeps the far corner fixed', () => {
    const r = resizeRect({ x: 100, y: 100, width: 200, height: 200 }, 'nw', 50, 50, bounds, null);
    expect(r).toEqual({ x: 150, y: 150, width: 150, height: 150 });
  });

  it('only moves the axis the grip owns', () => {
    const r = resizeRect({ x: 100, y: 100, width: 200, height: 200 }, 'e', 40, 999, bounds, null);
    expect(r).toEqual({ x: 100, y: 100, width: 240, height: 200 });
  });

  it('refuses to invert when dragged past the opposite edge', () => {
    const r = resizeRect({ x: 100, y: 100, width: 200, height: 200 }, 'se', -900, -900, bounds, null);
    expect(r.width).toBe(MIN_CROP);
    expect(r.height).toBe(MIN_CROP);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it('stays inside the image when dragged far outside it', () => {
    const r = resizeRect({ x: 900, y: 700, width: 90, height: 90 }, 'se', 5000, 5000, bounds, null);
    expect(inside(r, bounds)).toBe(true);
    expect(r.x + r.width).toBe(1000);
  });
});

describe('resizeRect (locked ratio)', () => {
  it('keeps a square square when a corner is dragged', () => {
    const r = resizeRect({ x: 100, y: 100, width: 200, height: 200 }, 'se', 100, 0, bounds, 1);
    expect(r).toEqual({ x: 100, y: 100, width: 300, height: 300 });
  });

  it('derives the height from the width on a side grip', () => {
    const r = resizeRect({ x: 100, y: 100, width: 200, height: 100 }, 'e', 200, 0, bounds, 2);
    expect(r.width).toBe(400);
    expect(r.height).toBe(200);
    // The centre line stays put: 100 + 100/2 = 150.
    expect(r.y + r.height / 2).toBe(150);
  });

  it('derives the width from the height on a top grip', () => {
    const r = resizeRect({ x: 100, y: 300, width: 200, height: 100 }, 'n', 0, -100, bounds, 2);
    expect(r.height).toBe(200);
    expect(r.width).toBe(400);
    expect(r.y + r.height).toBe(400);
  });

  it('shrinks proportionally rather than escaping the image', () => {
    const r = resizeRect({ x: 700, y: 600, width: 200, height: 200 }, 'se', 5000, 5000, bounds, 1);
    expect(inside(r, bounds)).toBe(true);
    expect(r.width).toBe(r.height);
    expect(r.width).toBe(200); // 800 - 600 is the tighter of the two limits
  });
});

describe('fitAspect', () => {
  it('reshapes around the centre', () => {
    const r = fitAspect({ x: 100, y: 100, width: 400, height: 400 }, 2, bounds);
    expect(r).toEqual({ x: 100, y: 200, width: 400, height: 200 });
  });

  it('shrinks when the new shape will not fit', () => {
    const r = fitAspect({ x: 0, y: 0, width: 1000, height: 800 }, 16 / 9, bounds);
    expect(inside(r, bounds)).toBe(true);
    expect(Math.abs(r.width / r.height - 16 / 9)).toBeLessThan(0.02);
  });
});

describe('centeredRect', () => {
  it('covers most of the image when free', () => {
    const r = centeredRect(bounds, null, 0.9);
    expect(r).toEqual({ x: 50, y: 40, width: 900, height: 720 });
  });

  it('respects a ratio and stays inside', () => {
    const r = centeredRect(bounds, 9 / 16, 0.9);
    expect(inside(r, bounds)).toBe(true);
    expect(Math.abs(r.width / r.height - 9 / 16)).toBeLessThan(0.02);
  });
});

describe('drawRect', () => {
  it('draws down and to the right', () => {
    const r = drawRect({ x: 100, y: 100 }, { x: 300, y: 250 }, bounds, null);
    expect(r).toEqual({ x: 100, y: 100, width: 200, height: 150 });
  });

  it('draws up and to the left from the anchor', () => {
    const r = drawRect({ x: 300, y: 250 }, { x: 100, y: 100 }, bounds, null);
    expect(r).toEqual({ x: 100, y: 100, width: 200, height: 150 });
  });

  it('follows the dominant axis when a ratio is locked', () => {
    const r = drawRect({ x: 0, y: 0 }, { x: 400, y: 10 }, bounds, 1);
    expect(r).toEqual({ x: 0, y: 0, width: 400, height: 400 });
  });

  it('never yields an empty selection from a stray click', () => {
    const r = drawRect({ x: 500, y: 400 }, { x: 500, y: 400 }, bounds, null);
    expect(r.width).toBe(MIN_CROP);
    expect(r.height).toBe(MIN_CROP);
  });
});

describe('rectFromAnchor', () => {
  it('grows both ways when the direction is zero', () => {
    const r = rectFromAnchor({ x: 500, y: 400 }, 0, 0, 200, 100, bounds);
    expect(r).toEqual({ x: 400, y: 350, width: 200, height: 100 });
  });
});

describe('describeRatio', () => {
  it('reduces clean ratios', () => {
    expect(describeRatio({ x: 0, y: 0, width: 1920, height: 1080 })).toBe('16:9');
    expect(describeRatio({ x: 0, y: 0, width: 500, height: 500 })).toBe('1:1');
  });

  it('falls back to a decimal for ratios nobody recognises', () => {
    expect(describeRatio({ x: 0, y: 0, width: 1493, height: 997 })).toBe('1.50 : 1');
  });
});
