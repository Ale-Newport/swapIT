import { describe, expect, it } from 'vitest';
import {
  barWidth,
  kindLabel,
  kindSegments,
  rampClass,
  share,
  sortEntries,
  REST_KIND,
  type FolderEntry,
} from './logic';

const entries: FolderEntry[] = [
  { path: '/root/Photos', name: 'Photos', size: 500, isDir: true, fileCount: 40 },
  { path: '/root/notes.txt', name: 'notes.txt', size: 10, isDir: false, fileCount: 1 },
  { path: '/root/Video', name: 'Video', size: 9000, isDir: true, fileCount: 3 },
];

describe('share', () => {
  it('turns a part into a percentage', () => {
    expect(share(25, 100)).toBe(25);
  });

  it('never divides by zero', () => {
    expect(share(10, 0)).toBe(0);
  });

  it('clamps a part larger than the whole', () => {
    expect(share(120, 100)).toBe(100);
  });
});

describe('barWidth', () => {
  it('keeps a sliver visible instead of rendering nothing', () => {
    expect(barWidth(1, 100_000)).toBe('0.6%');
  });

  it('renders nothing at all for an empty slice', () => {
    expect(barWidth(0, 100)).toBe('0%');
  });

  it('leaves ordinary shares alone', () => {
    expect(barWidth(50, 200)).toBe('25%');
  });
});

describe('sortEntries', () => {
  it('sorts by size, largest first', () => {
    expect(sortEntries(entries, 'size', 'desc').map((e) => e.name)).toEqual(['Video', 'Photos', 'notes.txt']);
  });

  it('sorts by size ascending when asked', () => {
    expect(sortEntries(entries, 'size', 'asc').map((e) => e.name)).toEqual(['notes.txt', 'Photos', 'Video']);
  });

  it('sorts names naturally', () => {
    const numbered: FolderEntry[] = [
      { path: '/a/10', name: 'part10', size: 1, isDir: false, fileCount: 1 },
      { path: '/a/2', name: 'part2', size: 1, isDir: false, fileCount: 1 },
    ];
    expect(sortEntries(numbered, 'name', 'asc').map((e) => e.name)).toEqual(['part2', 'part10']);
  });

  it('sorts by file count', () => {
    expect(sortEntries(entries, 'files', 'desc').map((e) => e.name)).toEqual(['Photos', 'Video', 'notes.txt']);
  });

  it('does not modify the array it was given', () => {
    const copy = [...entries];
    sortEntries(entries, 'size', 'asc');
    expect(entries).toEqual(copy);
  });
});

describe('kindSegments', () => {
  const byKind: Array<[string, number, number]> = [
    ['video', 800, 4],
    ['image', 150, 200],
    ['audio', 30, 10],
    ['pdf', 10, 3],
    ['code', 5, 60],
    ['text', 3, 12],
    ['data', 2, 5],
  ];

  it('folds the long tail into one slice', () => {
    const segments = kindSegments(byKind, 1000, 3);
    expect(segments.map((s) => s.kind)).toEqual(['video', 'image', REST_KIND]);
    expect(segments[2].bytes).toBe(30 + 10 + 5 + 3 + 2);
    expect(segments[2].count).toBe(10 + 3 + 60 + 12 + 5);
    expect(segments[2].label).toBe('5 other kinds');
  });

  it('keeps the folded slice distinct from the real "other" kind', () => {
    const withOther: Array<[string, number, number]> = [...byKind, ['other', 20, 7]];
    const kinds = kindSegments(withOther, 1020, 3).map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('adds up to the whole', () => {
    const segments = kindSegments(byKind, 1000, 4);
    const total = segments.reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('drops kinds that take up no space at all', () => {
    expect(kindSegments([['image', 0, 3]], 0)).toEqual([]);
  });

  it('keeps every kind when they all fit', () => {
    expect(kindSegments(byKind, 1000, 8).map((s) => s.kind)).toEqual([
      'video',
      'image',
      'audio',
      'pdf',
      'code',
      'text',
      'data',
    ]);
  });
});

describe('rampClass', () => {
  it('stays inside the ramp for a large index', () => {
    expect(rampClass(99)).toBe(rampClass(7));
  });
});

describe('kindLabel', () => {
  it('names the known kinds and capitalises unknown ones', () => {
    expect(kindLabel('image')).toBe('Images');
    expect(kindLabel('sketch')).toBe('Sketch');
  });
});
