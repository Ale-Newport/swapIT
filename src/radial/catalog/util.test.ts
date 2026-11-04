import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/core/types';
import { describeSelection, dirOf, missing, pluralize, shortLabel, stemOf, targetFolder } from './util';

const f = (name: string, kind: FileInfo['kind'], isDir = false): FileInfo => ({
  path: `/a/${name}`,
  name,
  stem: name,
  extension: '',
  mime: '',
  kind,
  size: 1,
  isDir,
});

describe('shortLabel', () => {
  it('leaves short names alone', () => {
    expect(shortLabel('Compress')).toBe('Compress');
  });

  it('drops filler words first', () => {
    expect(shortLabel('Merge the PDF files together')).toBe('Merge PDF…');
    expect(shortLabel('Compress files into a ZIP')).toBe('Compress into…');
    expect(shortLabel('Merge PDFs')).toBe('Merge PDFs');
  });

  it('cuts at a word boundary with an ellipsis when it must', () => {
    const out = shortLabel('Extract Archive Contents Somewhere');
    expect(out.length).toBeLessThanOrEqual(16);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('Somewhere');
  });

  it('never returns empty', () => {
    expect(shortLabel('The', 2).length).toBeGreaterThan(0);
  });
});

describe('selection helpers', () => {
  it('pluralises with a thousands separator', () => {
    expect(pluralize(1, 'file')).toBe('1 file');
    expect(pluralize(1234, 'file')).toBe('1,234 files');
    expect(pluralize(2, 'audio file', 'audio files')).toBe('2 audio files');
  });

  it('describes a selection the way a person would', () => {
    expect(describeSelection([])).toBe('Nothing selected');
    expect(describeSelection([f('a.png', 'image')])).toBe('a.png');
    expect(describeSelection([f('a.png', 'image'), f('b.png', 'image')])).toBe('2 images');
    expect(describeSelection([f('a.png', 'image'), f('b.mp4', 'video')])).toBe('2 items');
  });

  it('knows where to create things', () => {
    expect(targetFolder({ files: [], folder: '/x' })).toBe('/x');
    expect(targetFolder({ files: [f('a.png', 'image')], folder: null })).toBe('/a');
    expect(targetFolder({ files: [f('Photos', 'folder', true)], folder: null })).toBe('/a/Photos');
    expect(targetFolder({ files: [], folder: null })).toBeNull();
  });

  it('reports the first missing program once', () => {
    expect(missing({ ffmpeg: false, ffprobe: false }, 'ffmpeg', 'ffprobe')).toBe('Needs FFmpeg');
    expect(missing({ ffmpeg: true }, 'ffmpeg')).toBeUndefined();
    // Unknown means "not checked yet" — never claim a program is missing without knowing.
    expect(missing({}, 'ffmpeg')).toBeUndefined();
  });

  it('splits paths', () => {
    expect(dirOf('/a/b/c.txt')).toBe('/a/b');
    expect(dirOf('/c.txt')).toBe('/');
    expect(stemOf('archive.tar.gz')).toBe('archive.tar');
    expect(stemOf('.env')).toBe('.env');
  });
});
