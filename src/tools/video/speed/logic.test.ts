import { describe, expect, it } from 'vitest';
import {
  clampSpeed,
  describeAudio,
  formatClipLength,
  formatSpeed,
  MAX_SPEED,
  MIN_SPEED,
  resultingDuration,
  sliderToSpeed,
  speedToSlider,
  tempoChain,
} from './logic';

describe('clampSpeed', () => {
  it('keeps values inside the exposed range', () => {
    expect(clampSpeed(0.001)).toBe(MIN_SPEED);
    expect(clampSpeed(99)).toBe(MAX_SPEED);
    expect(clampSpeed(1.5)).toBe(1.5);
  });

  it('falls back to 1x for junk input', () => {
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(clampSpeed(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampSpeed(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe('slider mapping', () => {
  it('is symmetric around 1x', () => {
    expect(speedToSlider(1)).toBe(0);
    expect(speedToSlider(2)).toBeCloseTo(1, 10);
    expect(speedToSlider(0.5)).toBeCloseTo(-1, 10);
  });

  it('round-trips the presets', () => {
    for (const speed of [0.25, 0.5, 1, 1.5, 2, 4]) {
      expect(sliderToSpeed(speedToSlider(speed))).toBeCloseTo(speed, 2);
    }
  });

  it('never returns a speed outside the range', () => {
    expect(sliderToSpeed(-99)).toBe(MIN_SPEED);
    expect(sliderToSpeed(99)).toBe(MAX_SPEED);
  });
});

describe('formatSpeed', () => {
  it('drops trailing zeros', () => {
    expect(formatSpeed(2)).toBe('2x');
    expect(formatSpeed(1.5)).toBe('1.5x');
    expect(formatSpeed(0.25)).toBe('0.25x');
    expect(formatSpeed(1.333)).toBe('1.33x');
  });
});

describe('resultingDuration', () => {
  it('divides by the speed factor', () => {
    expect(resultingDuration(120, 2)).toBe(60);
    expect(resultingDuration(30, 0.5)).toBe(60);
  });

  it('returns null when the duration is unknown or the speed is nonsense', () => {
    expect(resultingDuration(null, 2)).toBeNull();
    expect(resultingDuration(undefined, 2)).toBeNull();
    expect(resultingDuration(120, 0)).toBeNull();
    expect(resultingDuration(120, -2)).toBeNull();
  });
});

describe('tempoChain', () => {
  it('needs no stage at 1x', () => {
    expect(tempoChain(1)).toEqual([]);
  });

  it('uses a single stage inside atempo limits', () => {
    expect(tempoChain(1.5)).toEqual(['atempo=1.500000']);
  });

  it('chains beyond the 0.5–2.0 limits', () => {
    expect(tempoChain(4)).toEqual(['atempo=2.0', 'atempo=2.000000']);
    expect(tempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.500000']);
    expect(tempoChain(8)).toEqual(['atempo=2.0', 'atempo=2.0', 'atempo=2.000000']);
  });

  it('multiplies back out to the requested factor', () => {
    for (const factor of [0.1, 0.25, 0.75, 1.25, 3, 4, 8]) {
      const product = tempoChain(factor).reduce((acc, stage) => acc * Number(stage.split('=')[1]), 1);
      expect(product).toBeCloseTo(factor, 4);
    }
  });

  it('refuses to build a chain for a non-positive factor', () => {
    expect(tempoChain(0)).toEqual([]);
    expect(tempoChain(-2)).toEqual([]);
  });
});

describe('describeAudio', () => {
  it('says the result is silent when audio is dropped', () => {
    expect(describeAudio(2, false)).toMatch(/silent/);
  });

  it('counts the atempo stages it will use', () => {
    expect(describeAudio(4, true)).toMatch(/2 atempo stages/);
    expect(describeAudio(1.5, true)).toMatch(/1 atempo stage,/);
  });
});

describe('formatClipLength', () => {
  it('keeps a tenth of a second for short results', () => {
    expect(formatClipLength(0.75)).toBe('0.8s');
    expect(formatClipLength(9.9)).toBe('9.9s');
  });

  it('switches to minutes and seconds above ten seconds', () => {
    expect(formatClipLength(75)).toBe('1:15');
    expect(formatClipLength(3661)).toBe('1:01:01');
  });

  it('shows a dash when the length is unknown', () => {
    expect(formatClipLength(null)).toBe('—');
    expect(formatClipLength(undefined)).toBe('—');
    expect(formatClipLength(Number.NaN)).toBe('—');
  });
});
