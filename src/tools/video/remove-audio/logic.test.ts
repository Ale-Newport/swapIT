import { describe, expect, it } from 'vitest';
import { channelLabel, describeAudioStream, formatBitrate, summarise, summaryLine, type AudioState } from './logic';

describe('channelLabel', () => {
  it('names the common layouts', () => {
    expect(channelLabel(1)).toBe('mono');
    expect(channelLabel(2)).toBe('stereo');
    expect(channelLabel(6)).toBe('5.1');
    expect(channelLabel(8)).toBe('7.1');
    expect(channelLabel(3)).toBe('3 channels');
  });

  it('returns null when ffprobe reported nothing usable', () => {
    expect(channelLabel(null)).toBeNull();
    expect(channelLabel(undefined)).toBeNull();
    expect(channelLabel(0)).toBeNull();
  });
});

describe('formatBitrate', () => {
  it('switches to Mbps above a million bits', () => {
    expect(formatBitrate(192_000)).toBe('192 kbps');
    expect(formatBitrate(1_500_000)).toBe('1.5 Mbps');
  });

  it('ignores missing or zero bitrates', () => {
    expect(formatBitrate(null)).toBeNull();
    expect(formatBitrate(0)).toBeNull();
    expect(formatBitrate(Number.NaN)).toBeNull();
  });
});

describe('describeAudioStream', () => {
  it('joins whatever ffprobe reported', () => {
    expect(describeAudioStream({ codec: 'aac', channels: 2, bitrate: 192_000 })).toBe('AAC · stereo · 192 kbps');
  });

  it('drops missing parts instead of showing gaps', () => {
    expect(describeAudioStream({ codec: 'opus', channels: null, bitrate: null })).toBe('OPUS');
    expect(describeAudioStream({})).toBe('Audio track');
  });

  it('says so when there is no track at all', () => {
    expect(describeAudioStream(null)).toBe('No audio track');
    expect(describeAudioStream(undefined)).toBe('No audio track');
  });
});

describe('summarise', () => {
  it('counts each state and treats everything but a known-silent file as actionable', () => {
    const states: AudioState[] = ['has-audio', 'has-audio', 'silent', 'unknown', 'checking'];
    expect(summarise(states)).toEqual({
      withAudio: 2,
      silent: 1,
      unknown: 1,
      checking: 1,
      actionable: 4,
    });
  });

  it('handles an empty selection', () => {
    expect(summarise([])).toEqual({ withAudio: 0, silent: 0, unknown: 0, checking: 0, actionable: 0 });
  });
});

describe('summaryLine', () => {
  it('reports progress while probing', () => {
    expect(summaryLine(summarise(['has-audio', 'checking']))).toBe('Checking 1 more file…');
  });

  it('warns when nothing can be done', () => {
    expect(summaryLine(summarise(['silent', 'silent']))).toContain('nothing to remove');
  });

  it('breaks the selection down once every file is known', () => {
    const line = summaryLine(summarise(['has-audio', 'silent', 'unknown']));
    expect(line).toBe('1 with sound · 1 already silent (skipped) · 1 unreadable (tried anyway)');
  });

  it('prompts for files when the list is empty', () => {
    expect(summaryLine(summarise([]))).toMatch(/Add videos/);
  });
});
