import { describe, it, expect } from 'vitest';
import { analyzeMerge, type MergeFile, type MergeStream } from './logic';

const video = (over: Partial<MergeStream> = {}): MergeStream => ({
  codec: 'h264',
  width: 1920,
  height: 1080,
  fps: 30,
  pixFmt: 'yuv420p',
  sampleRate: null,
  channels: null,
  ...over,
});

const audio = (over: Partial<MergeStream> = {}): MergeStream => ({
  codec: 'aac',
  width: null,
  height: null,
  fps: null,
  pixFmt: null,
  sampleRate: 48000,
  channels: 2,
  ...over,
});

const file = (over: Partial<MergeFile> = {}): MergeFile => ({
  name: 'clip.mp4',
  duration: 10,
  video: video(),
  audio: audio(),
  ...over,
});

describe('analyzeMerge', () => {
  it('reports nothing for identical files', () => {
    const a = analyzeMerge([file(), file({ name: 'b.mp4' })]);
    expect(a.mismatches).toEqual([]);
    expect(a.needsReEncode).toBe(false);
    expect(a.audioWarning).toBeNull();
    expect(a.totalDuration).toBe(20);
  });

  it('stays quiet with fewer than two files', () => {
    const a = analyzeMerge([file({ video: video({ codec: 'hevc' }) })]);
    expect(a.mismatches).toEqual([]);
    expect(a.needsReEncode).toBe(false);
    expect(a.totalDuration).toBe(10);
  });

  it('flags different video codecs', () => {
    const a = analyzeMerge([file(), file({ video: video({ codec: 'hevc' }) })]);
    expect(a.mismatches).toContain('Video codecs differ (h264, hevc)');
    expect(a.needsReEncode).toBe(true);
  });

  it('flags different resolutions', () => {
    const a = analyzeMerge([file(), file({ video: video({ width: 1280, height: 720 }) })]);
    expect(a.mismatches).toContain('Resolutions differ (1920×1080, 1280×720)');
  });

  it('flags different pixel formats and audio parameters', () => {
    const a = analyzeMerge([
      file(),
      file({ video: video({ pixFmt: 'yuv422p' }), audio: audio({ codec: 'mp3', sampleRate: 44100, channels: 1 }) }),
    ]);
    expect(a.mismatches).toContain('Pixel formats differ (yuv420p, yuv422p)');
    expect(a.mismatches).toContain('Audio codecs differ (aac, mp3)');
    expect(a.mismatches).toContain('Audio sample rates differ (48000 Hz, 44100 Hz)');
    expect(a.mismatches).toContain('Channel counts differ (2, 1)');
  });

  it('treats a frame-rate difference as a note, not a blocker', () => {
    const a = analyzeMerge([file(), file({ video: video({ fps: 59.94 }) })]);
    expect(a.notes).toContain('Frame rates differ (30, 59.94 fps)');
    expect(a.mismatches).toEqual([]);
    expect(a.needsReEncode).toBe(false);
  });

  it('warns when only some files carry audio', () => {
    const a = analyzeMerge([file(), file({ audio: null })]);
    expect(a.audioWarning).toMatch(/1 of 2 files have no audio/);
  });

  it('warns when no file carries audio', () => {
    const a = analyzeMerge([file({ audio: null }), file({ audio: null })]);
    expect(a.audioWarning).toMatch(/None of these files/);
  });

  it('flags a file with no video track', () => {
    const a = analyzeMerge([file(), file({ video: null })]);
    expect(a.mismatches).toContain('1 file has no video track');
    expect(a.needsReEncode).toBe(true);
  });

  it('adds up known lengths and counts the unknown ones', () => {
    const a = analyzeMerge([file({ duration: 12.5 }), file({ duration: null }), file({ duration: 7.5 })]);
    expect(a.totalDuration).toBe(20);
    expect(a.unknownDurations).toBe(1);
  });
});
