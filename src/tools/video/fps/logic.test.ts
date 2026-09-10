import { describe, expect, it } from 'vitest';
import { buildOps, direction, encodingFor, explain, formatFps, interpolateFilter, parseFps } from './logic';

describe('parseFps', () => {
  it('accepts whole and fractional rates', () => {
    expect(parseFps('30')).toBe(30);
    expect(parseFps('29.97')).toBe(29.97);
    expect(parseFps(' 60 ')).toBe(60);
  });

  it('rejects anything FFmpeg would choke on', () => {
    expect(parseFps('')).toBeNull();
    expect(parseFps('0')).toBeNull();
    expect(parseFps('-24')).toBeNull();
    expect(parseFps('1000')).toBeNull();
    expect(parseFps('fast')).toBeNull();
  });

  it('keeps at most three decimals', () => {
    expect(parseFps('23.976023')).toBe(23.976);
  });
});

describe('direction', () => {
  it('compares against the source rate', () => {
    expect(direction(30, 60)).toBe('up');
    expect(direction(60, 30)).toBe('down');
    expect(direction(30, 30)).toBe('same');
    // 29.97 → 30 is a real NTSC conversion, not a rounding artefact.
    expect(direction(29.97, 30)).toBe('up');
    expect(direction(29.999999, 30)).toBe('same');
    expect(direction(null, 30)).toBe('unknown');
  });
});

describe('explain', () => {
  it('is honest about duplicated frames when raising the rate', () => {
    expect(explain(30, 60, false)).toContain('repeated');
    expect(explain(30, 60, true)).toContain('tracking motion');
  });

  it('says frames are dropped when lowering the rate', () => {
    expect(explain(60, 30, false)).toContain('dropped');
  });

  it('still describes interpolation when the source rate is unknown', () => {
    expect(explain(null, 60, true)).toContain('invents');
    expect(explain(null, 60, false)).toContain('whatever the source runs at');
  });
});

describe('encodingFor', () => {
  it('names H.264 so -crf and -preset are not dropped on the way through', () => {
    // FFmpeg would default an .avi to mpeg4, which takes neither flag.
    expect(encodingFor(['avi'])).toEqual({ videoCodec: 'libx264', format: undefined, supportsPreset: true });
    expect(encodingFor(['mp4', 'mkv', 'mov'])).toMatchObject({ videoCodec: 'libx264', format: undefined });
  });

  it('re-wraps containers that cannot hold H.264', () => {
    for (const ext of ['wmv', 'mpg', 'mpeg']) {
      expect(encodingFor([ext]).format).toBe('mp4');
    }
    // A mixed batch writes one container, so it falls back to MP4 as well.
    expect(encodingFor(['mp4', 'webm']).format).toBe('mp4');
  });

  it('keeps WebM on VP9, where there is no speed preset', () => {
    expect(encodingFor(['webm', 'webm'])).toEqual({
      videoCodec: 'libvpx-vp9',
      videoBitrate: '0',
      supportsPreset: false,
    });
  });

  it('asks for nothing special before a file is added', () => {
    expect(encodingFor([]).format).toBeUndefined();
  });
});

describe('buildOps', () => {
  const encoding = encodingFor(['mp4']);

  it('uses the plain fps filter by default', () => {
    const ops = buildOps(30, { interpolate: false, crf: 21, preset: 'medium', encoding });
    expect(ops.fps).toBe(30);
    expect(ops.extraFilters).toBeUndefined();
    expect(ops.crf).toBe(21);
    expect(ops.preset).toBe('medium');
    expect(ops.videoCodec).toBe('libx264');
  });

  it('swaps in minterpolate and drops the fps filter so they do not fight', () => {
    const ops = buildOps(60, { interpolate: true, crf: 18, preset: 'slow', encoding });
    expect(ops.fps).toBeUndefined();
    expect(ops.extraFilters).toEqual([interpolateFilter(60)]);
    expect(interpolateFilter(60)).toBe('minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1');
  });

  it('carries the container swap and drops the preset VP9 would ignore', () => {
    const wmv = buildOps(24, { interpolate: false, crf: 21, preset: 'slow', encoding: encodingFor(['wmv']) });
    expect(wmv.format).toBe('mp4');
    expect(wmv.preset).toBe('slow');

    const webm = buildOps(24, { interpolate: false, crf: 21, preset: 'slow', encoding: encodingFor(['webm']) });
    expect(webm.videoCodec).toBe('libvpx-vp9');
    expect(webm.videoBitrate).toBe('0');
    expect(webm.preset).toBeUndefined();
    expect(webm.format).toBeUndefined();
  });
});

describe('formatFps', () => {
  it('trims the noise ffprobe reports', () => {
    expect(formatFps(29.999999)).toBe('30');
    expect(formatFps(23.976023976)).toBe('23.98');
    expect(formatFps(null)).toBe('—');
  });
});
