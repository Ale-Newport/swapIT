import { describe, it, expect } from 'vitest';
import {
  PNG_PROFILES,
  channelFactor,
  decodedBytes,
  depthFactor,
  estimateFormats,
  formatSize,
  jpegBpp,
  megapixels,
  parsePositive,
  pngProfile,
  trim,
  uncompressedBytes,
} from './logic';

describe('megapixels', () => {
  it('counts a phone sensor correctly', () => {
    expect(megapixels(4032, 3024)).toBeCloseTo(12.19, 2);
    expect(megapixels(1920, 1080)).toBeCloseTo(2.0736, 4);
  });

  it('rejects empty dimensions', () => {
    expect(megapixels(0, 1080)).toBeNull();
    expect(megapixels(-1, 1080)).toBeNull();
  });
});

describe('uncompressedBytes', () => {
  it('is exactly width × height × channels × depth ÷ 8', () => {
    expect(uncompressedBytes(1920, 1080, 8, 3)).toBe(6_220_800);
    expect(uncompressedBytes(1920, 1080, 8, 4)).toBe(8_294_400);
    expect(uncompressedBytes(1920, 1080, 16, 3)).toBe(12_441_600);
    expect(uncompressedBytes(100, 100, 1, 1)).toBe(1250);
  });

  it('rejects nonsense', () => {
    expect(uncompressedBytes(1920, 0, 8, 3)).toBeNull();
    expect(uncompressedBytes(1920, 1080, 0, 3)).toBeNull();
  });
});

describe('decodedBytes', () => {
  it('assumes 8-bit RGBA, which is what toolkits allocate', () => {
    expect(decodedBytes(4032, 3024)).toBe(48_771_072);
    expect(decodedBytes(1920, 1080)).toBe(8_294_400);
  });

  it('follows a wider pixel format when asked', () => {
    expect(decodedBytes(1920, 1080, 8)).toBe(16_588_800);
  });
});

describe('jpegBpp', () => {
  it('matches the anchor points', () => {
    expect(jpegBpp(85)).toBeCloseTo(2.7, 10);
    expect(jpegBpp(75)).toBeCloseTo(2.0, 10);
    expect(jpegBpp(100)).toBeCloseTo(8.0, 10);
  });

  it('interpolates between them', () => {
    expect(jpegBpp(87.5)).toBeCloseTo(3.05, 10);
    expect(jpegBpp(82.5)).toBeCloseTo(2.5, 10);
  });

  it('is monotonic across the whole range', () => {
    let previous = -1;
    for (let q = 1; q <= 100; q++) {
      const bpp = jpegBpp(q);
      expect(bpp).toBeGreaterThanOrEqual(previous);
      previous = bpp;
    }
  });

  it('clamps outside 1–100', () => {
    expect(jpegBpp(0)).toBe(0.25);
    expect(jpegBpp(-50)).toBe(0.25);
    expect(jpegBpp(400)).toBe(8);
    expect(jpegBpp(Number.NaN)).toBe(0.25);
  });

  it('puts a 12 MP quality-85 photo near four megabytes', () => {
    const bytes = (4032 * 3024 * jpegBpp(85)) / 8;
    expect(bytes / 1e6).toBeCloseTo(4.115, 3);
  });
});

describe('channelFactor and depthFactor', () => {
  it('makes greyscale cheaper and alpha slightly dearer', () => {
    expect(channelFactor(1, true)).toBe(0.45);
    expect(channelFactor(3, true)).toBe(1);
    expect(channelFactor(4, true)).toBe(1.15);
    expect(channelFactor(4, false)).toBe(1);
  });

  it('grows lossless sizes with bit depth', () => {
    expect(depthFactor(8)).toBe(1);
    expect(depthFactor(16)).toBe(1.8);
    expect(depthFactor(32)).toBe(2.4);
  });
});

describe('estimateFormats', () => {
  const base = {
    width: 4032,
    height: 3024,
    bitsPerChannel: 8,
    channels: 3,
    jpegQuality: 85,
    pngContent: 'photo' as const,
  };

  it('returns all four formats with sane ratios', () => {
    const rows = estimateFormats(base);
    expect(rows.map((r) => r.id)).toEqual(['jpeg', 'png', 'webp-lossy', 'webp-lossless']);
    for (const row of rows) {
      expect(row.bytes).toBeGreaterThan(0);
      expect(row.ratio).toBeGreaterThan(1);
    }
  });

  it('keeps WebP under its lossy and lossless rivals', () => {
    const rows = estimateFormats(base);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.bytes]));
    expect(byId['webp-lossy']).toBeLessThan(byId.jpeg);
    expect(byId['webp-lossless']).toBeLessThan(byId.png);
    expect(byId.jpeg).toBeLessThan(byId.png);
  });

  it('shrinks with lower quality and simpler PNG content', () => {
    const low = estimateFormats({ ...base, jpegQuality: 50 });
    const high = estimateFormats({ ...base, jpegQuality: 95 });
    expect(low[0].bytes).toBeLessThan(high[0].bytes);

    const flat = estimateFormats({ ...base, pngContent: 'flat' });
    expect(flat[1].bytes).toBeLessThan(estimateFormats(base)[1].bytes);
  });

  it('makes greyscale cheaper than colour', () => {
    const grey = estimateFormats({ ...base, channels: 1 });
    expect(grey[0].bytes).toBeLessThan(estimateFormats(base)[0].bytes);
  });

  it('returns nothing for an impossible image', () => {
    expect(estimateFormats({ ...base, width: 0 })).toEqual([]);
  });

  it('lands a 12 MP photo in the expected few megabytes', () => {
    const jpeg = estimateFormats(base)[0];
    expect(jpeg.bytes / 1e6).toBeCloseTo(4.115, 3);
    expect(jpeg.ratio).toBeCloseTo(8.89, 2);
  });
});

describe('profiles and formatting', () => {
  it('falls back to the photo profile for an unknown id', () => {
    expect(pngProfile('nope').id).toBe('photo');
    expect(pngProfile('flat').label).toBe('Flat colour graphic');
    expect(new Set(PNG_PROFILES.map((p) => p.id)).size).toBe(PNG_PROFILES.length);
  });

  it('formats sizes and numbers', () => {
    expect(formatSize(48_771_072)).toBe('48.77 MB');
    expect(formatSize(1250)).toBe('1.25 kB');
    expect(formatSize(999)).toBe('999 B');
    expect(trim(1234.5, 1)).toBe('1,234.5');
  });

  it('parses dimensions', () => {
    expect(parsePositive('4,032')).toBe(4032);
    expect(parsePositive('0')).toBeNull();
    expect(parsePositive('wide')).toBeNull();
  });
});
