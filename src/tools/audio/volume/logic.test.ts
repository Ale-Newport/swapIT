import { describe, expect, it } from 'vitest';
import { MIN_DB, buildVolumeOps, dbToLinear, formatMultiplier, linearToDb } from './logic';

describe('dbToLinear', () => {
  it('leaves the signal alone at 0 dB', () => {
    expect(dbToLinear(0)).toBe(1);
  });

  it('doubles the amplitude at +6 dB and halves it at −6 dB', () => {
    expect(dbToLinear(6)).toBeCloseTo(1.9953, 4);
    expect(dbToLinear(-6)).toBeCloseTo(0.5012, 4);
  });

  it('is exactly ten times at +20 dB', () => {
    expect(dbToLinear(20)).toBeCloseTo(10, 10);
  });

  it('falls back to unity rather than NaN', () => {
    expect(dbToLinear(Number.NaN)).toBe(1);
  });
});

describe('linearToDb', () => {
  it('round-trips through dbToLinear', () => {
    for (const db of [-20, -12.5, -3, 0, 4.5, 20]) {
      expect(linearToDb(dbToLinear(db))).toBeCloseTo(db, 8);
    }
  });

  it('clamps silence to the bottom of the range instead of returning −Infinity', () => {
    expect(linearToDb(0)).toBe(MIN_DB);
    expect(linearToDb(-1)).toBe(MIN_DB);
  });
});

describe('formatMultiplier', () => {
  it('reads back as a plain multiplier', () => {
    expect(formatMultiplier(0)).toBe('1.00×');
    expect(formatMultiplier(-20)).toBe('0.10×');
  });
});

describe('buildVolumeOps', () => {
  it('sends the linear multiplier, not the decibel value', () => {
    expect(buildVolumeOps(6, 'same', '192k')).toEqual({ audioOnly: true, volume: 1.9953 });
  });

  it('keeps the container options alongside the gain', () => {
    expect(buildVolumeOps(-3, 'mp3', '256k')).toEqual({
      format: 'mp3',
      videoCodec: 'copy',
      audioCodec: 'libmp3lame',
      audioBitrate: '256k',
      volume: 0.7079,
    });
  });

  it('sends exactly 1 at 0 dB, which the backend treats as no change', () => {
    expect(buildVolumeOps(0, 'wav', '192k').volume).toBe(1);
  });
});
