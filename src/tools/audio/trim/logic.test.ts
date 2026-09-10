import { describe, expect, it } from 'vitest';
import {
  MIN_CLIP_SECONDS,
  buildTrimOps,
  clampEnd,
  clampStart,
  computePeaks,
  isWholeFile,
} from './logic';

describe('computePeaks', () => {
  it('returns nothing for a zero-bar request', () => {
    expect(computePeaks(new Float32Array([1, -1]), 0)).toHaveLength(0);
  });

  it('returns silence for an empty buffer instead of throwing', () => {
    const peaks = computePeaks(new Float32Array(0), 4);
    expect(Array.from(peaks)).toEqual([0, 0, 0, 0]);
  });

  it('takes the largest magnitude in each bucket, ignoring sign', () => {
    const peaks = computePeaks(new Float32Array([0.1, -0.9, 0.2, 0.3]), 2);
    expect(peaks[0]).toBeCloseTo(0.9, 5);
    expect(peaks[1]).toBeCloseTo(0.3, 5);
  });

  it('still fills every bar when there are fewer samples than bars', () => {
    const peaks = computePeaks(new Float32Array([0.5, 0.25]), 6);
    expect(peaks).toHaveLength(6);
    expect(Array.from(peaks).every((v) => v > 0)).toBe(true);
  });
});

describe('clampStart', () => {
  it('keeps a clip’s width between the handles', () => {
    expect(clampStart(9.99, 10, 30)).toBeCloseTo(10 - MIN_CLIP_SECONDS, 5);
  });

  it('never goes negative when dragged past the left edge', () => {
    expect(clampStart(-4, 10, 30)).toBe(0);
  });

  it('returns zero for a file whose length is not known yet', () => {
    expect(clampStart(5, 10, 0)).toBe(0);
  });
});

describe('clampEnd', () => {
  it('never runs past the end of the file', () => {
    expect(clampEnd(99, 5, 30)).toBe(30);
  });

  it('stays a clip’s width after the start', () => {
    expect(clampEnd(5, 5, 30)).toBeCloseTo(5 + MIN_CLIP_SECONDS, 5);
  });

  it('cannot exceed the duration even when the start is at the very end', () => {
    expect(clampEnd(0, 30, 30)).toBe(30);
  });
});

describe('isWholeFile', () => {
  it('recognises an untouched range', () => {
    expect(isWholeFile(0, 30, 30)).toBe(true);
  });

  it('recognises a real cut at either end', () => {
    expect(isWholeFile(0.5, 30, 30)).toBe(false);
    expect(isWholeFile(0, 29, 30)).toBe(false);
  });
});

describe('buildTrimOps', () => {
  it('asks for a stream copy by default and omits a zero start', () => {
    expect(buildTrimOps(0, 12.5, false)).toEqual({ audioOnly: true, end: 12.5, copyStreams: true });
  });

  it('sends the start once it is past the beginning', () => {
    expect(buildTrimOps(3, 12.5, false)).toMatchObject({ start: 3, end: 12.5 });
  });

  it('drops the copy flag when re-encoding, so the filters can run', () => {
    expect(buildTrimOps(3, 12.5, true)).toEqual({ audioOnly: true, start: 3, end: 12.5 });
  });
});
