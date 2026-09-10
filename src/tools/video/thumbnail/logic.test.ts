import { describe, it, expect } from 'vitest';
import { clampTimestamp, markPositions, parseTimestamp, scrubStep } from './logic';

describe('parseTimestamp', () => {
  it('treats an empty field as the first frame', () => {
    expect(parseTimestamp('', 60)).toEqual({ seconds: 0, error: null });
  });

  it('parses seconds and timecodes', () => {
    expect(parseTimestamp('7.5', 60).seconds).toBe(7.5);
    expect(parseTimestamp('1:07', 600).seconds).toBe(67);
    expect(parseTimestamp('0:01:07', 600).seconds).toBe(67);
  });

  it('rejects nonsense', () => {
    expect(parseTimestamp('the good bit', 60).error).toMatch(/not a time/);
    expect(parseTimestamp('the good bit', 60).seconds).toBeNull();
  });

  it('rejects a time past the end when the length is known', () => {
    expect(parseTimestamp('1:30', 60).error).toMatch(/past the end/);
  });

  it('accepts any time when the length is unknown', () => {
    expect(parseTimestamp('99:00', null).seconds).toBe(5940);
  });
});

describe('clampTimestamp', () => {
  it('keeps a frame of room at the end', () => {
    expect(clampTimestamp(60, 60)).toBeCloseTo(59.95);
  });
  it('floors negatives at zero', () => {
    expect(clampTimestamp(-3, 60)).toBe(0);
  });
  it('passes the value through when the length is unknown', () => {
    expect(clampTimestamp(120, null)).toBe(120);
  });
  it('never returns a negative for a very short video', () => {
    expect(clampTimestamp(1, 0.02)).toBe(0);
  });
});

describe('scrubStep', () => {
  it('steps one frame when the frame rate is known', () => {
    expect(scrubStep(60, 25)).toBe(0.04);
    expect(scrubStep(60, 29.97)).toBe(0.033);
  });
  it('falls back to coarser steps for long videos', () => {
    expect(scrubStep(7200, null)).toBe(1);
    expect(scrubStep(600, null)).toBe(0.5);
    expect(scrubStep(30, null)).toBe(0.1);
    expect(scrubStep(null, null)).toBe(0.1);
  });
  it('ignores an absurd frame rate', () => {
    expect(scrubStep(30, 100000)).toBe(0.1);
  });
});

describe('markPositions', () => {
  it('is empty without a duration', () => {
    expect(markPositions(null)).toEqual([]);
    expect(markPositions(0)).toEqual([]);
  });
  it('spreads marks across the video and keeps them inside it', () => {
    const marks = markPositions(100);
    expect(marks.map((m) => m.label)).toEqual(['Start', '10%', '25%', '50%', '75%']);
    expect(marks[0].seconds).toBe(0);
    expect(marks[4].seconds).toBe(75);
    expect(marks.every((m) => m.seconds < 100)).toBe(true);
  });
});
