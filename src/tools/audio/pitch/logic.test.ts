import { describe, it, expect } from 'vitest';
import {
  BASE_RATE,
  encoderSampleRate,
  groupBySampleRate,
  intervalName,
  pitchOpsFor,
  pitchRatio,
  semitoneLabel,
} from './logic';
import type { PitchOps } from './logic';

/**
 * Reproduces what FFmpeg actually does with the options the backend builds:
 * `asetrate=44100*pitch, aresample=44100`, then `atempo` chains multiplying to
 * `1/pitch` and then to `speed`. Returns the audible outcome so the tests can
 * assert on the result rather than on the numbers we happen to send.
 */
function simulate(ops: PitchOps, sourceRate: number): { pitchFactor: number; lengthFactor: number } {
  const asetrate = BASE_RATE * ops.pitch;
  // Reinterpreting the samples changes both pitch and length by the same ratio.
  const pitchFactor = asetrate / sourceRate;
  let lengthFactor = sourceRate / asetrate;
  // tempo chain of 1/pitch speeds up by 1/pitch, so length is multiplied by pitch.
  lengthFactor *= ops.pitch;
  if (ops.speed) lengthFactor /= ops.speed;
  return { pitchFactor, lengthFactor };
}

describe('pitchRatio', () => {
  it('doubles an octave up and halves an octave down', () => {
    expect(pitchRatio(12)).toBeCloseTo(2, 10);
    expect(pitchRatio(-12)).toBeCloseTo(0.5, 10);
    expect(pitchRatio(0)).toBe(1);
  });

  it('matches the classic semitone constant', () => {
    expect(pitchRatio(1)).toBeCloseTo(1.059463, 6);
  });
});

describe('pitchOpsFor', () => {
  it('sends the ratio unchanged for 44.1 kHz sources', () => {
    expect(pitchOpsFor(pitchRatio(2), 44100)).toEqual({ pitch: pitchRatio(2) });
  });

  it('leaves the ratio alone when the sample rate is unknown', () => {
    expect(pitchOpsFor(1.5, null)).toEqual({ pitch: 1.5 });
    expect(pitchOpsFor(1.5, 0)).toEqual({ pitch: 1.5 });
  });

  it('shifts by exactly the requested amount at every common sample rate', () => {
    // The output format never enters the shift — `-ar` only relabels the result —
    // so both the untouched and the clamped rates must land on the same audio.
    for (const format of ['same', 'mp3', 'flac']) {
      for (const rate of [22050, 32000, 44100, 48000, 88200, 96000]) {
        for (const semitones of [-12, -7, -1, 1, 5, 12]) {
          const ratio = pitchRatio(semitones);
          const { pitchFactor, lengthFactor } = simulate(pitchOpsFor(ratio, rate, format), rate);
          expect(pitchFactor).toBeCloseTo(ratio, 8);
          expect(lengthFactor).toBeCloseTo(1, 8);
        }
      }
    }
  });

  it('would be audibly wrong without the compensation', () => {
    // The uncompensated call is what a naive implementation would send.
    const ratio = pitchRatio(3);
    const naive = simulate({ pitch: ratio }, 48000);
    expect(naive.pitchFactor).not.toBeCloseTo(ratio, 3);
    expect(naive.lengthFactor).toBeCloseTo(48000 / 44100, 6);
  });

  it('restores the source sample rate it had to resample away', () => {
    expect(pitchOpsFor(1.2, 48000).sampleRate).toBe(48000);
    expect(pitchOpsFor(1.2, 44100).sampleRate).toBeUndefined();
  });

  it('never asks libmp3lame for a rate it refuses', () => {
    // `-ar 96000` on an MP3 output makes FFmpeg fail to open the encoder and
    // write a 0-byte file, so high-rate sources are relabelled, not passed on.
    expect(pitchOpsFor(1.2, 96000, 'mp3').sampleRate).toBe(48000);
    expect(pitchOpsFor(1.2, 88200, 'mp3').sampleRate).toBe(44100);
    expect(pitchOpsFor(1.2, 48000, 'mp3').sampleRate).toBe(48000);
    // Every other encoder in the format list takes the source rate as it is.
    for (const format of ['same', 'm4a', 'wav', 'flac', 'ogg']) {
      expect(pitchOpsFor(1.2, 96000, format).sampleRate).toBe(96000);
    }
  });
});

describe('encoderSampleRate', () => {
  it('passes the source rate through for encoders with no limit', () => {
    expect(encoderSampleRate(96000)).toBe(96000);
    expect(encoderSampleRate(96000, 'same')).toBe(96000);
    expect(encoderSampleRate(192000, 'flac')).toBe(192000);
  });

  it('keeps rates MP3 already supports', () => {
    for (const rate of [8000, 22050, 32000, 44100, 48000]) {
      expect(encoderSampleRate(rate, 'mp3')).toBe(rate);
    }
  });

  it('prefers a rate the source divides by, so the two families stay apart', () => {
    expect(encoderSampleRate(88200, 'mp3')).toBe(44100);
    expect(encoderSampleRate(96000, 'mp3')).toBe(48000);
    expect(encoderSampleRate(176400, 'mp3')).toBe(44100);
    expect(encoderSampleRate(192000, 'mp3')).toBe(48000);
  });

  it('falls back to the highest rate that fits when nothing divides evenly', () => {
    expect(encoderSampleRate(50000, 'mp3')).toBe(48000);
  });

  it('leaves -ar off when the encoder can take nothing that low', () => {
    expect(encoderSampleRate(4000, 'mp3')).toBeUndefined();
  });
});

describe('groupBySampleRate', () => {
  it('keeps one group per rate, in first-seen order', () => {
    const groups = groupBySampleRate([
      { path: 'a.mp3', sampleRate: 48000 },
      { path: 'b.mp3', sampleRate: 44100 },
      { path: 'c.mp3', sampleRate: 48000 },
    ]);
    expect(groups).toEqual([
      { sampleRate: 48000, paths: ['a.mp3', 'c.mp3'] },
      { sampleRate: 44100, paths: ['b.mp3'] },
    ]);
  });

  it('treats unknown rates as their own group', () => {
    const groups = groupBySampleRate([
      { path: 'a.mp3', sampleRate: null },
      { path: 'b.mp3', sampleRate: null },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sampleRate).toBeNull();
  });

  it('returns nothing for an empty selection', () => {
    expect(groupBySampleRate([])).toEqual([]);
  });
});

describe('labels', () => {
  it('signs the semitone label', () => {
    expect(semitoneLabel(0)).toBe('No change');
    expect(semitoneLabel(1)).toBe('+1 semitone');
    expect(semitoneLabel(-5)).toBe('−5 semitones');
  });

  it('names intervals inside an octave and nothing outside the range', () => {
    expect(intervalName(7)).toBe('perfect 5th up');
    expect(intervalName(-12)).toBe('octave down');
    expect(intervalName(0)).toBeNull();
    expect(intervalName(13)).toBeNull();
  });
});
