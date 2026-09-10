import { describe, it, expect } from 'vitest';
import {
  CODECS,
  QUALITY_TIERS,
  VARIANCE,
  codecById,
  estimate,
  formatBitrate,
  formatSize,
  parseNonNegative,
  qualityById,
  videoBitrateBps,
  videoBitrateForTarget,
} from './logic';

const h264 = codecById('h264')!;

describe('videoBitrateBps', () => {
  it('lands on the published 1080p30 H.264 figure', () => {
    const bps = videoBitrateBps(1920, 1080, 30, h264.bpp, 1)!;
    expect(bps / 1e6).toBeCloseTo(8.09, 2);
  });

  it('scales linearly with pixel count', () => {
    const hd = videoBitrateBps(1920, 1080, 30, h264.bpp, 1)!;
    const uhd = videoBitrateBps(3840, 2160, 30, h264.bpp, 1)!;
    expect(uhd / hd).toBeCloseTo(4, 9);
  });

  it('charges less than double for double the frame rate', () => {
    const at30 = videoBitrateBps(1920, 1080, 30, h264.bpp, 1)!;
    const at60 = videoBitrateBps(1920, 1080, 60, h264.bpp, 1)!;
    expect(at60 / at30).toBeGreaterThan(1.5);
    expect(at60 / at30).toBeLessThan(2);
    expect(at60 / at30).toBeCloseTo(Math.pow(2, 0.75), 9);
  });

  it('makes the newer codecs smaller at the same settings', () => {
    const rates = CODECS.map((c) => videoBitrateBps(1920, 1080, 30, c.bpp, 1)!);
    expect(rates[1]).toBeLessThan(rates[0]); // HEVC under AVC
    expect(rates[3]).toBeLessThan(rates[1]); // AV1 under HEVC
  });

  it('rejects impossible settings', () => {
    expect(videoBitrateBps(0, 1080, 30, h264.bpp, 1)).toBeNull();
    expect(videoBitrateBps(1920, 1080, 0, h264.bpp, 1)).toBeNull();
    expect(videoBitrateBps(1920, 1080, 30, h264.bpp, 0)).toBeNull();
  });
});

describe('estimate', () => {
  const base = {
    width: 1920,
    height: 1080,
    fps: 30,
    bpp: h264.bpp,
    qualityFactor: 1,
    seconds: 600,
    audioBps: 128_000,
  };

  it('produces a size with an honest range around it', () => {
    const e = estimate(base)!;
    expect(e.totalBps).toBeCloseTo(e.videoBps + 128_000, 9);
    expect(e.bytes).toBeCloseTo((e.totalBps * 600) / 8, 6);
    expect(e.lowBytes).toBeCloseTo(e.bytes * (1 - VARIANCE), 6);
    expect(e.highBytes).toBeCloseTo(e.bytes * (1 + VARIANCE), 6);
    // Ten minutes of 1080p30 at ~8.2 Mbps ≈ 616 MB.
    expect(e.bytes / 1e6).toBeCloseTo(616.13, 1);
  });

  it('reports a per-minute rate consistent with the total', () => {
    const e = estimate(base)!;
    expect(e.bytesPerMinute * 10).toBeCloseTo(e.bytes, 6);
  });

  it('handles silent video and zero-length clips', () => {
    expect(estimate({ ...base, audioBps: 0 })!.totalBps).toBeCloseTo(estimate(base)!.videoBps, 9);
    expect(estimate({ ...base, seconds: 0 })!.bytes).toBe(0);
  });

  it('refuses negative durations', () => {
    expect(estimate({ ...base, seconds: -1 })).toBeNull();
    expect(estimate({ ...base, audioBps: -1 })).toBeNull();
  });

  it('gets smaller as the quality tier drops', () => {
    const sizes = QUALITY_TIERS.map((q) => estimate({ ...base, qualityFactor: q.factor })!.bytes);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });
});

describe('videoBitrateForTarget', () => {
  it('inverts the size estimate', () => {
    const e = estimate({
      width: 1920,
      height: 1080,
      fps: 30,
      bpp: h264.bpp,
      qualityFactor: 1,
      seconds: 300,
      audioBps: 128_000,
    })!;
    expect(videoBitrateForTarget(e.bytes, 300, 128_000)).toBeCloseTo(e.videoBps, 6);
  });

  it('goes negative when audio alone will not fit, so the caller can warn', () => {
    const bps = videoBitrateForTarget(1_000_000, 600, 128_000)!;
    expect(bps).toBeLessThan(0);
  });

  it('rejects a zero target or duration', () => {
    expect(videoBitrateForTarget(0, 600, 128_000)).toBeNull();
    expect(videoBitrateForTarget(1e9, 0, 128_000)).toBeNull();
  });
});

describe('lookups and formatting', () => {
  it('finds codecs and quality tiers by id', () => {
    expect(codecById('av1')?.label).toBe('AV1');
    expect(codecById('nope')).toBeUndefined();
    expect(qualityById('high')?.factor).toBe(1.6);
    expect(qualityById('nope')).toBeUndefined();
  });

  it('formats bitrates and sizes', () => {
    expect(formatBitrate(8_090_000)).toBe('8.09 Mbps');
    expect(formatBitrate(128_000)).toBe('128 kbps');
    expect(formatSize(615_200_000)).toBe('615.2 MB');
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(null)).toBe('—');
  });

  it('parses non-negative numbers', () => {
    expect(parseNonNegative('0')).toBe(0);
    expect(parseNonNegative('23.976')).toBe(23.976);
    expect(parseNonNegative('-1')).toBeNull();
    expect(parseNonNegative('x')).toBeNull();
  });
});
