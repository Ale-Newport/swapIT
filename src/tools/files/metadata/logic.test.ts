import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/core/types';
import {
  buildReport,
  formatTimestamp,
  groupEntries,
  hasLocation,
  isoTimestamp,
  reportToTsv,
  sortFiles,
} from './logic';

const file = (patch: Partial<FileInfo>): FileInfo => ({
  path: '/photos/a.jpg',
  name: 'a.jpg',
  stem: 'a',
  extension: 'jpg',
  mime: 'image/jpeg',
  kind: 'image',
  size: 1000,
  isDir: false,
  created: 1_700_000_000,
  modified: 1_700_000_500,
  ...patch,
});

describe('formatTimestamp', () => {
  it('shows an em dash when the filesystem reported nothing', () => {
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp(undefined)).toBe('—');
    expect(formatTimestamp(0)).toBe('—');
  });

  it('renders a real timestamp', () => {
    expect(formatTimestamp(1_700_000_000)).not.toBe('—');
  });
});

describe('isoTimestamp', () => {
  it('converts seconds to an ISO string', () => {
    expect(isoTimestamp(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z');
  });

  it('is null when there is no date', () => {
    expect(isoTimestamp(null)).toBeNull();
  });
});

describe('sortFiles', () => {
  const files = [
    file({ name: 'b.jpg', size: 30, modified: 300, kind: 'image' }),
    file({ name: 'a.pdf', size: 100, modified: 100, kind: 'pdf' }),
    file({ name: 'c.txt', size: 50, modified: 200, kind: 'text' }),
  ];

  it('sorts by size, largest first', () => {
    expect(sortFiles(files, 'size', 'desc').map((f) => f.name)).toEqual(['a.pdf', 'c.txt', 'b.jpg']);
  });

  it('sorts by modification date, oldest first', () => {
    expect(sortFiles(files, 'modified', 'asc').map((f) => f.name)).toEqual(['a.pdf', 'c.txt', 'b.jpg']);
  });

  it('treats a missing date as the oldest', () => {
    const withMissing = [...files, file({ name: 'z.bin', modified: null })];
    expect(sortFiles(withMissing, 'modified', 'asc')[0].name).toBe('z.bin');
  });

  it('sorts names naturally and leaves the input alone', () => {
    const copy = [...files];
    expect(sortFiles(files, 'name', 'asc').map((f) => f.name)).toEqual(['a.pdf', 'b.jpg', 'c.txt']);
    expect(files).toEqual(copy);
  });
});

describe('groupEntries', () => {
  it('buckets tags by group, keeping the order they arrived in', () => {
    const groups = groupEntries([
      { group: 'EXIF', tag: 'Make', value: 'Apple' },
      { group: 'File', tag: 'Size', value: '1 MB' },
      { group: 'EXIF', tag: 'Model', value: 'iPhone' },
    ]);
    expect(groups.map((g) => g.name)).toEqual(['EXIF', 'File']);
    expect(groups[0].entries.map((e) => e.tag)).toEqual(['Make', 'Model']);
  });

  it('files nameless groups under Other', () => {
    expect(groupEntries([{ group: '  ', tag: 'X', value: '1' }])[0].name).toBe('Other');
  });
});

describe('hasLocation', () => {
  it('spots GPS tags whatever their casing', () => {
    expect(hasLocation([{ group: 'GPS', tag: 'GPSLatitude', value: '1' }])).toBe(true);
    expect(hasLocation([{ group: 'EXIF', tag: 'longitude ref', value: 'E' }])).toBe(true);
  });

  it('is false for ordinary camera tags', () => {
    expect(hasLocation([{ group: 'EXIF', tag: 'Model', value: 'iPhone' }])).toBe(false);
  });
});

describe('buildReport', () => {
  it('describes every file and folds in the metadata that was read', () => {
    const report = buildReport([file({})], {
      '/photos/a.jpg': [{ group: 'EXIF', tag: 'Make', value: 'Apple' }],
    });
    expect(report[0]).toMatchObject({ name: 'a.jpg', bytes: 1000, kind: 'image' });
    expect(report[0].metadata).toEqual({ 'EXIF:Make': 'Apple' });
  });

  it('omits the metadata key entirely when none was read', () => {
    expect(buildReport([file({})], {})[0].metadata).toBeUndefined();
  });
});

describe('reportToTsv', () => {
  it('writes a header plus one row per file', () => {
    const tsv = reportToTsv([file({}), file({ name: 'b.jpg', path: '/photos/b.jpg' })]);
    const lines = tsv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].split('\t')[0]).toBe('Name');
    expect(lines[1].split('\t')).toContain('/photos/a.jpg');
  });
});
