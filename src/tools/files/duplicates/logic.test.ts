import { describe, expect, it } from 'vitest';
import {
  extraCopies,
  folderOf,
  fullySelectedGroups,
  selectionBytes,
  shortHash,
  sizeIndex,
  toBytes,
  totalCopies,
  type DuplicateGroup,
} from './logic';

const groups: DuplicateGroup[] = [
  { hash: 'aaaa1111bbbb2222', size: 1000, files: ['/a/one.jpg', '/b/one.jpg', '/c/one.jpg'], wasted: 2000 },
  { hash: 'cccc3333', size: 500, files: ['/a/two.pdf', '/b/two.pdf'], wasted: 500 },
];

describe('toBytes', () => {
  it('converts the chosen unit', () => {
    expect(toBytes(1, 'KB')).toBe(1024);
    expect(toBytes(2.5, 'MB')).toBe(2621440);
    expect(toBytes(700, 'B')).toBe(700);
  });

  it('never lets the floor reach zero, where every empty file matches every other', () => {
    expect(toBytes(0, 'MB')).toBe(1);
    expect(toBytes(-5, 'KB')).toBe(1);
    expect(toBytes(Number.NaN, 'KB')).toBe(1);
  });

  it('rounds fractional byte counts', () => {
    expect(toBytes(1.4, 'B')).toBe(1);
    expect(toBytes(1.6, 'B')).toBe(2);
  });
});

describe('extraCopies', () => {
  it('keeps the first file of each group and lists the rest', () => {
    expect(extraCopies(groups)).toEqual(['/b/one.jpg', '/c/one.jpg', '/b/two.pdf']);
  });

  it('returns nothing for an empty report', () => {
    expect(extraCopies([])).toEqual([]);
  });
});

describe('totalCopies', () => {
  it('counts every file across every group', () => {
    expect(totalCopies(groups)).toBe(5);
  });
});

describe('sizeIndex', () => {
  it('maps every path to the size of its group', () => {
    const index = sizeIndex(groups);
    expect(index.get('/c/one.jpg')).toBe(1000);
    expect(index.get('/b/two.pdf')).toBe(500);
    expect(index.size).toBe(5);
  });
});

describe('selectionBytes', () => {
  it('adds up only the selected paths', () => {
    expect(selectionBytes(groups, new Set(['/b/one.jpg', '/b/two.pdf']))).toBe(1500);
  });

  it('ignores paths that are not part of the report', () => {
    expect(selectionBytes(groups, new Set(['/nowhere.txt']))).toBe(0);
  });
});

describe('fullySelectedGroups', () => {
  it('flags a group where no copy would be left behind', () => {
    expect(fullySelectedGroups(groups, new Set(['/a/two.pdf', '/b/two.pdf']))).toBe(1);
  });

  it('does not flag a group that still keeps one copy', () => {
    expect(fullySelectedGroups(groups, new Set(['/b/two.pdf']))).toBe(0);
  });
});

describe('folderOf', () => {
  it('drops the file name', () => {
    expect(folderOf('/Users/me/Pictures/a.jpg')).toBe('/Users/me/Pictures');
  });

  it('reports the root for a top-level file', () => {
    expect(folderOf('/a.jpg')).toBe('/');
  });
});

describe('shortHash', () => {
  it('truncates long digests but leaves short ones alone', () => {
    expect(shortHash('a'.repeat(64), 8)).toBe('aaaaaaaa');
    expect(shortHash('abc', 8)).toBe('abc');
  });
});
