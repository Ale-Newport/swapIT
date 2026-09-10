import { describe, expect, it } from 'vitest';
import { estimateFrameBuffer, HEAVY_SECONDS, reverseRisk, riskAdvice, riskHeadline } from './logic';

describe('reverseRisk', () => {
  it('grades by clip length', () => {
    expect(reverseRisk(5)).toBe('quick');
    expect(reverseRisk(30)).toBe('quick');
    expect(reverseRisk(31)).toBe('slow');
    expect(reverseRisk(HEAVY_SECONDS)).toBe('slow');
    expect(reverseRisk(HEAVY_SECONDS + 1)).toBe('heavy');
  });

  it('reports unknown for missing or impossible durations', () => {
    expect(reverseRisk(null)).toBe('unknown');
    expect(reverseRisk(undefined)).toBe('unknown');
    expect(reverseRisk(0)).toBe('unknown');
    expect(reverseRisk(-4)).toBe('unknown');
    expect(reverseRisk(Number.NaN)).toBe('unknown');
  });
});

describe('estimateFrameBuffer', () => {
  it('multiplies frame size by the frame count', () => {
    // 1920×1080 yuv420p = 3110400 bytes per frame, 30 fps for 10 s = 300 frames.
    expect(estimateFrameBuffer(1920, 1080, 30, 10)).toBe(1920 * 1080 * 1.5 * 300);
  });

  it('scales linearly with duration', () => {
    const short = estimateFrameBuffer(1280, 720, 25, 4)!;
    const long = estimateFrameBuffer(1280, 720, 25, 8)!;
    expect(long).toBe(short * 2);
  });

  it('gives up when any dimension is missing or zero', () => {
    expect(estimateFrameBuffer(null, 1080, 30, 10)).toBeNull();
    expect(estimateFrameBuffer(1920, undefined, 30, 10)).toBeNull();
    expect(estimateFrameBuffer(1920, 1080, 0, 10)).toBeNull();
    expect(estimateFrameBuffer(1920, 1080, 30, 0)).toBeNull();
    expect(estimateFrameBuffer(1920, 1080, Number.NaN, 10)).toBeNull();
  });
});

describe('risk copy', () => {
  it('always has a headline and advice for every grade', () => {
    for (const risk of ['quick', 'slow', 'heavy', 'unknown'] as const) {
      expect(riskHeadline(risk, 300).length).toBeGreaterThan(0);
      expect(riskAdvice(risk).length).toBeGreaterThan(0);
    }
  });

  it('names the length in minutes when the clip is heavy', () => {
    expect(riskHeadline('heavy', 300)).toContain('5 minutes');
  });
});
