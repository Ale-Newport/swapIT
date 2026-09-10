import { describe, it, expect } from 'vitest';
import { estimateGif, resolveClip } from './logic';

describe('resolveClip', () => {
  it('treats empty fields as "the whole video"', () => {
    const clip = resolveClip('', '', 30);
    expect(clip.start).toBe(0);
    expect(clip.duration).toBeNull();
    expect(clip.effective).toBe(30);
    expect(clip.startError).toBeNull();
  });

  it('parses mm:ss and h:mm:ss timecodes', () => {
    expect(resolveClip('1:30', '', null).start).toBe(90);
    expect(resolveClip('0:01:02', '', null).start).toBe(62);
    expect(resolveClip('90', '', null).start).toBe(90);
  });

  it('rejects text that is not a timecode', () => {
    const clip = resolveClip('soon', '', 30);
    expect(clip.startError).toMatch(/not a time/);
    expect(clip.start).toBe(0);
  });

  it('rejects a start past the end of the video', () => {
    const clip = resolveClip('0:45', '', 30);
    expect(clip.startError).toMatch(/past the end/);
  });

  it('allows a start beyond the end when the length is unknown', () => {
    expect(resolveClip('9:00', '', null).startError).toBeNull();
  });

  it('rejects a zero or negative length', () => {
    expect(resolveClip('', '0', 30).durationError).toMatch(/more than zero/);
    expect(resolveClip('', 'later', 30).durationError).toMatch(/not a length/);
  });

  it('clamps the effective length to what is left after the start', () => {
    const clip = resolveClip('0:25', '0:30', 30);
    expect(clip.duration).toBe(30); // sent to FFmpeg untouched
    expect(clip.effective).toBe(5); // but only 5s of footage exist
  });

  it('uses the requested length when the source length is unknown', () => {
    expect(resolveClip('0:10', '0:04', null).effective).toBe(4);
  });
});

describe('estimateGif', () => {
  it('returns nothing when the length is unknown', () => {
    expect(estimateGif({ durationSec: null, fps: 12, width: 480 })).toBeNull();
    expect(estimateGif({ durationSec: 0, fps: 12, width: 480 })).toBeNull();
  });

  it('derives an even height from the source aspect ratio', () => {
    const e = estimateGif({ durationSec: 2, fps: 10, width: 480, sourceWidth: 1920, sourceHeight: 1080 });
    expect(e?.height).toBe(270);
    expect(e?.frames).toBe(20);
  });

  it('assumes 16:9 when the source size is unknown', () => {
    expect(estimateGif({ durationSec: 1, fps: 10, width: 640 })?.height).toBe(360);
  });

  it('handles vertical video', () => {
    const e = estimateGif({ durationSec: 1, fps: 10, width: 480, sourceWidth: 1080, sourceHeight: 1920 });
    expect(e?.height).toBe(854); // rounded to an even number
  });

  it('flags a long, wide, high-frame-rate clip as huge', () => {
    const e = estimateGif({ durationSec: 60, fps: 30, width: 800, sourceWidth: 1920, sourceHeight: 1080 });
    expect(e?.level).toBe('huge');
    expect(e!.bytes).toBeGreaterThan(40_000_000);
  });

  it('leaves a short, small clip alone', () => {
    const e = estimateGif({ durationSec: 3, fps: 10, width: 320, sourceWidth: 1920, sourceHeight: 1080 });
    expect(e?.level).toBe('ok');
  });

  it('flags frame count even when the pixel count is small', () => {
    const e = estimateGif({ durationSec: 60, fps: 12, width: 160, sourceWidth: 1920, sourceHeight: 1080 });
    expect(e?.frames).toBe(720);
    expect(e?.level).toBe('huge');
  });
});
