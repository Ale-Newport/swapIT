import { describe, it, expect } from 'vitest';
import {
  aspectRatio,
  channelLabel,
  formatBitrate,
  formatFps,
  formatResolution,
  metadataJson,
  streamDetails,
  summaryStats,
  type MediaInfo,
  type StreamInfo,
} from './logic';

const stream = (over: Partial<StreamInfo> = {}): StreamInfo => ({
  index: 0,
  kind: 'video',
  codec: 'h264',
  codecLong: 'H.264 / AVC',
  width: 1920,
  height: 1080,
  fps: 30,
  bitrate: 5_000_000,
  sampleRate: null,
  channels: null,
  channelLayout: null,
  pixFmt: 'yuv420p',
  language: null,
  ...over,
});

const audioStream = stream({
  index: 1,
  kind: 'audio',
  codec: 'aac',
  codecLong: 'AAC',
  width: null,
  height: null,
  fps: null,
  bitrate: 128_000,
  sampleRate: 48000,
  channels: 2,
  channelLayout: 'stereo',
  pixFmt: null,
});

const info = (over: Partial<MediaInfo> = {}): MediaInfo => ({
  path: '/movies/clip.mp4',
  name: 'clip.mp4',
  size: 10_485_760,
  duration: 65,
  formatName: 'mov,mp4,m4a',
  formatLong: 'QuickTime / MOV',
  bitrate: 5_200_000,
  streams: [stream(), audioStream],
  tags: [['encoder', 'Lavf60']],
  video: stream(),
  audio: audioStream,
  ...over,
});

describe('formatBitrate', () => {
  it('scales the unit', () => {
    expect(formatBitrate(800)).toBe('800 bps');
    expect(formatBitrate(128_000)).toBe('128 kbps');
    expect(formatBitrate(5_200_000)).toBe('5.2 Mbps');
  });
  it('handles missing values', () => {
    expect(formatBitrate(null)).toBe('—');
    expect(formatBitrate(0)).toBe('—');
    expect(formatBitrate(undefined)).toBe('—');
  });
});

describe('formatFps', () => {
  it('drops trailing zeros for whole rates', () => {
    expect(formatFps(30)).toBe('30 fps');
  });
  it('keeps two decimals for broadcast rates', () => {
    expect(formatFps(30000 / 1001)).toBe('29.97 fps');
    expect(formatFps(24000 / 1001)).toBe('23.98 fps');
  });
  it('handles missing values', () => {
    expect(formatFps(null)).toBe('—');
    expect(formatFps(0)).toBe('—');
  });
});

describe('formatResolution', () => {
  it('needs both dimensions', () => {
    expect(formatResolution(1920, 1080)).toBe('1920 × 1080');
    expect(formatResolution(1920, null)).toBe('—');
  });
});

describe('aspectRatio', () => {
  it('reduces tidy ratios', () => {
    expect(aspectRatio(1920, 1080)).toBe('16:9');
    expect(aspectRatio(1080, 1920)).toBe('9:16');
    expect(aspectRatio(720, 480)).toBe('3:2');
  });
  it('falls back to a decimal for awkward ratios', () => {
    expect(aspectRatio(2048, 858)).toBe('2.39:1');
  });
  it('returns nothing without dimensions', () => {
    expect(aspectRatio(null, 1080)).toBeNull();
  });
});

describe('channelLabel', () => {
  it('prefers the reported layout', () => {
    expect(channelLabel(audioStream)).toBe('stereo');
  });
  it('names bare channel counts', () => {
    expect(channelLabel({ ...audioStream, channelLayout: null, channels: 1 })).toBe('mono');
    expect(channelLabel({ ...audioStream, channelLayout: null, channels: 6 })).toBe('6 channels');
    expect(channelLabel({ ...audioStream, channelLayout: null, channels: null })).toBe('—');
  });
});

describe('streamDetails', () => {
  it('describes a video stream', () => {
    expect(streamDetails(stream())).toBe('1920 × 1080 · 30 fps · yuv420p');
  });
  it('describes an audio stream', () => {
    expect(streamDetails(audioStream)).toBe('48 kHz · stereo');
  });
  it('keeps a non-integer sample rate readable', () => {
    expect(streamDetails({ ...audioStream, sampleRate: 44100 })).toBe('44.1 kHz · stereo');
  });
  it('appends the language when ffprobe reports one', () => {
    expect(streamDetails({ ...audioStream, language: 'eng' })).toBe('48 kHz · stereo · eng');
  });
  it('never returns an empty string', () => {
    expect(streamDetails({ ...stream(), kind: 'subtitle', width: null, height: null, fps: null, pixFmt: null })).toBe('—');
  });
});

describe('summaryStats', () => {
  it('produces the seven tiles in order', () => {
    const tiles = summaryStats(info());
    expect(tiles.map((t) => t.label)).toEqual([
      'Duration', 'Resolution', 'Frame rate', 'Video codec', 'Audio codec', 'Bitrate', 'Size',
    ]);
    expect(tiles[1]).toMatchObject({ value: '1920 × 1080', hint: '16:9' });
    expect(tiles[0].value).toBe('1:05');
  });

  it('says "none" for a file with no video or audio stream', () => {
    const tiles = summaryStats(info({ video: null, audio: null, duration: null }));
    expect(tiles[0].value).toBe('—');
    expect(tiles[2].value).toBe('—');
    expect(tiles[3].value).toBe('none');
    expect(tiles[4].value).toBe('none');
  });
});

describe('metadataJson', () => {
  it('turns the tag pairs into an object', () => {
    const parsed = JSON.parse(metadataJson([info()])) as { tags: Record<string, string>; streams: unknown[] };
    expect(parsed.tags).toEqual({ encoder: 'Lavf60' });
    expect(parsed.streams).toHaveLength(2);
  });

  it('returns an array when several files were read', () => {
    const parsed = JSON.parse(metadataJson([info(), info({ name: 'b.mov' })])) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });
});
