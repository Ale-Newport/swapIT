import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  bitrateFromSize,
  durationFromSize,
  formatBitrate,
  formatDurationLong,
  formatSize,
  formatSizeBinary,
  parseNonNegative,
  sizeFromBitrate,
  trim,
} from './logic';

describe('the three ways round', () => {
  it('turns bitrate and duration into a size', () => {
    // 8 Mbps for one minute = 60 MB.
    expect(sizeFromBitrate(8e6, 60)).toBe(60_000_000);
    // CD audio: 1411.2 kbps for 74 minutes ≈ 783 MB.
    expect(sizeFromBitrate(1_411_200, 74 * 60)).toBeCloseTo(783_216_000, 0);
  });

  it('turns size and duration into a bitrate', () => {
    expect(bitrateFromSize(60_000_000, 60)).toBe(8e6);
    expect(bitrateFromSize(5_000_000, 300)).toBeCloseTo(133_333.33, 2);
  });

  it('turns size and bitrate into a duration', () => {
    expect(durationFromSize(60_000_000, 8e6)).toBe(60);
    expect(durationFromSize(1_000_000_000, 128_000)).toBeCloseTo(62_500, 6);
  });

  it('round-trips in every direction', () => {
    const bytes = sizeFromBitrate(4_500_000, 1234)!;
    expect(bitrateFromSize(bytes, 1234)).toBeCloseTo(4_500_000, 6);
    expect(durationFromSize(bytes, 4_500_000)).toBeCloseTo(1234, 6);
  });

  it('refuses the divisions that have no answer', () => {
    expect(bitrateFromSize(1000, 0)).toBeNull();
    expect(durationFromSize(1000, 0)).toBeNull();
    expect(sizeFromBitrate(-1, 10)).toBeNull();
    expect(bitrateFromSize(Number.NaN, 10)).toBeNull();
  });

  it('accepts a zero-length or zero-rate stream where that is meaningful', () => {
    expect(sizeFromBitrate(8e6, 0)).toBe(0);
    expect(sizeFromBitrate(0, 60)).toBe(0);
  });
});

describe('formatting', () => {
  it('picks a readable bitrate unit', () => {
    expect(formatBitrate(8_000_000)).toBe('8 Mbps');
    expect(formatBitrate(128_000)).toBe('128 kbps');
    expect(formatBitrate(1_411_200)).toBe('1.41 Mbps');
    expect(formatBitrate(640)).toBe('640 bit/s');
    expect(formatBitrate(null)).toBe('—');
  });

  it('shows sizes decimal and binary', () => {
    expect(formatSize(4_294_967_296)).toBe('4.29 GB');
    expect(formatSizeBinary(4_294_967_296)).toBe('4 GiB');
    expect(formatSize(60_000_000)).toBe('60 MB');
    expect(formatSize(999)).toBe('999 B');
  });

  it('writes durations the way a person would say them', () => {
    expect(formatDurationLong(3725)).toBe('1 h 2 min 5 s');
    expect(formatDurationLong(90)).toBe('1 min 30 s');
    expect(formatDurationLong(45)).toBe('45 s');
    expect(formatDurationLong(0.25)).toBe('0.25 s');
    expect(formatDurationLong(3600)).toBe('1 h');
    expect(formatDurationLong(null)).toBe('—');
  });

  it('trims and groups numbers without a locale', () => {
    expect(trim(1234.5, 2)).toBe('1,234.5');
    expect(trim(1000, 2)).toBe('1,000');
    expect(trim(0.5, 3)).toBe('0.5');
  });
});

describe('parseNonNegative', () => {
  it('takes zero but not negatives', () => {
    expect(parseNonNegative('0')).toBe(0);
    expect(parseNonNegative('128')).toBe(128);
    expect(parseNonNegative('8.5')).toBe(8.5);
    expect(parseNonNegative('1,411')).toBe(1411);
    expect(parseNonNegative('-1')).toBeNull();
    expect(parseNonNegative('')).toBeNull();
  });
});

describe('presets', () => {
  it('are all usable numbers with unique labels', () => {
    expect(new Set(PRESETS.map((p) => p.label)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(p.videoKbps).toBeGreaterThanOrEqual(0);
      expect(p.audioKbps).toBeGreaterThan(0);
    }
  });

  it('produces a sane hour of YouTube 1080p30', () => {
    const preset = PRESETS[0];
    const bytes = sizeFromBitrate((preset.videoKbps + preset.audioKbps) * 1000, 3600)!;
    // ~3.6 GB per hour at 8 Mbps.
    expect(bytes / 1e9).toBeCloseTo(3.658, 3);
  });
});
