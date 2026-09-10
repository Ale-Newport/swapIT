import { describe, it, expect } from 'vitest';
import {
  approximateRatio,
  cropOverflow,
  decimalLabel,
  fitBox,
  gcd,
  letterbox,
  namedFor,
  orientation,
  parsePositive,
  parseRatioText,
  simplify,
  snapTo,
} from './logic';

describe('gcd', () => {
  it('reduces the usual screen sizes', () => {
    expect(gcd(1920, 1080)).toBe(120);
    expect(gcd(3840, 2160)).toBe(240);
    expect(gcd(7, 13)).toBe(1);
    expect(gcd(0, 5)).toBe(5);
  });
});

describe('simplify', () => {
  it('reduces integer sizes with the gcd', () => {
    expect(simplify(1920, 1080)).toEqual({ w: 16, h: 9 });
    expect(simplify(3840, 2160)).toEqual({ w: 16, h: 9 });
    expect(simplify(1024, 768)).toEqual({ w: 4, h: 3 });
    expect(simplify(1080, 1920)).toEqual({ w: 9, h: 16 });
    expect(simplify(3440, 1440)).toEqual({ w: 43, h: 18 });
  });

  it('keeps awkward sizes honest instead of pretending', () => {
    expect(simplify(1919, 1080)).toEqual({ w: 1919, h: 1080 });
  });

  it('approximates non-integer sizes', () => {
    expect(simplify(16.5, 9)).toEqual({ w: 11, h: 6 });
  });

  it('rejects impossible sizes', () => {
    expect(simplify(0, 100)).toBeNull();
    expect(simplify(-16, 9)).toBeNull();
    expect(simplify(Number.NaN, 9)).toBeNull();
  });
});

describe('approximateRatio', () => {
  it('finds the simple fraction behind a rounded decimal', () => {
    expect(approximateRatio(1.7778)).toEqual({ w: 16, h: 9 });
    expect(approximateRatio(1.3333)).toEqual({ w: 4, h: 3 });
    expect(approximateRatio(2.39)).toEqual({ w: 239, h: 100 });
    expect(approximateRatio(0.5625)).toEqual({ w: 9, h: 16 });
  });

  it('respects the denominator budget', () => {
    const r = approximateRatio(Math.PI, 10);
    expect(r).not.toBeNull();
    expect(r!.h).toBeLessThanOrEqual(10);
    expect(r!.w / r!.h).toBeCloseTo(Math.PI, 2);
  });

  it('handles integers and rejects nonsense', () => {
    expect(approximateRatio(3)).toEqual({ w: 3, h: 1 });
    expect(approximateRatio(0)).toBeNull();
    expect(approximateRatio(-2)).toBeNull();
  });
});

describe('namedFor', () => {
  it('recognises the common ratios', () => {
    expect(namedFor(16 / 9)?.label).toBe('16:9');
    expect(namedFor(1)?.label).toBe('1:1');
    expect(namedFor(9 / 16)?.label).toBe('9:16');
    expect(namedFor(3440 / 1440)?.label).toBe('43:18');
    expect(namedFor(2560 / 1080)?.label).toBe('64:27');
  });

  it('returns nothing for a ratio that is not standard', () => {
    expect(namedFor(1.5 / 1.1)).toBeNull();
    expect(namedFor(0)).toBeNull();
  });
});

describe('parseRatioText', () => {
  it('accepts every separator people type', () => {
    expect(parseRatioText('16:9')).toBeCloseTo(16 / 9, 10);
    expect(parseRatioText('16/9')).toBeCloseTo(16 / 9, 10);
    expect(parseRatioText('16 x 9')).toBeCloseTo(16 / 9, 10);
    expect(parseRatioText('2.39:1')).toBeCloseTo(2.39, 10);
  });

  it('reads a bare decimal as ratio-to-one', () => {
    expect(parseRatioText('1.85')).toBe(1.85);
  });

  it('rejects zeroes and junk', () => {
    expect(parseRatioText('16:0')).toBeNull();
    expect(parseRatioText('0:9')).toBeNull();
    expect(parseRatioText('wide')).toBeNull();
    expect(parseRatioText('')).toBeNull();
  });
});

describe('parsePositive', () => {
  it('takes sizes with grouping and rejects the rest', () => {
    expect(parsePositive('1,920')).toBe(1920);
    expect(parsePositive('1080')).toBe(1080);
    expect(parsePositive('0')).toBeNull();
    expect(parsePositive('-5')).toBeNull();
    expect(parsePositive('abc')).toBeNull();
  });
});

describe('snapTo', () => {
  it('rounds to a multiple without ever reaching zero', () => {
    expect(snapTo(101, 1)).toBe(101);
    expect(snapTo(101, 2)).toBe(102);
    expect(snapTo(1079.6, 16)).toBe(1072);
    expect(snapTo(3, 16)).toBe(16);
  });

  it('honours the requested direction', () => {
    expect(snapTo(1080, 16, 'down')).toBe(1072);
    expect(snapTo(1080, 16, 'up')).toBe(1088);
    expect(snapTo(1024, 16, 'down')).toBe(1024);
    expect(snapTo(1024, 16, 'up')).toBe(1024);
    expect(snapTo(562.5, 1, 'down')).toBe(562);
    expect(snapTo(562.5, 1, 'up')).toBe(563);
  });

  it('does not lose a whole step to floating point drift', () => {
    // 1440 arrived at as 4032 × (1920 ÷ 4032) comes out a hair under.
    expect(snapTo(4032 * (1920 / 4032), 16, 'down')).toBe(1920);
    expect(snapTo(4032 * (1920 / 4032), 16, 'up')).toBe(1920);
  });
});

describe('fitBox', () => {
  it('contains a 16:9 source inside a square box', () => {
    const fit = fitBox(1920, 1080, 1000, 1000, 'contain');
    expect(fit).toEqual({ width: 1000, height: 563, scale: 1000 / 1920 });
    expect(letterbox(fit!, 1000, 1000)).toEqual({ x: 0, y: 218.5 });
  });

  it('covers the same box by overflowing the height', () => {
    const fit = fitBox(1920, 1080, 1000, 1000, 'cover');
    expect(fit!.height).toBe(1000);
    expect(fit!.width).toBe(1778);
    expect(cropOverflow(fit!, 1000, 1000)).toEqual({ x: 389, y: 0 });
  });

  it('never upscales differently from downscaling', () => {
    const up = fitBox(640, 360, 1920, 1080, 'contain');
    expect(up).toEqual({ width: 1920, height: 1080, scale: 3 });
  });

  it('snaps to even dimensions for encoders', () => {
    const fit = fitBox(1999, 1001, 1280, 720, 'contain', 2);
    expect(fit!.width % 2).toBe(0);
    expect(fit!.height % 2).toBe(0);
  });

  it('rejects a zero-sized box', () => {
    expect(fitBox(1920, 1080, 0, 500, 'contain')).toBeNull();
  });

  it('never lets a snapped contain grow past the box', () => {
    const same = fitBox(1920, 1080, 1920, 1080, 'contain', 16);
    expect(same).toEqual({ width: 1920, height: 1072, scale: 1 });
    expect(letterbox(same!, 1920, 1080)).toEqual({ x: 0, y: 4 });

    const phone = fitBox(4032, 3024, 1920, 1080, 'contain', 16);
    expect(phone!.width).toBeLessThanOrEqual(1920);
    expect(phone!.height).toBeLessThanOrEqual(1080);

    for (const step of [2, 4, 8, 16]) {
      for (const [sw, sh] of [
        [4032, 3024],
        [1920, 1080],
        [1000, 1000],
        [1179, 2556],
        [6000, 4000],
      ]) {
        const fit = fitBox(sw, sh, 1920, 1080, 'contain', step)!;
        expect(fit.width).toBeLessThanOrEqual(1920);
        expect(fit.height).toBeLessThanOrEqual(1080);
      }
    }
  });

  it('never lets a snapped cover fall short of the box', () => {
    const square = fitBox(1000, 1000, 1030, 1030, 'cover', 16);
    expect(square).toEqual({ width: 1040, height: 1040, scale: 1.03 });
    expect(cropOverflow(square!, 1030, 1030)).toEqual({ x: 5, y: 5 });

    for (const step of [2, 4, 8, 16]) {
      for (const [sw, sh] of [
        [4032, 3024],
        [1920, 1080],
        [1000, 1000],
        [1179, 2556],
        [6000, 4000],
      ]) {
        const fit = fitBox(sw, sh, 1920, 1080, 'cover', step)!;
        expect(fit.width).toBeGreaterThanOrEqual(1920);
        expect(fit.height).toBeGreaterThanOrEqual(1080);
      }
    }
  });

  it('keeps a whole step when the box is smaller than one', () => {
    const fit = fitBox(100, 100, 10, 10, 'contain', 16);
    expect(fit).toEqual({ width: 16, height: 16, scale: 0.1 });
  });
});

describe('decimalLabel / orientation', () => {
  it('trims trailing zeros', () => {
    expect(decimalLabel(1.7777777)).toBe('1.7778');
    expect(decimalLabel(2)).toBe('2');
    expect(decimalLabel(1.5)).toBe('1.5');
    expect(decimalLabel(null)).toBe('—');
  });

  it('names the orientation', () => {
    expect(orientation(16 / 9)).toBe('Landscape');
    expect(orientation(9 / 16)).toBe('Portrait');
    expect(orientation(1)).toBe('Square');
    expect(orientation(null)).toBe('—');
  });
});
