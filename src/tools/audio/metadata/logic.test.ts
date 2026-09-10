import { describe, it, expect } from 'vitest';
import { findCoverArt, formatBitrate, formatChannels, formatSampleRate, tagLabel } from './logic';
import type { StreamInfo } from './logic';

function stream(patch: Partial<StreamInfo>): StreamInfo {
  return { index: 0, kind: 'audio', codec: 'mp3', codecLong: 'MP3', ...patch };
}

describe('findCoverArt', () => {
  it('finds JPEG artwork carried as a video stream', () => {
    const cover = findCoverArt([
      stream({ index: 0, kind: 'audio', codec: 'mp3' }),
      stream({ index: 1, kind: 'video', codec: 'mjpeg', width: 600, height: 600 }),
    ]);
    expect(cover).toEqual({ codec: 'mjpeg', width: 600, height: 600 });
  });

  it('finds PNG artwork too', () => {
    expect(findCoverArt([stream({ kind: 'video', codec: 'PNG', width: 300, height: 300 })])?.codec).toBe('png');
  });

  it('ignores a real video track', () => {
    expect(findCoverArt([stream({ kind: 'video', codec: 'h264', width: 1920, height: 1080 })])).toBeNull();
  });

  it('reports null when there are no video streams at all', () => {
    expect(findCoverArt([stream({ kind: 'audio', codec: 'flac' })])).toBeNull();
    expect(findCoverArt([])).toBeNull();
  });

  it('survives artwork with no reported dimensions', () => {
    expect(findCoverArt([stream({ kind: 'video', codec: 'mjpeg' })])).toEqual({
      codec: 'mjpeg',
      width: null,
      height: null,
    });
  });
});

describe('formatBitrate', () => {
  it('rounds to kbps and groups thousands', () => {
    expect(formatBitrate(320000)).toBe('320 kbps');
    expect(formatBitrate(1411200)).toBe('1,411 kbps');
  });

  it('has a dash for missing or nonsense values', () => {
    expect(formatBitrate(null)).toBe('—');
    expect(formatBitrate(undefined)).toBe('—');
    expect(formatBitrate(0)).toBe('—');
  });
});

describe('formatSampleRate', () => {
  it('drops the decimal only when it is a whole number of kHz', () => {
    expect(formatSampleRate(48000)).toBe('48 kHz');
    expect(formatSampleRate(44100)).toBe('44.1 kHz');
    expect(formatSampleRate(null)).toBe('—');
  });
});

describe('formatChannels', () => {
  it('names the common layouts', () => {
    expect(formatChannels(1, 'mono')).toBe('Mono');
    expect(formatChannels(2, 'stereo')).toBe('Stereo');
    expect(formatChannels(6, '5.1')).toBe('6 channels · 5.1');
    expect(formatChannels(null, null)).toBe('—');
  });
});

describe('tagLabel', () => {
  it('expands the keys people actually see', () => {
    expect(tagLabel('album_artist')).toBe('Album artist');
    expect(tagLabel('TPE2')).toBe('Album artist');
    expect(tagLabel('encoded_by')).toBe('Encoded by');
  });

  it('falls back to sentence case for unknown keys', () => {
    expect(tagLabel('publisher')).toBe('Publisher');
    expect(tagLabel('SOME-ODD_KEY')).toBe('Some odd key');
  });

  it('never returns an empty label', () => {
    expect(tagLabel('_')).toBe('_');
  });
});
