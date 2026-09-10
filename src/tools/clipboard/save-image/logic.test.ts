import { describe, it, expect } from 'vitest';
import { MAX_WIDTH, MIN_WIDTH, megapixels, scaledSize, suggestImageName } from './logic';

describe('scaledSize', () => {
  it('keeps the aspect ratio', () => {
    expect(scaledSize({ width: 2000, height: 1000 }, 800)).toEqual({ width: 800, height: 400 });
  });

  it('rounds to whole pixels', () => {
    expect(scaledSize({ width: 1000, height: 333 }, 300)).toEqual({ width: 300, height: 100 });
    expect(scaledSize({ width: 1024, height: 768 }, 500)).toEqual({ width: 500, height: 375 });
  });

  it('never collapses a very wide, very short image', () => {
    expect(scaledSize({ width: 4000, height: 3 }, MIN_WIDTH).height).toBe(1);
  });

  it('clamps the requested width to the supported range', () => {
    expect(scaledSize({ width: 1000, height: 500 }, 2).width).toBe(MIN_WIDTH);
    expect(scaledSize({ width: 1000, height: 500 }, 99_999).width).toBe(MAX_WIDTH);
  });

  it('returns the original size when no target is set', () => {
    const size = { width: 640, height: 480 };
    expect(scaledSize(size, null)).toBe(size);
    expect(scaledSize(size, 0)).toBe(size);
  });

  it('does not divide by zero for an empty image', () => {
    expect(scaledSize({ width: 0, height: 0 }, 500)).toEqual({ width: 0, height: 0 });
  });
});

describe('megapixels', () => {
  it('reports the pixel count in millions', () => {
    expect(megapixels({ width: 2000, height: 1000 })).toBe(2);
  });
});

describe('suggestImageName', () => {
  it('pads every part of the timestamp', () => {
    expect(suggestImageName(new Date(2026, 8, 5, 4, 7, 9), 'png')).toBe(
      'Clipboard 2026-09-05 at 04.07.09.png',
    );
  });

  it('uses the chosen extension', () => {
    expect(suggestImageName(new Date(2026, 11, 31, 23, 59, 59), 'jpg')).toBe(
      'Clipboard 2026-12-31 at 23.59.59.jpg',
    );
  });
});
