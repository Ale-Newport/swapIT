import { describe, it, expect } from 'vitest';
import { estimateFrames, rangeDuration, resolveRange } from './logic';

describe('resolveRange', () => {
  it('defaults to the whole video', () => {
    const r = resolveRange('', '', 12);
    expect(r).toMatchObject({ start: 0, duration: null, effective: 12 });
  });

  it('parses timecodes', () => {
    expect(resolveRange('2:05', '0:30', null).start).toBe(125);
    expect(resolveRange('2:05', '0:30', null).duration).toBe(30);
  });

  it('reports an unreadable start time', () => {
    expect(resolveRange('half way', '', 60).startError).toMatch(/not a time/);
  });

  it('reports a start past the end', () => {
    expect(resolveRange('2:00', '', 60).startError).toMatch(/past the end/);
  });

  it('clamps the effective length to the footage that remains', () => {
    expect(resolveRange('0:50', '0:30', 60).effective).toBe(10);
  });

  it('rejects a non-positive length', () => {
    expect(resolveRange('', '0', 60).durationError).toMatch(/more than zero/);
    // parseTimecode never yields a negative, so "-4" reads as unparseable.
    expect(resolveRange('', '-4', 60).durationError).toMatch(/not a length/);
  });
});

describe('estimateFrames', () => {
  const base = { durationSec: 60, sourceFps: 30, interval: 1, count: 10 };

  it('counts every frame from the source frame rate', () => {
    expect(estimateFrames('all', base).frames).toBe(1800);
  });

  it('cannot count every frame without a source frame rate', () => {
    expect(estimateFrames('all', { ...base, sourceFps: null }).frames).toBeNull();
  });

  it('counts interval frames inclusively — 0s, 2s, 4s … 60s', () => {
    expect(estimateFrames('interval', { ...base, interval: 2 }).frames).toBe(31);
  });

  it('handles sub-second intervals', () => {
    expect(estimateFrames('interval', { ...base, durationSec: 10, interval: 0.5 }).frames).toBe(21);
  });

  it('trusts the requested count in count mode, even without a duration', () => {
    expect(estimateFrames('count', { ...base, durationSec: null, count: 24 }).frames).toBe(24);
  });

  it('returns nothing for interval mode when the duration is unknown', () => {
    expect(estimateFrames('interval', { ...base, durationSec: null }).frames).toBeNull();
  });

  it('flags runs that would flood a folder', () => {
    expect(estimateFrames('all', { ...base, durationSec: 120 }).level).toBe('huge'); // 3600 stills
    expect(estimateFrames('all', base).level).toBe('large'); // 1800 stills
    expect(estimateFrames('interval', { ...base, durationSec: 600, interval: 1 }).level).toBe('large');
    expect(estimateFrames('count', { ...base, count: 12 }).level).toBe('ok');
  });

  it('never claims a level when the count is unknown', () => {
    expect(estimateFrames('all', { ...base, sourceFps: null }).level).toBe('ok');
  });
});

describe('rangeDuration', () => {
  it('always sends a length the user typed', () => {
    expect(rangeDuration('count', resolveRange('0:50', '0:05', 100))).toBe(5);
    expect(rangeDuration('interval', resolveRange('0:50', '0:05', 100))).toBe(5);
  });

  it('names the footage left after the start time so a fixed count is spread over it', () => {
    // 100 s clip, starting at 0:50: the backend must spread the count over 50 s,
    // not over the whole file, or it writes about half the frames asked for.
    expect(rangeDuration('count', resolveRange('0:50', '', 100))).toBe(50);
  });

  it('leaves the length open for the modes that do not depend on it', () => {
    expect(rangeDuration('interval', resolveRange('0:50', '', 100))).toBeNull();
    expect(rangeDuration('all', resolveRange('0:50', '', 100))).toBeNull();
  });

  it('sends nothing when the source length is unknown', () => {
    expect(rangeDuration('count', resolveRange('0:50', '', null))).toBeNull();
  });
});
