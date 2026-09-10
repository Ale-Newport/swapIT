import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/core/types';
import { defaultFlattenDestination, parentDirOf, planFlatten } from './logic';

function file(path: string, size = 10): FileInfo {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return {
    path,
    name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
    mime: 'application/octet-stream',
    kind: 'other',
    size,
    isDir: false,
  };
}

describe('defaultFlattenDestination', () => {
  it('mirrors the backend default of a _flattened subfolder', () => {
    expect(defaultFlattenDestination('/Users/me/Photos')).toBe('/Users/me/Photos/_flattened');
  });

  it('does not double the separator when the folder has a trailing slash', () => {
    expect(defaultFlattenDestination('/Users/me/Photos/')).toBe('/Users/me/Photos/_flattened');
  });
});

describe('parentDirOf', () => {
  it('returns the containing folder', () => {
    expect(parentDirOf('/a/b/c.txt')).toBe('/a/b');
  });

  it('keeps the root readable rather than collapsing to an empty string', () => {
    expect(parentDirOf('/c.txt')).toBe('/');
  });

  it('ignores a trailing slash on a folder path', () => {
    expect(parentDirOf('/a/b/')).toBe('/a');
  });
});

describe('planFlatten', () => {
  const dest = '/root/_flattened';

  it('counts files and bytes across every depth', () => {
    const plan = planFlatten(
      [file('/root/a.txt', 100), file('/root/one/b.txt', 200), file('/root/one/two/c.txt', 300)],
      dest,
    );
    expect(plan.fileCount).toBe(3);
    expect(plan.totalSize).toBe(600);
    expect(plan.renamedCount).toBe(0);
  });

  it('excludes files already sitting in the destination, as the backend does', () => {
    const plan = planFlatten([file('/root/a.txt'), file(`${dest}/old.txt`)], dest);
    expect(plan.fileCount).toBe(1);
    expect(plan.skippedInDestination).toBe(1);
  });

  it('still counts files nested deeper inside the destination folder', () => {
    // The backend only skips direct children of the destination.
    const plan = planFlatten([file(`${dest}/deeper/x.txt`)], dest);
    expect(plan.fileCount).toBe(1);
    expect(plan.skippedInDestination).toBe(0);
  });

  it('reports how many files will be renamed rather than overwritten', () => {
    const plan = planFlatten(
      [file('/root/a/IMG_1.jpg'), file('/root/b/IMG_1.jpg'), file('/root/c/IMG_1.jpg'), file('/root/d/other.jpg')],
      dest,
    );
    expect(plan.renamedCount).toBe(2);
    expect(plan.duplicateNames).toEqual([{ name: 'IMG_1.jpg', count: 3 }]);
  });

  it('orders duplicate names by how contested they are', () => {
    const plan = planFlatten(
      [
        file('/root/a/one.txt'),
        file('/root/b/one.txt'),
        file('/root/c/two.txt'),
        file('/root/d/two.txt'),
        file('/root/e/two.txt'),
      ],
      dest,
    );
    expect(plan.duplicateNames.map((d) => d.name)).toEqual(['two.txt', 'one.txt']);
  });

  it('flags a truncated scan so the count is presented as a lower bound', () => {
    const files = Array.from({ length: 5 }, (_, i) => file(`/root/f${i}.txt`));
    expect(planFlatten(files, dest, 5).truncated).toBe(true);
    expect(planFlatten(files, dest, 6).truncated).toBe(false);
  });

  it('handles an empty folder without inventing work', () => {
    const plan = planFlatten([], dest);
    expect(plan).toMatchObject({ fileCount: 0, totalSize: 0, renamedCount: 0, duplicateNames: [] });
  });
});
