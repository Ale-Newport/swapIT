import { describe, expect, it } from 'vitest';
import {
  aspectDims,
  buildOps,
  canAvoidUpscaling,
  capHeightFilter,
  capWidthFilter,
  distortion,
  evenDim,
  matchResolution,
  parseDim,
  predict,
  resolutionDims,
} from './logic';

const landscape = { w: 1920, h: 1080 };
const portrait = { w: 1080, h: 1920 };

describe('evenDim', () => {
  it('rounds down to even and never below 2', () => {
    expect(evenDim(721)).toBe(720);
    expect(evenDim(720)).toBe(720);
    expect(evenDim(1)).toBe(2);
    expect(evenDim(0)).toBe(2);
  });
});

describe('resolutionDims', () => {
  it('applies the number to the height of landscape footage', () => {
    expect(resolutionDims(720, landscape)).toEqual({ width: null, height: 720 });
  });

  it('applies it to the width of portrait footage so 720p stays 720p', () => {
    expect(resolutionDims(720, portrait)).toEqual({ width: 720, height: null });
  });

  it('assumes landscape when nothing has been probed yet', () => {
    expect(resolutionDims(1080, null)).toEqual({ width: null, height: 1080 });
  });
});

describe('aspectDims', () => {
  it('keeps the longer side of the source', () => {
    expect(aspectDims(1, landscape)).toEqual({ width: 1920, height: 1920 });
    expect(aspectDims(16 / 9, portrait)).toEqual({ width: 1920, height: 1080 });
    expect(aspectDims(9 / 16, landscape)).toEqual({ width: 1080, height: 1920 });
  });

  it('always returns even numbers', () => {
    const d = aspectDims(4 / 5, { w: 1001, h: 733 });
    expect(d.width! % 2).toBe(0);
    expect(d.height! % 2).toBe(0);
  });
});

describe('predict', () => {
  it('derives the missing side from the source ratio', () => {
    expect(predict({ width: null, height: 720 }, landscape, false)).toEqual({ w: 1280, h: 720 });
    expect(predict({ width: 640, height: null }, landscape, false)).toEqual({ w: 640, h: 360 });
  });

  it('honours the never-enlarge cap', () => {
    expect(predict({ width: null, height: 2160 }, landscape, true)).toEqual({ w: 1920, h: 1080 });
    expect(predict({ width: null, height: 2160 }, landscape, false)).toEqual({ w: 3840, h: 2160 });
  });

  it('uses both sides verbatim when both are pinned', () => {
    expect(predict({ width: 1000, height: 1000 }, landscape, true)).toEqual({ w: 1000, h: 1000 });
  });

  it('returns nothing without a source or a target', () => {
    expect(predict({ width: 720, height: null }, null, false)).toBeNull();
    expect(predict({ width: null, height: null }, landscape, false)).toBeNull();
  });
});

describe('buildOps', () => {
  it('sends plain dimensions when upscaling is allowed', () => {
    const ops = buildOps({ width: null, height: 720 }, { noUpscale: false, crf: 21, preset: 'medium' });
    expect(ops.height).toBe(720);
    expect(ops.width).toBeUndefined();
    expect(ops.extraFilters).toBeUndefined();
    expect(ops.crf).toBe(21);
  });

  it('switches to a capped scale filter when told not to enlarge', () => {
    const ops = buildOps({ width: null, height: 720 }, { noUpscale: true, crf: 21, preset: 'fast' });
    expect(ops.extraFilters).toEqual([capHeightFilter(720)]);
    expect(ops.height).toBeUndefined();
    expect(ops.width).toBeUndefined();
  });

  it('caps the width when the width is the pinned side', () => {
    const ops = buildOps({ width: 1280, height: null }, { noUpscale: true, crf: 21, preset: 'fast' });
    expect(ops.extraFilters).toEqual([capWidthFilter(1280)]);
  });

  it('ignores the cap when both sides are pinned, since it cannot be expressed', () => {
    const ops = buildOps({ width: 1280, height: 720 }, { noUpscale: true, crf: 21, preset: 'fast' });
    expect(ops.extraFilters).toBeUndefined();
    expect(ops.width).toBe(1280);
    expect(ops.height).toBe(720);
  });

  it('rounds odd requests to even before they reach FFmpeg', () => {
    const ops = buildOps({ width: 1281, height: 721 }, { noUpscale: false, crf: 21, preset: 'fast' });
    expect(ops.width).toBe(1280);
    expect(ops.height).toBe(720);
  });
});

describe('filters', () => {
  it('build scale expressions that never upscale', () => {
    expect(capHeightFilter(720)).toBe("scale=-2:'trunc(min(ih,720)/2)*2':flags=lanczos");
    expect(capWidthFilter(1280)).toBe("scale='trunc(min(iw,1280)/2)*2':-2:flags=lanczos");
  });
});

describe('parseDim', () => {
  it('treats blank as auto and rejects nonsense', () => {
    expect(parseDim('')).toBeNull();
    expect(parseDim('   ')).toBeNull();
    expect(parseDim('abc')).toBeNull();
    expect(parseDim('0')).toBeNull();
    expect(parseDim('-100')).toBeNull();
  });

  it('rounds and caps absurd values', () => {
    expect(parseDim('720')).toBe(720);
    expect(parseDim('720.6')).toBe(721);
    expect(parseDim('99999')).toBe(16384);
  });
});

describe('helpers', () => {
  it('spots when the target changes the shape of the picture', () => {
    expect(distortion({ width: 1280, height: 720 }, landscape)).toBeCloseTo(0, 5);
    expect(distortion({ width: 1080, height: 1080 }, landscape)).toBeGreaterThan(0.4);
    expect(distortion({ width: null, height: 720 }, landscape)).toBe(0);
  });

  it('only offers the cap while one side is free', () => {
    expect(canAvoidUpscaling({ width: null, height: 720 })).toBe(true);
    expect(canAvoidUpscaling({ width: 1280, height: 720 })).toBe(false);
    expect(canAvoidUpscaling({ width: null, height: null })).toBe(false);
  });

  it('highlights the preset that is currently in effect', () => {
    expect(matchResolution({ width: null, height: 720 }, landscape)).toBe(720);
    expect(matchResolution({ width: 720, height: null }, portrait)).toBe(720);
    expect(matchResolution({ width: 1234, height: null }, landscape)).toBeNull();
  });
});
