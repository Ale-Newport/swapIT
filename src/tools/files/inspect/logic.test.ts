import { describe, expect, it } from 'vitest';
import type { FileInfo } from '@/core/types';
import {
  MAX_TEXT_PREVIEW_BYTES,
  buildTextPreview,
  canPreviewImage,
  canPreviewText,
  humanKind,
  streamLabel,
  summarizeArchive,
  type ArchiveEntry,
  type StreamInfo,
} from './logic';

const file = (patch: Partial<FileInfo>): FileInfo => ({
  path: '/x/a.txt',
  name: 'a.txt',
  stem: 'a',
  extension: 'txt',
  mime: 'text/plain',
  kind: 'text',
  size: 100,
  isDir: false,
  created: null,
  modified: null,
  ...patch,
});

describe('canPreviewText', () => {
  it('previews small text, data and code files', () => {
    expect(canPreviewText(file({}))).toBe(true);
    expect(canPreviewText(file({ kind: 'data', extension: 'json' }))).toBe(true);
    expect(canPreviewText(file({ kind: 'code', extension: 'ts' }))).toBe(true);
  });

  it('refuses a file too large to pull into the window', () => {
    expect(canPreviewText(file({ size: MAX_TEXT_PREVIEW_BYTES + 1 }))).toBe(false);
  });

  it('refuses empty files, folders and binary kinds', () => {
    expect(canPreviewText(file({ size: 0 }))).toBe(false);
    expect(canPreviewText(file({ isDir: true }))).toBe(false);
    expect(canPreviewText(file({ kind: 'video', extension: 'mp4' }))).toBe(false);
  });
});

describe('canPreviewImage', () => {
  it('accepts formats a browser can decode, whatever the casing', () => {
    expect(canPreviewImage(file({ extension: 'PNG' }))).toBe(true);
    expect(canPreviewImage(file({ extension: 'svg' }))).toBe(true);
  });

  it('rejects camera formats the browser cannot show', () => {
    expect(canPreviewImage(file({ extension: 'heic' }))).toBe(false);
    expect(canPreviewImage(file({ extension: 'cr2' }))).toBe(false);
  });
});

describe('buildTextPreview', () => {
  it('keeps short text as it is', () => {
    expect(buildTextPreview('one\ntwo')).toEqual({ text: 'one\ntwo', truncated: false, binary: false });
  });

  it('cuts at the line limit and says so', () => {
    const preview = buildTextPreview('a\nb\nc\nd', 2);
    expect(preview.text).toBe('a\nb');
    expect(preview.truncated).toBe(true);
  });

  it('flags content with NUL bytes as binary instead of showing mojibake', () => {
    const preview = buildTextPreview('PK\u0003\u0000\u0000 nonsense');
    expect(preview.binary).toBe(true);
    expect(preview.text).toBe('');
  });
});

describe('summarizeArchive', () => {
  const entries: ArchiveEntry[] = [
    { name: 'docs/', size: 0, compressed: 0, isDir: true },
    { name: 'docs/a.txt', size: 1000, compressed: 300, isDir: false },
    { name: 'docs/b.txt', size: 1000, compressed: 700, isDir: false },
  ];

  it('counts files and folders separately and totals only the files', () => {
    const summary = summarizeArchive(entries);
    expect(summary).toMatchObject({ files: 2, folders: 1, uncompressed: 2000, compressed: 1000 });
    expect(summary.savings).toBeCloseTo(50, 5);
  });

  it('reports no savings for an empty archive rather than dividing by zero', () => {
    expect(summarizeArchive([]).savings).toBe(0);
  });

  it('never reports negative savings when storing costs more than the original', () => {
    expect(summarizeArchive([{ name: 'a', size: 100, compressed: 140, isDir: false }]).savings).toBe(0);
  });
});

describe('streamLabel', () => {
  const stream = (patch: Partial<StreamInfo>): StreamInfo => ({
    index: 0,
    kind: 'video',
    codec: 'h264',
    codecLong: 'H.264',
    ...patch,
  });

  it('describes a video stream with its resolution and frame rate', () => {
    expect(streamLabel(stream({ width: 1920, height: 1080, fps: 29.97 }))).toBe('h264 · 1920×1080 · 29.97 fps');
  });

  it('describes an audio stream with its sample rate and channels', () => {
    expect(streamLabel(stream({ kind: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 }))).toBe(
      'aac · 48.0 kHz · 2 ch',
    );
  });

  it('falls back to the codec alone when nothing else is known', () => {
    expect(streamLabel(stream({ codec: 'subrip' }))).toBe('subrip');
  });
});

describe('humanKind', () => {
  it('gives a readable name for each kind', () => {
    expect(humanKind('pdf')).toBe('PDF document');
    expect(humanKind('other')).toBe('File');
  });
});
