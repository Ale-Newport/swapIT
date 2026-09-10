import { describe, it, expect } from 'vitest';
import {
  applyViewBox,
  describeCoverage,
  expandViewBox,
  findRootTag,
  formatViewBox,
  inflate,
  isValidViewBox,
  parseViewBox,
  readViewBox,
  sameViewBox,
  setAttribute,
  stripSize,
  unionViewBox,
} from './logic';

const DOC = `<?xml version="1.0"?>
<!-- <svg> in a comment must not win -->
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24" viewBox="-2 -2 24 12">
  <path d="M0 0h20v8H0z"/>
</svg>`;

describe('findRootTag', () => {
  it('finds the real root, not the one inside a comment', () => {
    expect(findRootTag(DOC)?.text).toContain('xmlns=');
  });
});

describe('parseViewBox', () => {
  it('accepts commas, extra whitespace and negative origins', () => {
    expect(parseViewBox(' -2 , -2 , 24 , 12 ')).toEqual({ minX: -2, minY: -2, width: 24, height: 12 });
  });

  it('rejects a frame with no area or the wrong number of values', () => {
    expect(parseViewBox('0 0 -5 5')).toBeNull();
    expect(parseViewBox('0 0 5')).toBeNull();
    expect(parseViewBox('a b c d')).toBeNull();
    expect(parseViewBox(null)).toBeNull();
  });
});

describe('readViewBox', () => {
  it('reads the declared frame and the intrinsic fallback', () => {
    expect(readViewBox(DOC)).toEqual({
      declared: { minX: -2, minY: -2, width: 24, height: 12 },
      intrinsic: { minX: 0, minY: 0, width: 48, height: 24 },
    });
  });

  it('has no intrinsic frame when the size is a percentage', () => {
    expect(readViewBox('<svg width="100%" height="100%"></svg>')?.intrinsic).toBeNull();
  });

  it('returns null when the file has no svg root', () => {
    expect(readViewBox('not markup at all')).toBeNull();
  });
});

describe('applyViewBox', () => {
  it('replaces the existing viewBox and nothing else', () => {
    const out = applyViewBox(DOC, { minX: 0, minY: 0, width: 20, height: 8 });
    expect(out).toContain('viewBox="0 0 20 8"');
    expect(out).toContain('width="48" height="24"');
    expect(out).toContain('<path d="M0 0h20v8H0z"/>');
  });

  it('adds a viewBox to a file that has none', () => {
    expect(applyViewBox('<svg width="10" height="10"><g/></svg>', { minX: 0, minY: 0, width: 10, height: 10 })).toBe(
      '<svg width="10" height="10" viewBox="0 0 10 10"><g/></svg>',
    );
  });

  it('rounds to three decimals so getBBox noise does not end up in the file', () => {
    expect(formatViewBox({ minX: 0.123456, minY: -0.5, width: 10.000001, height: 3.14159 })).toBe('0.123 -0.5 10 3.142');
  });

  it('appends to a self-closing root', () => {
    expect(setAttribute('<svg />', 'viewBox', '0 0 1 1')).toBe('<svg viewBox="0 0 1 1"/>');
  });
});

describe('stripSize', () => {
  it('removes width and height for the preview only', () => {
    const out = stripSize(DOC);
    expect(out).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 24 12">');
  });
});

describe('frame arithmetic', () => {
  const box = { minX: 0, minY: 0, width: 10, height: 20 };

  it('pads on all four sides', () => {
    expect(expandViewBox(box, 2)).toEqual({ minX: -2, minY: -2, width: 14, height: 24 });
  });

  it('shrinks with a negative padding', () => {
    expect(expandViewBox(box, -1)).toEqual({ minX: 1, minY: 1, width: 8, height: 18 });
  });

  it('refuses a padding that would collapse the frame', () => {
    expect(expandViewBox(box, -5)).toEqual(box);
  });

  it('unions two frames', () => {
    expect(unionViewBox(box, { minX: -5, minY: 10, width: 5, height: 30 })).toEqual({
      minX: -5,
      minY: 0,
      width: 15,
      height: 40,
    });
  });

  it('inflates about the centre', () => {
    expect(inflate(box, 0.1)).toEqual({ minX: -0.5, minY: -1, width: 11, height: 22 });
  });

  it('validates', () => {
    expect(isValidViewBox(box)).toBe(true);
    expect(isValidViewBox({ ...box, width: 0 })).toBe(false);
    expect(isValidViewBox({ ...box, minX: Number.NaN })).toBe(false);
  });

  it('compares with the same rounding the file uses', () => {
    expect(sameViewBox(box, { ...box, width: 10.0001 })).toBe(true);
    expect(sameViewBox(box, { ...box, width: 10.01 })).toBe(false);
    expect(sameViewBox(null, box)).toBe(false);
  });
});

describe('describeCoverage', () => {
  const content = { minX: 0, minY: 0, width: 10, height: 10 };

  it('says when everything fits', () => {
    expect(describeCoverage({ minX: -1, minY: -1, width: 12, height: 12 }, content)).toMatch(/fits inside/);
  });

  it('warns when the frame crops the drawing', () => {
    expect(describeCoverage({ minX: 2, minY: 0, width: 5, height: 10 }, content)).toMatch(/cut off/);
  });
});
