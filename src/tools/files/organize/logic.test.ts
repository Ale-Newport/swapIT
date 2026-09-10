import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/core/types';
import { bucketFor, groupForOrganize, kindForExtension, totalOf } from './logic';

function file(name: string, size = 1): FileInfo {
  const dot = name.lastIndexOf('.');
  return {
    path: `/root/${name}`,
    name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
    mime: 'application/octet-stream',
    kind: 'other',
    size,
    isDir: false,
  };
}

describe('kindForExtension', () => {
  it('matches the backend classification for the common types', () => {
    expect(kindForExtension('heic')).toBe('image');
    expect(kindForExtension('MP4')).toBe('video');
    expect(kindForExtension('.flac')).toBe('audio');
    expect(kindForExtension('pdf')).toBe('pdf');
    expect(kindForExtension('svg')).toBe('svg');
    expect(kindForExtension('zip')).toBe('archive');
    expect(kindForExtension('rs')).toBe('code');
    expect(kindForExtension('json')).toBe('data');
    expect(kindForExtension('xyz')).toBe('other');
    expect(kindForExtension('')).toBe('other');
  });
});

describe('bucketFor', () => {
  it('folds related kinds into the seven category folders', () => {
    expect(bucketFor('png', true)).toBe('Images');
    expect(bucketFor('svg', true)).toBe('Images');
    expect(bucketFor('mov', true)).toBe('Videos');
    expect(bucketFor('wav', true)).toBe('Audio');
    expect(bucketFor('pdf', true)).toBe('Documents');
    expect(bucketFor('docx', true)).toBe('Documents');
    expect(bucketFor('md', true)).toBe('Documents');
    expect(bucketFor('tar', true)).toBe('Archives');
    expect(bucketFor('ts', true)).toBe('Code');
    expect(bucketFor('csv', true)).toBe('Code');
    expect(bucketFor('ttf', true)).toBe('Other');
    expect(bucketFor('', true)).toBe('Other');
  });

  it('uses the upper-case extension when grouping by extension', () => {
    expect(bucketFor('jpg', false)).toBe('JPG');
    expect(bucketFor('.JPG', false)).toBe('JPG');
    expect(bucketFor('', false)).toBe('Other');
  });
});

describe('groupForOrganize', () => {
  const files = [
    file('a.jpg', 100),
    file('b.png', 200),
    file('clip.mov', 5000),
    file('notes.md', 10),
    file('.hidden', 1),
    { ...file('subfolder'), isDir: true },
  ];

  it('counts and sizes each bucket', () => {
    const groups = groupForOrganize(files, true);
    expect(groups.map((g) => [g.bucket, g.count, g.size])).toEqual([
      ['Images', 2, 300],
      ['Videos', 1, 5000],
      ['Documents', 1, 10],
    ]);
  });

  it('skips dotfiles and folders, which the backend also leaves alone', () => {
    const total = totalOf(groupForOrganize(files, true));
    expect(total.count).toBe(4);
  });

  it('orders by file count, then by size, so the busiest bucket leads', () => {
    const groups = groupForOrganize(files, true);
    expect(groups[0].bucket).toBe('Images');
    // Videos and Documents both hold one file, so the larger one wins the tie.
    expect(groups[1].bucket).toBe('Videos');
  });

  it('splits by extension in extension mode', () => {
    const groups = groupForOrganize(files, false);
    expect(groups.map((g) => g.bucket).sort()).toEqual(['JPG', 'MD', 'MOV', 'PNG']);
  });

  it('keeps up to three example names per bucket', () => {
    const many = ['1.jpg', '2.jpg', '3.jpg', '4.jpg'].map((n) => file(n));
    expect(groupForOrganize(many, true)[0].examples).toEqual(['1.jpg', '2.jpg', '3.jpg']);
  });

  it('returns nothing for an empty folder', () => {
    expect(groupForOrganize([], true)).toEqual([]);
    expect(totalOf([])).toEqual({ count: 0, size: 0 });
  });
});
