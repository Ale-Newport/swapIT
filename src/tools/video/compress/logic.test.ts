import { describe, expect, it } from 'vitest';
import {
  buildOps,
  capFilter,
  cappedHeight,
  estimateBytes,
  estimateVideoKbps,
  matchPreset,
  parseAudioKbps,
  videoCodecFor,
} from './logic';

const clip1080 = { duration: 60, width: 1920, height: 1080, fps: 30 };

describe('capFilter', () => {
  it('never upscales and always lands on even dimensions', () => {
    expect(capFilter(720)).toBe("scale=-2:'trunc(min(ih,720)/2)*2':flags=lanczos");
  });

  it('leaves smaller sources alone', () => {
    expect(cappedHeight(480, 720)).toBe(480);
    expect(cappedHeight(1080, 720)).toBe(720);
    expect(cappedHeight(1080, null)).toBe(1080);
  });

  it('rounds odd heights down to even', () => {
    expect(cappedHeight(1081, null)).toBe(1080);
    expect(cappedHeight(721, 1080)).toBe(720);
  });
});

describe('buildOps', () => {
  it('adds the cap as a filter only when a cap is set', () => {
    expect(buildOps({ format: 'mp4', codec: 'libx264', crf: 23, maxHeight: null, preset: 'medium', removeAudio: false, audioBitrate: '128k' }).extraFilters).toBeUndefined();
    expect(
      buildOps({ format: 'mp4', codec: 'libx264', crf: 23, maxHeight: 720, preset: 'medium', removeAudio: false, audioBitrate: '128k' }).extraFilters,
    ).toEqual([capFilter(720)]);
  });

  it('uses VP9 and Opus for WebM and drops the x264 preset', () => {
    const ops = buildOps({ format: 'webm', codec: 'libx264', crf: 30, maxHeight: null, preset: 'slow', removeAudio: false, audioBitrate: '96k' });
    expect(ops.videoCodec).toBe('libvpx-vp9');
    expect(ops.audioCodec).toBe('libopus');
    expect(ops.preset).toBeUndefined();
  });

  it('drops audio settings when the track is removed', () => {
    const ops = buildOps({ format: 'mp4', codec: 'libx265', crf: 28, maxHeight: 1080, preset: 'fast', removeAudio: true, audioBitrate: '128k' });
    expect(ops.removeAudio).toBe(true);
    expect(ops.audioCodec).toBeUndefined();
    expect(ops.audioBitrate).toBeUndefined();
  });
});

describe('matchPreset', () => {
  it('recognises a preset and falls back to custom', () => {
    expect(matchPreset(23, null)).toBe('balanced');
    expect(matchPreset(32, 720)).toBe('very-small');
    expect(matchPreset(26, 720)).toBe('custom');
    expect(matchPreset(32, null)).toBe('custom');
  });
});

describe('estimate', () => {
  it('lands in a believable range for 1080p30 at CRF 23', () => {
    const kbps = estimateVideoKbps(clip1080, 23, 'libx264', null);
    expect(kbps).toBeGreaterThan(3000);
    expect(kbps).toBeLessThan(8000);
  });

  it('roughly halves for every 6 points of CRF', () => {
    const at23 = estimateVideoKbps(clip1080, 23, 'libx264', null);
    const at29 = estimateVideoKbps(clip1080, 29, 'libx264', null);
    expect(at29 / at23).toBeCloseTo(0.5, 2);
  });

  it('credits H.265 and VP9 with being more efficient', () => {
    const x264 = estimateVideoKbps(clip1080, 23, 'libx264', null);
    expect(estimateVideoKbps(clip1080, 23, 'libx265', null)).toBeLessThan(x264);
    expect(estimateVideoKbps(clip1080, 23, 'libvpx-vp9', null)).toBeLessThan(x264);
  });

  it('shrinks with the resolution cap', () => {
    const full = estimateVideoKbps(clip1080, 23, 'libx264', null);
    const capped = estimateVideoKbps(clip1080, 23, 'libx264', 720);
    expect(capped).toBeLessThan(full * 0.5);
  });

  it('counts the audio track and scales with duration', () => {
    const silent = estimateBytes(clip1080, { crf: 23, codec: 'libx264', maxHeight: null, audioKbps: 0 });
    const withAudio = estimateBytes(clip1080, { crf: 23, codec: 'libx264', maxHeight: null, audioKbps: 128 });
    expect(withAudio - silent).toBeCloseTo((128 * 1000 * 60) / 8, -2);
    const twice = estimateBytes({ ...clip1080, duration: 120 }, { crf: 23, codec: 'libx264', maxHeight: null, audioKbps: 0 });
    expect(twice).toBeCloseTo(silent * 2, -2);
  });

  it('returns zero when the clip has no usable metadata', () => {
    expect(estimateBytes({ duration: 0, width: 1920, height: 1080, fps: 30 }, { crf: 23, codec: 'libx264', maxHeight: null, audioKbps: 0 })).toBe(0);
    expect(estimateVideoKbps({ duration: 10, width: 0, height: 0, fps: 30 }, 23, 'libx264', null)).toBe(0);
  });

  it('treats a missing frame rate as 30 fps', () => {
    expect(estimateVideoKbps({ ...clip1080, fps: 0 }, 23, 'libx264', null)).toBe(estimateVideoKbps(clip1080, 23, 'libx264', null));
  });
});

describe('helpers', () => {
  it('reads the audio bitrate out of the FFmpeg spelling', () => {
    expect(parseAudioKbps('128k')).toBe(128);
    expect(parseAudioKbps('nonsense')).toBe(0);
  });

  it('forces VP9 for WebM only', () => {
    expect(videoCodecFor('webm', 'libx265')).toBe('libvpx-vp9');
    expect(videoCodecFor('mkv', 'libx265')).toBe('libx265');
  });
});
