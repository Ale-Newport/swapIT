// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MAX_SIDE, computeTarget, lengthToPx, prepareSvg, readIntrinsic, type SizeOptions } from './logic';

const sized = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 400 200"><rect width="400" height="200"/></svg>';
const viewBoxOnly = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><rect width="64" height="32"/></svg>';
const percentSized = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect width="10" height="10"/></svg>';
const noSize = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

const opts = (patch: Partial<SizeOptions> = {}): SizeOptions => ({
  mode: 'scale',
  scale: 1,
  width: 512,
  height: 512,
  lockAspect: true,
  ...patch,
});

describe('lengthToPx', () => {
  it('converts physical units', () => {
    expect(lengthToPx('1in')).toBe(96);
    expect(lengthToPx('12pt')).toBeCloseTo(16, 6);
  });

  it('ignores relative units and nonsense', () => {
    expect(lengthToPx('100%')).toBeNull();
    expect(lengthToPx('auto')).toBeNull();
    expect(lengthToPx('0')).toBeNull();
    expect(lengthToPx(null)).toBeNull();
  });
});

describe('readIntrinsic', () => {
  it('prefers the width and height attributes over the viewBox', () => {
    const i = readIntrinsic(sized);
    expect(i.width).toBe(200);
    expect(i.height).toBe(100);
    expect(i.viewBox).toEqual({ minX: 0, minY: 0, width: 400, height: 200 });
    expect(i.ratio).toBe(2);
    expect(i.hasSize).toBe(true);
  });

  it('falls back to the viewBox when there is no width or height', () => {
    const i = readIntrinsic(viewBoxOnly);
    expect(i.width).toBe(64);
    expect(i.height).toBe(32);
    expect(i.hasSize).toBe(true);
  });

  it('treats a percentage size as no size at all, but keeps the viewBox ratio', () => {
    expect(readIntrinsic(percentSized).hasSize).toBe(false);
    expect(readIntrinsic('<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 10 5"/>').ratio).toBe(2);
  });

  it('reports nothing for a file with no size information', () => {
    const i = readIntrinsic(noSize);
    expect(i.hasSize).toBe(false);
    expect(i.ratio).toBeNull();
  });

  it('does not throw on markup that is not an SVG', () => {
    expect(readIntrinsic('not xml at all <').hasSize).toBe(false);
    expect(readIntrinsic('').hasSize).toBe(false);
  });
});

describe('computeTarget', () => {
  it('multiplies the intrinsic size in scale mode', () => {
    expect(computeTarget(readIntrinsic(sized), opts({ scale: 3 }))).toEqual({ ok: true, width: 600, height: 300 });
  });

  it('rounds fractional results to whole pixels', () => {
    expect(computeTarget(readIntrinsic(viewBoxOnly), opts({ scale: 1.5 }))).toEqual({ ok: true, width: 96, height: 48 });
  });

  it('says what to do when there is no size to scale', () => {
    const result = computeTarget(readIntrinsic(noSize), opts({ scale: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Exact size/);
  });

  it('derives the height from the aspect ratio when the lock is on', () => {
    expect(computeTarget(readIntrinsic(sized), opts({ mode: 'exact', width: 1000, height: 1, lockAspect: true }))).toEqual({
      ok: true,
      width: 1000,
      height: 500,
    });
  });

  it('honours both numbers when the lock is off', () => {
    expect(computeTarget(readIntrinsic(sized), opts({ mode: 'exact', width: 300, height: 900, lockAspect: false }))).toEqual({
      ok: true,
      width: 300,
      height: 900,
    });
  });

  it('accepts an exact size even when the file declares none', () => {
    expect(computeTarget(readIntrinsic(noSize), opts({ mode: 'exact', width: 128, height: 64, lockAspect: true }))).toEqual({
      ok: true,
      width: 128,
      height: 64,
    });
  });

  it('rejects sizes the canvas cannot draw', () => {
    expect(computeTarget(readIntrinsic(sized), opts({ mode: 'exact', width: 0, height: 0, lockAspect: false })).ok).toBe(false);
    expect(computeTarget(readIntrinsic(sized), opts({ mode: 'exact', width: MAX_SIDE + 1, height: 10, lockAspect: false })).ok).toBe(false);
    expect(computeTarget(readIntrinsic(sized), opts({ mode: 'exact', width: 11000, height: 11000, lockAspect: false })).ok).toBe(false);
  });
});

describe('prepareSvg', () => {
  it('writes the requested pixel size onto the root element', () => {
    const out = prepareSvg(sized, 800, 400);
    expect(out).toContain('width="800"');
    expect(out).toContain('height="400"');
    expect(out).toContain('viewBox="0 0 400 200"');
  });

  it('adds a viewBox so a fixed-size file actually scales up', () => {
    const out = prepareSvg('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="25"><rect width="50" height="25"/></svg>', 500, 250);
    expect(out).toContain('viewBox="0 0 50 25"');
  });

  it('adds the SVG namespace an <img> needs to render at all', () => {
    const out = prepareSvg('<svg width="10" height="10"><rect width="10" height="10"/></svg>', 20, 20);
    expect(out).toContain('http://www.w3.org/2000/svg');
  });

  it('refuses markup it cannot parse, with a sentence that says why', () => {
    expect(() => prepareSvg('<svg><g></svg>', 10, 10)).toThrow(/not valid XML/);
    expect(() => prepareSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>', 10, 10)).toThrow(/no <svg> root/);
  });
});
