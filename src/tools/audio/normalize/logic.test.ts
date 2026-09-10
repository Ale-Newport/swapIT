import { describe, expect, it } from 'vitest';
import { buildFormatOps, buildNormalizeOps, findOutputFormat } from './logic';

describe('buildFormatOps', () => {
  it('keeps the source container without naming a format', () => {
    const ops = buildFormatOps('same', '192k');
    expect(ops).toEqual({ audioOnly: true });
    expect(ops.format).toBeUndefined();
  });

  it('names the codec for containers whose bitrate can be set', () => {
    expect(buildFormatOps('mp3', '128k')).toEqual({
      format: 'mp3',
      videoCodec: 'copy',
      audioCodec: 'libmp3lame',
      audioBitrate: '128k',
    });
  });

  it('never sends a bitrate for a lossless container', () => {
    const ops = buildFormatOps('flac', '320k');
    expect(ops).toEqual({ format: 'flac', audioOnly: true });
    expect(ops.audioBitrate).toBeUndefined();
  });

  it('rejects a format that is not on the list', () => {
    expect(() => findOutputFormat('opus')).toThrow(/output format/);
  });
});

describe('buildNormalizeOps', () => {
  it('always turns the loudness filter on, whatever the container', () => {
    expect(buildNormalizeOps('same', '192k').normalizeAudio).toBe(true);
    expect(buildNormalizeOps('wav', '192k')).toEqual({ format: 'wav', audioOnly: true, normalizeAudio: true });
  });

  it('keeps the bitrate alongside the filter for lossy targets', () => {
    expect(buildNormalizeOps('m4a', '256k')).toMatchObject({
      normalizeAudio: true,
      audioCodec: 'aac',
      audioBitrate: '256k',
    });
  });
});
