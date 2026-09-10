import { describe, it, expect } from 'vitest';
import {
  defaultFaviconDir,
  faviconFilesIn,
  faviconTargetDir,
  FAVICON_OUTPUTS,
  FAVICON_SNIPPET,
  numberedFolder,
  outputFor,
  previewSize,
  sanitizeFolderName,
} from './logic';

describe('defaultFaviconDir', () => {
  it('puts the set in a favicon folder beside the image', () => {
    expect(defaultFaviconDir('/Users/ana/site/logo.png')).toBe('/Users/ana/site/favicon');
  });

  it('handles a file sitting at the filesystem root', () => {
    expect(defaultFaviconDir('/logo.png')).toBe('/favicon');
  });

  it('handles a bare filename with no folder at all', () => {
    expect(defaultFaviconDir('logo.png')).toBe('favicon');
  });

  it('keeps spaces and unicode in the path intact', () => {
    expect(defaultFaviconDir('/Users/ana/Mis Diseños/logo.png')).toBe(
      '/Users/ana/Mis Diseños/favicon',
    );
  });

  it('accepts a different folder name', () => {
    expect(defaultFaviconDir('/site/logo.png', 'icons')).toBe('/site/icons');
  });
});

describe('the declared output set', () => {
  it('lists every file the backend writes, once each', () => {
    const names = FAVICON_OUTPUTS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'favicon.ico',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'apple-touch-icon.png',
      'android-chrome-192x192.png',
      'android-chrome-512x512.png',
      'mstile-150x150.png',
      'site.webmanifest',
      'favicon-snippet.html',
    ]);
  });

  it('gives every PNG a pixel size and everything else none', () => {
    for (const output of FAVICON_OUTPUTS) {
      if (output.name.endsWith('.png')) expect(output.size).toBeGreaterThan(0);
      else expect(output.size).toBeNull();
    }
  });

  it('encodes the size in the filename where the filename claims one', () => {
    for (const output of FAVICON_OUTPUTS) {
      const match = output.name.match(/(\d+)x(\d+)/);
      if (!match) continue;
      expect(Number(match[1])).toBe(output.size);
      expect(match[1]).toBe(match[2]);
    }
  });

  it('looks an output up by name', () => {
    expect(outputFor('apple-touch-icon.png')?.size).toBe(180);
    expect(outputFor('nope.png')).toBeUndefined();
  });
});

describe('the HTML snippet', () => {
  it('links only to files the generator actually produces', () => {
    const hrefs = [...FAVICON_SNIPPET.matchAll(/href="\/([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    const produced = new Set(FAVICON_OUTPUTS.map((o) => o.name));
    for (const href of hrefs) expect(produced.has(href)).toBe(true);
  });

  it('declares the sizes the linked files really are', () => {
    expect(FAVICON_SNIPPET).toContain('sizes="32x32" href="/favicon-32x32.png"');
    expect(FAVICON_SNIPPET).toContain('sizes="180x180" href="/apple-touch-icon.png"');
    expect(outputFor('apple-touch-icon.png')?.size).toBe(180);
  });

  it('is one link per line with no trailing blank line', () => {
    const lines = FAVICON_SNIPPET.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines.every((line) => line.startsWith('<link '))).toBe(true);
  });
});

describe('previewSize', () => {
  it('shows small icons at their true size', () => {
    expect(previewSize(16)).toBe(16);
    expect(previewSize(32)).toBe(32);
  });

  it('caps the big ones so the row stays readable', () => {
    expect(previewSize(512)).toBe(96);
    expect(previewSize(512, 128)).toBe(128);
  });
});

describe('sanitizeFolderName', () => {
  it('keeps an ordinary name untouched', () => {
    expect(sanitizeFolderName('favicon')).toBe('favicon');
    expect(sanitizeFolderName('site icons-v2')).toBe('site icons-v2');
  });

  it('never lets a name escape its folder', () => {
    // Separators become underscores and leading dots go, exactly as sanitize_filename does.
    expect(sanitizeFolderName('../../etc')).toBe('_.._etc');
    expect(sanitizeFolderName('a/b')).toBe('a_b');
    expect(sanitizeFolderName('..')).toBe('favicon');
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFolderName('   ')).toBe('favicon');
    expect(sanitizeFolderName('', 'icons')).toBe('icons');
  });

  it('caps the length the way the backend does', () => {
    expect(sanitizeFolderName('x'.repeat(500))).toHaveLength(200);
  });
});

describe('faviconTargetDir', () => {
  it('uses a folder beside the image when saving to the same folder', () => {
    expect(faviconTargetDir('/site/logo.png', { mode: 'same_dir', dir: null }, 'favicon')).toBe(
      '/site/favicon',
    );
  });

  it('uses the chosen folder when one is set', () => {
    expect(faviconTargetDir('/site/logo.png', { mode: 'custom', dir: '/out' }, 'icons')).toBe(
      '/out/icons',
    );
    expect(faviconTargetDir('/site/logo.png', { mode: 'custom', dir: '/out/' }, 'icons')).toBe(
      '/out/icons',
    );
  });

  it('has no target until it has what it needs', () => {
    expect(faviconTargetDir(null, { mode: 'same_dir', dir: null }, 'favicon')).toBeNull();
    expect(faviconTargetDir('/site/logo.png', { mode: 'custom', dir: null }, 'favicon')).toBeNull();
  });

  it('sanitises the folder name it is given', () => {
    expect(faviconTargetDir('/site/logo.png', { mode: 'custom', dir: '/out' }, '../secrets')).toBe(
      '/out/_secrets',
    );
  });
});

describe('collision helpers', () => {
  it('numbers a folder the way unique_path does', () => {
    expect(numberedFolder('/site/favicon', 1)).toBe('/site/favicon_1');
    expect(numberedFolder('/site/favicon', 12)).toBe('/site/favicon_12');
  });

  it('lists every file the generator would write into a folder', () => {
    const files = faviconFilesIn('/site/favicon');
    expect(files).toHaveLength(FAVICON_OUTPUTS.length);
    expect(files).toContain('/site/favicon/site.webmanifest');
    expect(files.every((f) => f.startsWith('/site/favicon/'))).toBe(true);
  });
});
