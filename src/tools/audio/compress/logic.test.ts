import { describe, expect, it } from 'vitest';
import { buildCompressOps, estimateBytes, findPreset, findTarget, summarise } from './logic';

describe('buildCompressOps', () => {
  it('sends an explicit codec so the backend forwards the bitrate', () => {
    expect(buildCompressOps('balanced', 'mp3')).toEqual({
      format: 'mp3',
      videoCodec: 'copy',
      audioCodec: 'libmp3lame',
      audioBitrate: '160k',
    });
  });

  it('downmixes only for the voice preset', () => {
    expect(buildCompressOps('voice', 'm4a')).toMatchObject({ audioBitrate: '64k', toMono: true, audioCodec: 'aac' });
    expect(buildCompressOps('maximum', 'm4a').toMono).toBeUndefined();
  });

  it('refuses a container whose bitrate cannot be set', () => {
    expect(() => buildCompressOps('high', 'flac')).toThrow(/MP3 or M4A/);
  });

  it('refuses an unknown preset', () => {
    expect(() => findPreset('tiny')).toThrow(/compression presets/);
    expect(() => findTarget('ogg')).toThrow(/MP3 or M4A/);
  });
});

describe('estimateBytes', () => {
  it('multiplies duration by bitrate', () => {
    expect(estimateBytes(180, 128)).toBe(2_880_000);
  });

  it('refuses to guess when the duration is unknown', () => {
    expect(estimateBytes(0, 128)).toBe(0);
    expect(estimateBytes(Number.POSITIVE_INFINITY, 128)).toBe(0);
  });
});

describe('summarise', () => {
  const files = [
    { path: '/a.wav', size: 10_000_000 },
    { path: '/b.wav', size: 5_000_000 },
    { path: '/c.wav', size: 1_000_000 },
  ];

  it('only counts files whose length is known', () => {
    const result = summarise(files, { '/a.wav': 60, '/b.wav': 30 }, 128);
    expect(result.pending).toBe(1);
    expect(result.measuredBytes).toBe(15_000_000);
    expect(result.estimatedBytes).toBe(estimateBytes(60, 128) + estimateBytes(30, 128));
  });

  it('treats a zero duration as unmeasured rather than as a zero-byte result', () => {
    const result = summarise(files, { '/a.wav': 0, '/b.wav': 0, '/c.wav': 0 }, 128);
    expect(result.pending).toBe(3);
    expect(result.estimatedBytes).toBe(0);
    expect(result.measuredBytes).toBe(0);
  });

  it('reports nothing pending once every file is measured', () => {
    const result = summarise(files, { '/a.wav': 10, '/b.wav': 10, '/c.wav': 10 }, 64);
    expect(result.pending).toBe(0);
    expect(result.estimatedBytes).toBe(3 * estimateBytes(10, 64));
  });
});
