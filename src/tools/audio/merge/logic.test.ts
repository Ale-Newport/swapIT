import { describe, expect, it } from 'vitest';
import {
  type TrackSummary,
  buildIntermediateOps,
  checkCompatibility,
  mergedName,
  startOffsets,
} from './logic';

function track(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    path: '/a.mp3',
    extension: 'mp3',
    duration: 60,
    codec: 'mp3',
    sampleRate: 44100,
    channels: 2,
    ...overrides,
  };
}

describe('checkCompatibility', () => {
  it('accepts identical files', () => {
    const result = checkCompatibility([track(), track({ path: '/b.mp3' })]);
    expect(result.copyable).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('does not call a single file incompatible with itself', () => {
    expect(checkCompatibility([track()]).copyable).toBe(true);
  });

  it('never guesses from files FFprobe could not read', () => {
    const unreadable = track({ path: '/b.mp3', codec: '', sampleRate: 0, channels: 0 });
    expect(checkCompatibility([track(), unreadable]).copyable).toBe(true);
  });

  it('reports each kind of difference separately', () => {
    const result = checkCompatibility([
      track(),
      track({ path: '/b.wav', extension: 'wav', codec: 'pcm_s16le', sampleRate: 48000, channels: 1 }),
    ]);
    expect(result.copyable).toBe(false);
    expect(result.reasons).toHaveLength(4);
    expect(result.reasons.join(' ')).toMatch(/containers/);
    expect(result.reasons.join(' ')).toMatch(/48 kHz/);
    expect(result.channelsDiffer).toBe(true);
  });

  it('flags a channel mismatch on its own, since a copy-join cannot bridge it', () => {
    const result = checkCompatibility([track(), track({ path: '/b.mp3', channels: 1 })]);
    expect(result.channelsDiffer).toBe(true);
    expect(result.copyable).toBe(false);
    expect(result.reasons).toEqual(['different channel counts (2 and 1)']);
  });
});

describe('buildIntermediateOps', () => {
  it('drops artwork and pins the rate so every intermediate matches', () => {
    expect(buildIntermediateOps('mp3', 44100, false)).toEqual({
      format: 'mp3',
      audioOnly: true,
      sampleRate: 44100,
    });
  });

  it('adds the downmix when the channel counts have to be forced together', () => {
    expect(buildIntermediateOps('wav', 48000, true)).toMatchObject({ toMono: true, sampleRate: 48000 });
  });

  it('refuses a format that is not offered', () => {
    expect(() => buildIntermediateOps('opus', 48000, false)).toThrow(/merged through/);
  });
});

describe('startOffsets', () => {
  it('accumulates each track’s start time', () => {
    expect(startOffsets([{ duration: 30 }, { duration: 90 }, { duration: 10 }])).toEqual([0, 30, 120]);
  });

  it('treats an unknown length as zero rather than NaN', () => {
    expect(startOffsets([{ duration: Number.NaN }, { duration: 20 }])).toEqual([0, 0]);
  });
});

describe('mergedName', () => {
  it('drops the extension and appends the suffix', () => {
    expect(mergedName('chapter 01.mp3')).toBe('chapter 01-merged');
  });

  it('copes with a name that has no extension', () => {
    expect(mergedName('recording')).toBe('recording-merged');
  });
});
