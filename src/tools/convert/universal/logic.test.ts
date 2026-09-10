import { describe, it, expect } from 'vitest';
import type { BinaryId, FileKind, OutputSpec } from '@/core/types';
import {
  CONVERTIBLE_KINDS,
  DEFAULT_QUALITY,
  availableTargets,
  groupFilesByKind,
  normalizeExt,
  pickDefaultTarget,
  planConversion,
  targetsForKind,
} from './logic';

const OUTPUT: OutputSpec = { mode: 'same_dir', dir: null, suffix: null, collision: 'rename', filename: null };
const all = () => true;
const none = () => false;

function plan(kind: FileKind, targetExt: string, paths = ['/a/file.x']) {
  return planConversion({ kind, targetExt, paths, output: OUTPUT, quality: DEFAULT_QUALITY });
}

describe('the conversion table', () => {
  it('covers every kind the tool claims to convert', () => {
    for (const kind of CONVERTIBLE_KINDS) {
      expect(targetsForKind(kind).length, `${kind} has no targets`).toBeGreaterThan(0);
    }
  });

  it('gives every target either a backend command or a handoff, never neither', () => {
    for (const kind of CONVERTIBLE_KINDS) {
      for (const target of targetsForKind(kind)) {
        expect(Boolean(target.command) !== Boolean(target.handoff), `${kind} → ${target.ext}`).toBe(true);
      }
    }
  });

  it('does not list the same output extension twice for one kind', () => {
    for (const kind of CONVERTIBLE_KINDS) {
      const exts = targetsForKind(kind).map((t) => t.ext);
      expect(new Set(exts).size, `${kind} has duplicate targets`).toBe(exts.length);
    }
  });

  it('only asks for a quality control the plan actually sends', () => {
    // A control that the backend would ignore is a dead control, so any target
    // claiming `videoCrf` must produce a plan carrying a crf.
    for (const target of targetsForKind('video')) {
      if (target.quality !== 'videoCrf') continue;
      const ops = plan('video', target.ext).args.ops as Record<string, unknown>;
      expect(ops.crf, `${target.ext} promised a CRF control`).toBe(DEFAULT_QUALITY.crf);
    }
    for (const target of targetsForKind('audio')) {
      if (target.quality !== 'audioBitrate') continue;
      const ops = plan('audio', target.ext).args.ops as Record<string, unknown>;
      expect(ops.audioBitrate, `${target.ext} promised a bitrate control`).toBe(DEFAULT_QUALITY.audioBitrate);
    }
  });
});

describe('availableTargets', () => {
  it('greys out a target whose program is missing and names the binary', () => {
    const entries = availableTargets('image', ['png'], (id: BinaryId) => id !== 'magick');
    const avif = entries.find((e) => e.target.ext === 'avif');
    expect(avif?.available).toBe(false);
    expect(avif?.missing).toEqual(['magick']);
    expect(entries.find((e) => e.target.ext === 'jpg')?.available).toBe(true);
  });

  it('keeps built-in image formats available with nothing installed', () => {
    const entries = availableTargets('image', ['heic'], none);
    const usable = entries.filter((e) => e.available).map((e) => e.target.ext);
    expect(usable).toContain('jpg');
    expect(usable).toContain('png');
    expect(usable).not.toContain('avif');
  });

  it('refuses Markdown for a source Pandoc cannot read, and explains why', () => {
    const rtf = availableTargets('document', ['rtf'], all).find((e) => e.target.ext === 'md');
    expect(rtf?.available).toBe(false);
    expect(rtf?.blocked).toMatch(/rtf/);
    const docx = availableTargets('document', ['docx'], all).find((e) => e.target.ext === 'md');
    expect(docx?.available).toBe(true);
  });

  it('blocks Markdown when any one file in a mixed group is unreadable', () => {
    const entry = availableTargets('document', ['docx', 'rtf'], all).find((e) => e.target.ext === 'md');
    expect(entry?.available).toBe(false);
  });

  it('marks every video target unavailable without FFmpeg', () => {
    const entries = availableTargets('video', ['mkv'], none);
    expect(entries.every((e) => !e.available)).toBe(true);
  });

  it('leaves handoff targets available even with nothing installed', () => {
    const entries = availableTargets('svg', ['svg'], none);
    expect(entries.every((e) => e.available)).toBe(true);
  });
});

describe('pickDefaultTarget', () => {
  it('never defaults to the format the files already are', () => {
    const entries = availableTargets('image', ['jpg'], all);
    expect(pickDefaultTarget(entries, ['jpg'])).toBe('png');
  });

  it('treats jpeg and jpg as the same format', () => {
    const entries = availableTargets('image', ['jpeg'], all);
    expect(pickDefaultTarget(entries, ['jpeg'])).toBe('png');
  });

  it('uses the first choice when the sources are mixed', () => {
    const entries = availableTargets('image', ['heic', 'png'], all);
    expect(pickDefaultTarget(entries, ['heic', 'png'])).toBe('jpg');
  });

  it('skips a default that needs a program that is not installed', () => {
    const entries = availableTargets('document', ['docx'], (id) => id !== 'soffice');
    // Only the Pandoc target survives, so that is what gets pre-selected.
    expect(pickDefaultTarget(entries, ['docx'])).toBe('md');
  });

  it('falls back to the first target when nothing at all is available', () => {
    const entries = availableTargets('video', ['mkv'], none);
    expect(pickDefaultTarget(entries, ['mkv'])).toBe('mp4');
  });

  it('returns an empty string for a kind with no targets', () => {
    expect(pickDefaultTarget([], ['zip'])).toBe('');
  });
});

describe('groupFilesByKind', () => {
  it('splits a mixed selection into one group per kind, in a stable order', () => {
    const groups = groupFilesByKind([
      { path: '/a/clip.mov', kind: 'video', extension: 'mov' },
      { path: '/a/one.heic', kind: 'image', extension: 'heic' },
      { path: '/a/two.HEIC', kind: 'image', extension: 'HEIC' },
      { path: '/a/notes.pdf', kind: 'pdf', extension: 'pdf' },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['image', 'video', 'pdf']);
    expect(groups[0].paths).toEqual(['/a/one.heic', '/a/two.HEIC']);
    expect(groups[0].extensions).toEqual(['heic']);
  });

  it('drops files the converter has no route for', () => {
    const groups = groupFilesByKind([
      { path: '/a/backup.zip', kind: 'archive', extension: 'zip' },
      { path: '/a/song.mp3', kind: 'audio', extension: 'mp3' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('audio');
  });

  it('returns nothing for an empty selection', () => {
    expect(groupFilesByKind([])).toEqual([]);
  });
});

describe('planConversion', () => {
  it('sends image conversions through process_images with a quality only when lossy', () => {
    expect(plan('image', 'jpg').args).toMatchObject({
      inputs: ['/a/file.x'],
      ops: { format: 'jpg', quality: DEFAULT_QUALITY.imageQuality },
    });
    const png = plan('image', 'png').args.ops as Record<string, unknown>;
    expect(png.quality).toBeUndefined();
  });

  it('strips the video stream when a video becomes an audio file', () => {
    const ops = plan('video', 'mp3').args.ops as Record<string, unknown>;
    expect(ops).toEqual({ format: 'mp3', audioOnly: true });
    expect(ops.crf).toBeUndefined();
  });

  it('keeps the video stream and sets a CRF for a container change', () => {
    const ops = plan('video', 'webm').args.ops as Record<string, unknown>;
    expect(ops).toEqual({ format: 'webm', crf: DEFAULT_QUALITY.crf });
  });

  it('sends nothing extra for AVI, whose codec ignores CRF', () => {
    expect(plan('video', 'avi').args.ops).toEqual({ format: 'avi' });
  });

  it('routes video to GIF through the palette-aware command', () => {
    const gif = plan('video', 'gif');
    expect(gif.command).toBe('video_to_gif');
    expect(gif.args.ops).toEqual({ gifFps: DEFAULT_QUALITY.gifFps, gifWidth: DEFAULT_QUALITY.gifWidth });
  });

  it('asks for an exact bitrate only for the audio containers that honour one', () => {
    expect(plan('audio', 'mp3').args.ops).toEqual({
      format: 'mp3',
      videoCodec: 'copy',
      audioCodec: 'libmp3lame',
      audioBitrate: DEFAULT_QUALITY.audioBitrate,
    });
    expect(plan('audio', 'm4a').args.ops).toEqual({
      format: 'm4a',
      videoCodec: 'copy',
      audioCodec: 'aac',
      audioBitrate: DEFAULT_QUALITY.audioBitrate,
    });
    expect(plan('audio', 'flac').args.ops).toEqual({ format: 'flac', audioOnly: true });
    expect(plan('audio', 'ogg').args.ops).toEqual({ format: 'ogg', audioOnly: true });
  });

  it('never copies a picture stream into a container that cannot hold one', () => {
    // Ogg (and so Opus) refuses an mjpeg/png stream outright, which is what an
    // ordinary tagged music file carries, so the picture has to be dropped.
    expect(plan('audio', 'opus').args.ops).toEqual({ format: 'opus', audioOnly: true });
    for (const target of targetsForKind('audio')) {
      const ops = plan('audio', target.ext).args.ops as Record<string, unknown>;
      if (ops.videoCodec !== 'copy') continue;
      expect(['mp3', 'm4a'], `${target.ext} cannot carry cover art`).toContain(target.ext);
    }
  });

  it('renders PDF pages with a DPI, and adds a JPEG quality only for JPEG', () => {
    const png = plan('pdf', 'png');
    expect(png.command).toBe('pdf_to_images');
    expect(png.args.opts).toEqual({ format: 'png', dpi: DEFAULT_QUALITY.pdfDpi, jpegQuality: undefined });
    const jpg = plan('pdf', 'jpg').args.opts as Record<string, unknown>;
    expect(jpg.jpegQuality).toBe(DEFAULT_QUALITY.imageQuality);
  });

  it('uses the text extractor for PDF to text and LibreOffice for PDF to Word', () => {
    expect(plan('pdf', 'txt')).toMatchObject({ command: 'pdf_to_text', args: { layout: true } });
    expect(plan('pdf', 'docx')).toMatchObject({ command: 'convert_document', args: { targetFormat: 'docx' } });
  });

  it('uses Pandoc for Markdown and LibreOffice for everything else a document becomes', () => {
    expect(plan('document', 'md')).toMatchObject({ command: 'pandoc_convert', args: { toFormat: 'gfm' } });
    expect(plan('document', 'pdf')).toMatchObject({ command: 'convert_document', args: { targetFormat: 'pdf' } });
  });

  it('counts the files in the job label', () => {
    expect(plan('image', 'jpg', ['/a/1.png']).label).toBe('Convert 1 image to JPEG');
    expect(plan('image', 'jpg', ['/a/1.png', '/a/2.png']).label).toBe('Convert 2 images to JPEG');
    expect(plan('pdf', 'txt', ['/a/1.pdf', '/a/2.pdf']).label).toBe('Convert 2 PDFs to Text');
  });

  it('refuses a pair that belongs to another tool instead of guessing', () => {
    expect(() => plan('image', 'pdf')).toThrow(/Images to PDF/);
    expect(() => plan('svg', 'png')).toThrow(/SVG to PNG or JPG/);
  });

  it('refuses a format that is not in the table for that kind', () => {
    expect(() => plan('audio', 'mp4')).toThrow(/Audio files/);
  });
});

describe('normalizeExt', () => {
  it('folds the aliases people actually have on disk', () => {
    expect(normalizeExt('.JPEG')).toBe('jpg');
    expect(normalizeExt('TIF')).toBe('tiff');
    expect(normalizeExt('htm')).toBe('html');
    expect(normalizeExt('markdown')).toBe('md');
    expect(normalizeExt('webp')).toBe('webp');
  });
});
