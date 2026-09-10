import { describe, it, expect } from 'vitest';
import { MAX_SECONDS, estimateBytes, parseDurationInput, silenceFilename } from './logic';

describe('parseDurationInput', () => {
  it('reads plain seconds', () => {
    expect(parseDurationInput('30')).toEqual({ ok: true, seconds: 30 });
    expect(parseDurationInput('1.5')).toEqual({ ok: true, seconds: 1.5 });
  });

  it('reads mm:ss and hh:mm:ss', () => {
    expect(parseDurationInput('1:30')).toEqual({ ok: true, seconds: 90 });
    expect(parseDurationInput('0:01:30')).toEqual({ ok: true, seconds: 90 });
    expect(parseDurationInput('2:00:00')).toEqual({ ok: true, seconds: 7200 });
  });

  it('reads the 2m30s shorthand', () => {
    expect(parseDurationInput('2m30s')).toEqual({ ok: true, seconds: 150 });
  });

  it('ignores surrounding whitespace', () => {
    expect(parseDurationInput('  45  ')).toEqual({ ok: true, seconds: 45 });
  });

  it('explains an empty box rather than failing silently', () => {
    const result = parseDurationInput('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Enter a length/);
  });

  it('rejects text that is not a length', () => {
    const result = parseDurationInput('forever');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/mm:ss/);
  });

  it('rejects lengths outside what FFmpeg is asked for', () => {
    expect(parseDurationInput('0').ok).toBe(false);
    expect(parseDurationInput('0.05').ok).toBe(false);
    expect(parseDurationInput(String(MAX_SECONDS + 1)).ok).toBe(false);
    expect(parseDurationInput(String(MAX_SECONDS)).ok).toBe(true);
    expect(parseDurationInput('0.1').ok).toBe(true);
  });
});

describe('silenceFilename', () => {
  it('matches the name the backend builds', () => {
    expect(silenceFilename(30, 'mp3')).toBe('silence-30s.mp3');
    expect(silenceFilename(90.4, 'wav')).toBe('silence-90s.wav');
  });
});

describe('estimateBytes', () => {
  it('is exact for uncompressed stereo PCM', () => {
    expect(estimateBytes(1, 'wav')).toBe(44100 * 2 * 2);
    expect(estimateBytes(60, 'wav')).toBe(44100 * 2 * 2 * 60);
  });

  it('uses the constant bitrate FFmpeg defaults to for MP3', () => {
    expect(estimateBytes(60, 'mp3')).toBe(960_000);
  });

  it('declines to guess at the formats that compress silence away', () => {
    // AAC encodes digital silence at about 5 kbps, not the 128 kbps a CBR
    // estimate would assume, and FLAC packs it down even further.
    expect(estimateBytes(60, 'flac')).toBeNull();
    expect(estimateBytes(60, 'm4a')).toBeNull();
  });
});
