import { describe, expect, it } from 'vitest';
import {
  archiveTotals,
  defaultExtractFolderName,
  supportedArchiveKind,
  topLevelNames,
  type ArchiveEntry,
} from './logic';

const entry = (name: string, size: number, compressed: number, isDir = false): ArchiveEntry => ({
  name,
  size,
  compressed,
  isDir,
});

describe('archiveTotals', () => {
  it('counts files and folders separately and sums only the files', () => {
    const totals = archiveTotals([
      entry('docs/', 0, 0, true),
      entry('docs/a.txt', 1000, 400),
      entry('docs/b.txt', 1000, 600),
    ]);
    expect(totals.files).toBe(2);
    expect(totals.folders).toBe(1);
    expect(totals.size).toBe(2000);
    expect(totals.compressed).toBe(1000);
    expect(totals.ratio).toBeCloseTo(0.5);
  });

  it('refuses to report a ratio for TAR, where compressed size is just the size', () => {
    const totals = archiveTotals([entry('a.txt', 1000, 1000), entry('b.txt', 500, 500)]);
    expect(totals.reportsCompression).toBe(false);
    expect(totals.ratio).toBeNull();
  });

  it('handles an archive of empty files without dividing by zero', () => {
    const totals = archiveTotals([entry('empty.txt', 0, 0)]);
    expect(totals.ratio).toBeNull();
    expect(totals.files).toBe(1);
  });

  it('reports zero for an empty archive', () => {
    expect(archiveTotals([])).toEqual({
      files: 0,
      folders: 0,
      size: 0,
      compressed: 0,
      ratio: null,
      reportsCompression: false,
    });
  });

  it('allows a negative-saving ratio rather than hiding that the archive grew', () => {
    const totals = archiveTotals([entry('a.jpg', 1000, 1100)]);
    expect(totals.ratio).toBeCloseTo(-0.1);
  });
});

describe('supportedArchiveKind', () => {
  it('recognises the three formats the backend can read', () => {
    expect(supportedArchiveKind('photos.zip')).toBe('zip');
    expect(supportedArchiveKind('PHOTOS.ZIP')).toBe('zip');
    expect(supportedArchiveKind('src.tar')).toBe('tar');
    expect(supportedArchiveKind('src.tar.gz')).toBe('tar.gz');
    expect(supportedArchiveKind('src.tgz')).toBe('tar.gz');
  });

  it('rejects a bare .gz stream, which is a single compressed file and not an archive', () => {
    expect(supportedArchiveKind('database.sql.gz')).toBeNull();
    expect(supportedArchiveKind('notes.txt')).toBeNull();
  });
});

describe('defaultExtractFolderName', () => {
  it('drops the archive extension and lower-cases, as the backend does', () => {
    expect(defaultExtractFolderName('Holiday Photos.ZIP')).toBe('holiday photos');
    expect(defaultExtractFolderName('project.tar.gz')).toBe('project');
    expect(defaultExtractFolderName('project.tgz')).toBe('project');
  });

  it('never returns an empty folder name', () => {
    expect(defaultExtractFolderName('.zip')).toBe('.zip');
  });
});

describe('topLevelNames', () => {
  it('collapses an archive with a single wrapping folder to one name', () => {
    expect(topLevelNames([entry('app/', 0, 0, true), entry('app/src/main.rs', 10, 5)])).toEqual(['app']);
  });

  it('lists every top-level item when the archive would spill', () => {
    expect(topLevelNames([entry('a.txt', 1, 1), entry('./b.txt', 1, 1)])).toEqual(['a.txt', 'b.txt']);
  });
});
