import { describe, expect, it } from 'vitest';
import { MIN_CLIP, buildOps, clipLength, moveHandle, parseTimeField } from './logic';

const full = { start: 0, end: 60 };

describe('moveHandle', () => {
  it('moves a handle to the requested time', () => {
    expect(moveHandle(full, 'start', 12, 60)).toEqual({ start: 12, end: 60 });
    expect(moveHandle(full, 'end', 42, 60)).toEqual({ start: 0, end: 42 });
  });

  it('never lets the handles cross', () => {
    const r = moveHandle(full, 'start', 90, 60);
    expect(r.start).toBeCloseTo(60 - MIN_CLIP, 5);
    expect(r.end).toBe(60);
    const r2 = moveHandle({ start: 30, end: 60 }, 'end', 5, 60);
    expect(r2.end).toBeCloseTo(30 + MIN_CLIP, 5);
    expect(r2.start).toBe(30);
  });

  it('stays inside the clip', () => {
    expect(moveHandle(full, 'start', -20, 60).start).toBe(0);
    expect(moveHandle(full, 'end', 900, 60).end).toBe(60);
  });

  it('survives a zero-length clip without producing NaN', () => {
    const r = moveHandle({ start: 0, end: 0 }, 'end', 5, 0);
    expect(Number.isFinite(r.start)).toBe(true);
    expect(Number.isFinite(r.end)).toBe(true);
  });
});

describe('parseTimeField', () => {
  it('accepts the formats a person would type', () => {
    expect(parseTimeField('12', 600)).toBe(12);
    expect(parseTimeField('1:23', 600)).toBe(83);
    expect(parseTimeField('00:01:30', 600)).toBe(90);
    expect(parseTimeField('1m20s', 600)).toBe(80);
    expect(parseTimeField('2.5', 600)).toBe(2.5);
  });

  it('clamps beyond the end of the video', () => {
    expect(parseTimeField('99:00', 60)).toBe(60);
  });

  it('rejects nonsense so the field can snap back', () => {
    expect(parseTimeField('', 60)).toBeNull();
    expect(parseTimeField('later', 60)).toBeNull();
    expect(parseTimeField('-5', 60)).toBeNull();
  });
});

describe('buildOps', () => {
  it('omits start at zero and end at the full length', () => {
    expect(buildOps({ start: 0, end: 60 }, 60, { copyStreams: true, crf: 20, preset: 'medium' })).toEqual({
      start: undefined,
      end: undefined,
      copyStreams: true,
    });
  });

  it('sends both bounds for an inner clip', () => {
    const ops = buildOps({ start: 5.5, end: 20.25 }, 60, { copyStreams: true, crf: 20, preset: 'medium' });
    expect(ops.start).toBe(5.5);
    expect(ops.end).toBe(20.25);
  });

  it('rounds to milliseconds rather than sending float noise', () => {
    const ops = buildOps({ start: 1 / 3, end: 2 / 3 }, 60, { copyStreams: true, crf: 20, preset: 'medium' });
    expect(ops.start).toBe(0.333);
    expect(ops.end).toBe(0.667);
  });

  it('swaps stream copying for encoder settings when asked for a frame-exact cut', () => {
    const ops = buildOps({ start: 1, end: 2 }, 60, { copyStreams: false, crf: 18, preset: 'slow' });
    expect(ops.copyStreams).toBeUndefined();
    expect(ops.crf).toBe(18);
    expect(ops.preset).toBe('slow');
  });
});

describe('clipLength', () => {
  it('is the distance between the handles and never negative', () => {
    expect(clipLength({ start: 5, end: 12 })).toBe(7);
    expect(clipLength({ start: 12, end: 5 })).toBe(0);
  });
});
