import { describe, expect, it } from 'vitest';
import {
  MIN_SIZE,
  buildOps,
  clampRect,
  drawRect,
  encodingFor,
  evenRect,
  fitAspect,
  isFullFrame,
  largestRect,
  moveRect,
  ratioFor,
  ratioLabel,
  resizeRect,
  type Rect,
} from './logic';

const VW = 1920;
const VH = 1080;
const full: Rect = { x: 0, y: 0, w: VW, h: VH };

describe('clampRect', () => {
  it('slides a rectangle back inside the frame', () => {
    expect(clampRect({ x: -50, y: -20, w: 200, h: 100 }, VW, VH)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(clampRect({ x: 1900, y: 1000, w: 200, h: 200 }, VW, VH)).toEqual({ x: 1720, y: 880, w: 200, h: 200 });
  });

  it('caps a rectangle bigger than the frame', () => {
    const r = clampRect({ x: 0, y: 0, w: 4000, h: 4000 }, VW, VH);
    expect(r.w).toBe(VW);
    expect(r.h).toBe(VH);
  });
});

describe('evenRect', () => {
  it('rounds every value down to an even number', () => {
    const r = evenRect({ x: 11, y: 7, w: 101, h: 55 }, VW, VH);
    expect(r.x % 2).toBe(0);
    expect(r.y % 2).toBe(0);
    expect(r.w % 2).toBe(0);
    expect(r.h % 2).toBe(0);
    expect(r).toEqual({ x: 10, y: 6, w: 100, h: 54 });
  });

  it('keeps the rectangle inside an odd-sized frame', () => {
    const r = evenRect({ x: 0, y: 0, w: 1921, h: 1081 }, 1921, 1081);
    expect(r.x + r.w).toBeLessThanOrEqual(1921);
    expect(r.y + r.h).toBeLessThanOrEqual(1081);
    expect(r.w % 2).toBe(0);
    expect(r.h % 2).toBe(0);
  });
});

describe('aspect helpers', () => {
  it('knows the preset ratios', () => {
    expect(ratioFor('16:9')).toBeCloseTo(16 / 9, 5);
    expect(ratioFor('9:16')).toBeCloseTo(9 / 16, 5);
    expect(ratioFor('free')).toBeNull();
    expect(ratioFor('unknown')).toBeNull();
  });

  it('fits the biggest rectangle of a ratio inside the frame', () => {
    const r = largestRect(VW, VH, 1);
    expect(r.w).toBe(VH);
    expect(r.h).toBe(VH);
    expect(r.x).toBe((VW - VH) / 2);
    const wide = largestRect(1080, 1920, 16 / 9);
    expect(wide.w).toBe(1080);
    expect(wide.h).toBeCloseTo(1080 / (16 / 9), 5);
  });

  it('reshapes a rectangle around its centre', () => {
    const r = fitAspect({ x: 400, y: 200, w: 800, h: 800 }, 16 / 9, VW, VH);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 5);
    expect(r.x + r.w / 2).toBeCloseTo(800, 5);
    expect(r.y + r.h / 2).toBeCloseTo(600, 5);
  });

  it('names the ratio of a rectangle', () => {
    expect(ratioLabel({ x: 0, y: 0, w: 1920, h: 1080 })).toBe('16:9');
    expect(ratioLabel({ x: 0, y: 0, w: 500, h: 500 })).toBe('1:1');
  });
});

describe('resizeRect', () => {
  it('drags a corner freely without a ratio', () => {
    const r = resizeRect(full, 'se', -920, -80, VW, VH, null);
    expect(r).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
  });

  it('keeps the opposite corner pinned when a ratio is locked', () => {
    const base: Rect = { x: 400, y: 200, w: 800, h: 450 };
    const r = resizeRect(base, 'nw', -200, -200, VW, VH, 16 / 9);
    expect(r.x + r.w).toBeCloseTo(1200, 5);
    expect(r.y + r.h).toBeCloseTo(650, 5);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 5);
  });

  it('grows an edge around the centre of the other axis', () => {
    const base: Rect = { x: 400, y: 300, w: 400, h: 400 };
    const r = resizeRect(base, 's', 100, 100, VW, VH, 1);
    expect(r.w).toBeCloseTo(r.h, 5);
    expect(r.x + r.w / 2).toBeCloseTo(600, 5);
  });

  it('never escapes the frame or collapses below the minimum', () => {
    const r = resizeRect(full, 'se', 5000, 5000, VW, VH, null);
    expect(r.w).toBe(VW);
    expect(r.h).toBe(VH);
    const tiny = resizeRect(full, 'nw', 5000, 5000, VW, VH, null);
    expect(tiny.w).toBeGreaterThanOrEqual(MIN_SIZE);
    expect(tiny.h).toBeGreaterThanOrEqual(MIN_SIZE);
    expect(tiny.x + tiny.w).toBeLessThanOrEqual(VW);
  });

  it('holds the ratio even when the drag runs off the edge', () => {
    const r = resizeRect({ x: 1600, y: 900, w: 200, h: 100 }, 'se', 5000, 5000, VW, VH, 16 / 9);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 4);
    expect(r.x + r.w).toBeLessThanOrEqual(VW + 0.001);
    expect(r.y + r.h).toBeLessThanOrEqual(VH + 0.001);
  });
});

describe('moveRect', () => {
  it('slides without resizing and stops at the edges', () => {
    const base: Rect = { x: 100, y: 100, w: 400, h: 300 };
    expect(moveRect(base, 50, -50, VW, VH)).toEqual({ x: 150, y: 50, w: 400, h: 300 });
    const pinned = moveRect(base, 9000, 9000, VW, VH);
    expect(pinned.w).toBe(400);
    expect(pinned.x).toBe(VW - 400);
    expect(pinned.y).toBe(VH - 300);
  });
});

describe('drawRect', () => {
  it('draws in any direction from the anchor', () => {
    const a = drawRect(1000, 600, 600, 300, null, VW, VH);
    expect(a).toEqual({ x: 600, y: 300, w: 400, h: 300 });
  });

  it('applies the locked ratio while drawing', () => {
    const r = drawRect(100, 100, 900, 800, 1, VW, VH);
    expect(r.w).toBeCloseTo(r.h, 5);
    expect(r.x).toBe(100);
  });
});

describe('encodingFor', () => {
  it('names H.264 so -crf and -preset are not dropped on the way through', () => {
    // FFmpeg would default an .avi to mpeg4, which takes neither flag.
    expect(encodingFor('avi')).toEqual({ videoCodec: 'libx264', format: undefined, supportsPreset: true });
    expect(encodingFor('.MOV').format).toBeUndefined();
  });

  it('re-wraps containers that cannot hold H.264', () => {
    for (const ext of ['wmv', 'mpg', 'mpeg']) {
      expect(encodingFor(ext).format).toBe('mp4');
    }
  });

  it('keeps WebM on VP9, where there is no speed preset', () => {
    expect(encodingFor('webm')).toEqual({
      videoCodec: 'libvpx-vp9',
      videoBitrate: '0',
      supportsPreset: false,
    });
  });

  it('asks for nothing special before a file is added', () => {
    expect(encodingFor('').format).toBeUndefined();
  });
});

describe('buildOps', () => {
  it('sends an even [x, y, w, h] plus the encoder settings', () => {
    const ops = buildOps({ x: 11, y: 7, w: 641, h: 361 }, VW, VH, {
      crf: 20,
      preset: 'medium',
      encoding: encodingFor('mp4'),
    });
    expect(ops.crop).toEqual([10, 6, 640, 360]);
    expect(ops.crf).toBe(20);
    expect(ops.preset).toBe('medium');
    expect(ops.videoCodec).toBe('libx264');
    expect(ops.format).toBeUndefined();
  });

  it('carries the container swap and drops the preset VP9 would ignore', () => {
    const rect: Rect = { x: 0, y: 0, w: 640, h: 360 };
    const mpg = buildOps(rect, VW, VH, { crf: 20, preset: 'slow', encoding: encodingFor('mpg') });
    expect(mpg.format).toBe('mp4');
    expect(mpg.preset).toBe('slow');

    const webm = buildOps(rect, VW, VH, { crf: 20, preset: 'slow', encoding: encodingFor('webm') });
    expect(webm.videoCodec).toBe('libvpx-vp9');
    expect(webm.videoBitrate).toBe('0');
    expect(webm.preset).toBeUndefined();
    expect(webm.format).toBeUndefined();
  });
});

describe('isFullFrame', () => {
  it('spots a crop that would do nothing', () => {
    expect(isFullFrame(full, VW, VH)).toBe(true);
    expect(isFullFrame({ x: 0, y: 0, w: VW - 100, h: VH }, VW, VH)).toBe(false);
  });
});
