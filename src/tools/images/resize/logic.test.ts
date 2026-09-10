import { describe, it, expect } from 'vitest';
import { describeProblem, lockedCounterpart, predictSize, type ResizeSettings } from './logic';

const base: ResizeSettings = {
  mode: 'fit',
  width: 0,
  height: 0,
  percent: 100,
  allowUpscale: false,
};

describe('predictSize', () => {
  it('leaves an image alone when it already fits and upscaling is off', () => {
    const out = predictSize({ width: 800, height: 600 }, { ...base, width: 1920, height: 1080 });
    expect(out).toEqual({ width: 800, height: 600 });
  });

  it('grows an image to the box when upscaling is allowed', () => {
    const out = predictSize(
      { width: 800, height: 600 },
      { ...base, width: 1920, height: 1080, allowUpscale: true },
    );
    // Height is the binding constraint: 1080/600 = 1.8 → 1440 × 1080.
    expect(out).toEqual({ width: 1440, height: 1080 });
  });

  it('honours a width-only box and keeps the aspect ratio', () => {
    const out = predictSize({ width: 4000, height: 3000 }, { ...base, width: 1000 });
    expect(out).toEqual({ width: 1000, height: 750 });
  });

  it('honours a height-only box', () => {
    const out = predictSize({ width: 4000, height: 3000 }, { ...base, height: 600 });
    expect(out).toEqual({ width: 800, height: 600 });
  });

  it('rounds rather than truncates on awkward ratios', () => {
    // 1000/3 = 333.33… must round to 333, not floor from a float error.
    const out = predictSize({ width: 3000, height: 2001 }, { ...base, width: 1000 });
    expect(out).toEqual({ width: 1000, height: 667 });
  });

  it('returns the exact box for fill and exact, aspect be damned', () => {
    const settings = { ...base, width: 1080, height: 1080 };
    expect(predictSize({ width: 4000, height: 3000 }, { ...settings, mode: 'fill' })).toEqual({
      width: 1080,
      height: 1080,
    });
    expect(predictSize({ width: 4000, height: 3000 }, { ...settings, mode: 'exact' })).toEqual({
      width: 1080,
      height: 1080,
    });
  });

  it('scales by percentage independently of the box fields', () => {
    const out = predictSize({ width: 1999, height: 1001 }, { ...base, mode: 'percent', percent: 50 });
    expect(out).toEqual({ width: 1000, height: 501 });
  });

  it('never produces a zero-pixel side', () => {
    const out = predictSize({ width: 10, height: 4 }, { ...base, mode: 'percent', percent: 1 });
    expect(out).toEqual({ width: 1, height: 1 });
  });

  it('passes the source through when nothing was entered', () => {
    expect(predictSize({ width: 640, height: 480 }, base)).toEqual({ width: 640, height: 480 });
  });

  it('protects against a source with no dimensions', () => {
    expect(predictSize({ width: 0, height: 0 }, { ...base, width: 100 })).toEqual({ width: 0, height: 0 });
  });
});

describe('lockedCounterpart', () => {
  it('derives the height from a width', () => {
    expect(lockedCounterpart({ width: 4000, height: 3000 }, 'width', 800)).toBe(600);
  });

  it('derives the width from a height', () => {
    expect(lockedCounterpart({ width: 4000, height: 3000 }, 'height', 600)).toBe(800);
  });

  it('keeps at least one pixel for extreme panoramas', () => {
    expect(lockedCounterpart({ width: 10000, height: 100 }, 'width', 20)).toBe(1);
  });

  it('returns 0 when there is nothing to derive from', () => {
    expect(lockedCounterpart({ width: 0, height: 0 }, 'width', 800)).toBe(0);
    expect(lockedCounterpart({ width: 100, height: 100 }, 'width', 0)).toBe(0);
  });
});

describe('describeProblem', () => {
  it('accepts a single side in fit mode', () => {
    expect(describeProblem({ ...base, width: 1200 })).toBeNull();
    expect(describeProblem({ ...base, height: 1200 })).toBeNull();
    expect(describeProblem(base)).toMatch(/width/i);
  });

  it('demands both sides for fill and exact', () => {
    expect(describeProblem({ ...base, mode: 'fill', width: 1080 })).toMatch(/both/i);
    expect(describeProblem({ ...base, mode: 'exact', width: 1080, height: 1080 })).toBeNull();
  });

  it('demands a positive percentage', () => {
    expect(describeProblem({ ...base, mode: 'percent', percent: 0 })).toMatch(/percentage/i);
    expect(describeProblem({ ...base, mode: 'percent', percent: 25 })).toBeNull();
  });
});
