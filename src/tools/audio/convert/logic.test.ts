import { describe, expect, it } from 'vitest';
import {
  buildConvertOps,
  estimateBytes,
  findFormat,
  sampleRateChoices,
  usableSampleRate,
} from './logic';

describe('findFormat', () => {
  it('rejects an unknown container with a readable message', () => {
    expect(() => findFormat('mp4')).toThrow(/not an audio format/i);
  });
});

describe('buildConvertOps', () => {
  const base = { bitrate: '192k', sampleRate: 0, mono: false };

  it('drives lossy containers with an explicit codec so the bitrate is honoured', () => {
    const ops = buildConvertOps({ ...base, format: 'mp3' });
    expect(ops).toEqual({
      format: 'mp3',
      videoCodec: 'copy',
      audioCodec: 'libmp3lame',
      audioBitrate: '192k',
    });
    // audioOnly would suppress -b:a in the backend, so it must stay off here.
    expect(ops.audioOnly).toBeUndefined();
  });

  it('uses audioOnly for lossless containers and sends no bitrate', () => {
    const ops = buildConvertOps({ ...base, format: 'flac' });
    expect(ops).toEqual({ format: 'flac', audioOnly: true });
  });

  it('uses audioOnly for OGG, which cannot carry a copied picture stream', () => {
    const ops = buildConvertOps({ ...base, format: 'ogg' });
    expect(ops.audioOnly).toBe(true);
    expect(ops.audioBitrate).toBeUndefined();
  });

  it('omits the sample rate when the source rate is kept', () => {
    expect(buildConvertOps({ ...base, format: 'wav', sampleRate: 0 }).sampleRate).toBeUndefined();
    expect(buildConvertOps({ ...base, format: 'wav', sampleRate: 48000 }).sampleRate).toBe(48000);
  });

  it('drops a sample rate the encoder cannot produce instead of failing the job', () => {
    // libopus only encodes at 48 kHz; 44.1 has to fall back to "keep".
    expect(buildConvertOps({ ...base, format: 'opus', sampleRate: 44100 }).sampleRate).toBeUndefined();
    expect(buildConvertOps({ ...base, format: 'opus', sampleRate: 48000 }).sampleRate).toBe(48000);
  });

  it('adds the downmix flag only when mono is asked for', () => {
    expect(buildConvertOps({ ...base, format: 'mp3' }).toMono).toBeUndefined();
    expect(buildConvertOps({ ...base, format: 'mp3', mono: true }).toMono).toBe(true);
  });
});

describe('sampleRateChoices', () => {
  it('narrows to 48 kHz for Opus', () => {
    expect(sampleRateChoices('opus')).toEqual([48000]);
  });

  it('offers the usual three rates elsewhere', () => {
    expect(sampleRateChoices('mp3')).toEqual([44100, 48000, 22050]);
  });
});

describe('usableSampleRate', () => {
  it('keeps zero as "same as source"', () => {
    expect(usableSampleRate('opus', 0)).toBe(0);
  });

  it('passes a supported rate through untouched', () => {
    expect(usableSampleRate('mp3', 22050)).toBe(22050);
  });
});

describe('estimateBytes', () => {
  it('converts a duration and bitrate into bytes', () => {
    // 60 s at 128 kbps = 960 000 bytes.
    expect(estimateBytes(60, '128k')).toBe(960_000);
  });

  it('returns zero for unknown durations rather than a bogus number', () => {
    expect(estimateBytes(0, '128k')).toBe(0);
    expect(estimateBytes(Number.NaN, '128k')).toBe(0);
    expect(estimateBytes(-5, '128k')).toBe(0);
  });

  it('returns zero when the bitrate is not a number', () => {
    expect(estimateBytes(60, 'copy')).toBe(0);
  });
});
