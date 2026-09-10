import { describe, expect, it } from 'vitest';
import {
  cssTransform,
  fitScale,
  isIdentity,
  isQuarterTurn,
  orientationLabel,
  previewTimestamp,
  resultDimensions,
} from './logic';

describe('cssTransform', () => {
  it('is none when nothing is applied', () => {
    expect(cssTransform({ rotate: 0, flipH: false, flipV: false })).toBe('none');
  });

  it('writes flips before the rotate so the picture matches the filter order', () => {
    // FFmpeg runs transpose then hflip, so the flip must be the outer transform.
    expect(cssTransform({ rotate: 90, flipH: true, flipV: false })).toBe('scaleX(-1) rotate(90deg)');
    expect(cssTransform({ rotate: 270, flipH: true, flipV: true })).toBe(
      'scaleX(-1) scaleY(-1) rotate(270deg)',
    );
  });

  it('handles a lone rotation and a lone flip', () => {
    expect(cssTransform({ rotate: 180, flipH: false, flipV: false })).toBe('rotate(180deg)');
    expect(cssTransform({ rotate: 0, flipH: false, flipV: true })).toBe('scaleY(-1)');
  });
});

describe('resultDimensions', () => {
  it('swaps width and height on a quarter turn only', () => {
    expect(resultDimensions(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(resultDimensions(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
    expect(resultDimensions(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    expect(resultDimensions(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
  });

  it('returns null without usable dimensions', () => {
    expect(resultDimensions(null, 1080, 90)).toBeNull();
    expect(resultDimensions(1920, 0, 90)).toBeNull();
    expect(resultDimensions(Number.NaN, 1080, 0)).toBeNull();
  });
});

describe('fitScale', () => {
  const box = { width: 400, height: 300 };

  it('fits a landscape frame by its width', () => {
    expect(fitScale({ width: 800, height: 600 }, box, false)).toBeCloseTo(0.5, 6);
  });

  it('fits by the swapped axis once rotated a quarter turn', () => {
    // Rotated, the 800×600 frame occupies 600×800: box.w/600 vs box.h/800.
    expect(fitScale({ width: 800, height: 600 }, box, true)).toBeCloseTo(300 / 800, 6);
  });

  it('never upscales past the natural size', () => {
    expect(fitScale({ width: 100, height: 80 }, box, false)).toBe(1);
  });

  it('returns null before the box has been measured', () => {
    expect(fitScale({ width: 800, height: 600 }, { width: 0, height: 0 }, false)).toBeNull();
    expect(fitScale({ width: 0, height: 0 }, box, false)).toBeNull();
  });
});

describe('orientationLabel', () => {
  it('names each transform in the order it is applied', () => {
    expect(orientationLabel({ rotate: 0, flipH: false, flipV: false })).toBe('Unchanged');
    expect(orientationLabel({ rotate: 90, flipH: false, flipV: false })).toBe('90° clockwise');
    expect(orientationLabel({ rotate: 270, flipH: true, flipV: false })).toBe(
      '90° counter-clockwise, mirrored horizontally',
    );
    expect(orientationLabel({ rotate: 0, flipH: true, flipV: true })).toBe(
      'Mirrored horizontally, mirrored vertically',
    );
  });
});

describe('isIdentity / isQuarterTurn', () => {
  it('recognises a no-op', () => {
    expect(isIdentity({ rotate: 0, flipH: false, flipV: false })).toBe(true);
    expect(isIdentity({ rotate: 0, flipH: true, flipV: false })).toBe(false);
    expect(isIdentity({ rotate: 180, flipH: false, flipV: false })).toBe(false);
  });

  it('knows which rotations swap the axes', () => {
    expect(isQuarterTurn(90)).toBe(true);
    expect(isQuarterTurn(270)).toBe(true);
    expect(isQuarterTurn(180)).toBe(false);
    expect(isQuarterTurn(0)).toBe(false);
  });
});

describe('previewTimestamp', () => {
  it('takes the midpoint of short clips and caps at three seconds', () => {
    expect(previewTimestamp(4)).toBe(2);
    expect(previewTimestamp(600)).toBe(3);
  });

  it('falls back to the first frame when the duration is unknown', () => {
    expect(previewTimestamp(null)).toBe(0);
    expect(previewTimestamp(0)).toBe(0);
    expect(previewTimestamp(Number.NaN)).toBe(0);
  });
});
