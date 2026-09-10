import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  extname,
  formatBytes,
  formatDuration,
  formatLongDuration,
  formatTimecode,
  parseTimecode,
  shortenPath,
  sizeDelta,
} from './format';

describe('formatBytes', () => {
  it('uses binary units like Finder', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 3 * 2.5)).toBe('2.5 GB');
  });

  it('handles missing values without crashing a table cell', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });

  it('never renders a fractional byte count', () => {
    expect(formatBytes(999)).toBe('999 B');
  });
});

describe('duration formatting', () => {
  it('drops the hour segment when it is zero', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(null)).toBe('—');
  });

  it('produces frame-accurate timecodes', () => {
    expect(formatTimecode(3661.5)).toBe('01:01:01');
    expect(formatTimecode(3661.5, true)).toBe('01:01:01.500');
  });

  it('spells out long spans', () => {
    expect(formatLongDuration(928374)).toBe('10 days, 17 hours, 52 minutes, 54 seconds');
    expect(formatLongDuration(0)).toBe('0 seconds');
    expect(formatLongDuration(1)).toBe('1 second');
  });
});

describe('parseTimecode', () => {
  it('accepts the notations people actually type', () => {
    expect(parseTimecode('90')).toBe(90);
    expect(parseTimecode('1:30')).toBe(90);
    expect(parseTimecode('01:01:01')).toBe(3661);
    expect(parseTimecode('1m30s')).toBe(90);
    expect(parseTimecode('1h2m3s')).toBe(3723);
    expect(parseTimecode('2.5')).toBe(2.5);
  });

  it('rejects nonsense rather than guessing', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:2:3:4')).toBeNull();
    expect(parseTimecode('1:xx')).toBeNull();
  });
});

describe('path helpers', () => {
  it('splits paths the way the UI needs', () => {
    expect(basename('/Users/me/Pictures/photo.heic')).toBe('photo.heic');
    expect(dirname('/Users/me/Pictures/photo.heic')).toBe('/Users/me/Pictures');
    expect(extname('/Users/me/Pictures/photo.HEIC')).toBe('heic');
    expect(extname('/Users/me/.gitignore')).toBe('');
    expect(extname('/Users/me/archive.tar.gz')).toBe('gz');
  });

  it('shortens long paths from the end', () => {
    expect(shortenPath('/a/b/c/d/e.jpg')).toBe('…/c/d/e.jpg');
    expect(shortenPath('/a/b.jpg')).toBe('/a/b.jpg');
  });
});

describe('sizeDelta', () => {
  it('reports compression as a percentage smaller', () => {
    const d = sizeDelta(8_400_000, 1_700_000);
    expect(d.smaller).toBe(true);
    expect(d.label).toBe('79.8% smaller');
  });

  it('reports growth honestly', () => {
    const d = sizeDelta(100, 150);
    expect(d.smaller).toBe(false);
    expect(d.label).toBe('50.0% larger');
  });

  it('does not divide by zero', () => {
    expect(sizeDelta(0, 100).label).toBe('—');
  });
});
