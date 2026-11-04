import { describe, expect, it } from 'vitest';
import type { AppSettings } from '@/core/bridge';
import type { FileInfo, FileKind } from '@/core/types';
import { LAYOUT_TYPES, RING_CAPACITY, layoutKeyFor, leaves, type RingLayouts } from '../layouts';
import { flattenItems, searchItems } from '../menu';
import type { RadialItem } from '../model';
import { buildMenu, type MenuModel } from './index';
import { actionsFor } from './samples';
import type { Bins } from './util';

const ALL: Bins = {
  ffmpeg: true,
  ffprobe: true,
  magick: true,
  gs: true,
  pdftoppm: true,
  pdftotext: true,
  qpdf: true,
  tesseract: true,
  pandoc: true,
  soffice: true,
};

const settings = { jpegQuality: 85, defaultVideoCrf: 23 } as AppSettings;

function file(name: string, kind: FileKind, size = 1000): FileInfo {
  const dot = name.lastIndexOf('.');
  return {
    path: `/Users/demo/${name}`,
    name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
    mime: '',
    kind,
    size,
    isDir: kind === 'folder',
  };
}

function build(files: FileInfo[], bins: Bins = ALL, layouts?: RingLayouts): MenuModel {
  return buildMenu({
    files,
    folder: '/Users/demo/Desktop',
    bins,
    settings,
    layouts,
    intent: 'ring',
    clipboard: { kind: 'text', preview: 'hello', count: 5 },
  });
}

const rootIds = (m: MenuModel) => m.root.map((i) => i.id);
const menuOf = (m: MenuModel, id: string): RadialItem | undefined => flattenItems(m.root).find((i) => i.id === id);
const reachable = (m: MenuModel) => flattenItems(m.root).map((i) => i.id);
const poolIds = (m: MenuModel) => m.pool.map((i) => i.id);

/** How many petals deep the tree goes (the root ring is depth 1). */
function depth(items: RadialItem[]): number {
  return 1 + Math.max(0, ...items.map((i) => (i.children ? depth(i.children) : 0)));
}

/** Everything Finder's own right-click menu already does well. */
const FINDER_DOES_THESE = [
  'finder:open',
  'finder:open-with',
  'finder:quicklook',
  'finder:reveal',
  'finder:copy',
  'finder:zip',
  'finder:duplicate',
  'finder:move',
  'finder:trash',
  'finder:group',
  'tool:rename',
  'archive:extract',
  'create:folder',
  'create:screenshot',
  'capture:window',
  'capture:screen',
  'capture:record',
];

const scenarios: Array<[string, FileInfo[]]> = [
  ['one image', [file('a.png', 'image')]],
  ['one HEIC', [file('a.heic', 'image')]],
  ['three images', [file('a.png', 'image'), file('b.jpg', 'image'), file('c.heic', 'image')]],
  ['an SVG', [file('a.svg', 'svg')]],
  ['a video', [file('a.mov', 'video')]],
  ['an audio file', [file('a.wav', 'audio')]],
  ['a PDF', [file('a.pdf', 'pdf')]],
  ['two PDFs', [file('a.pdf', 'pdf'), file('b.pdf', 'pdf')]],
  ['a Word document', [file('a.docx', 'document')]],
  ['JSON', [file('a.json', 'data')]],
  ['YAML', [file('a.yaml', 'data')]],
  ['Markdown', [file('a.md', 'text')]],
  ['plain text', [file('a.txt', 'text')]],
  ['HTML', [file('a.html', 'code')]],
  ['a folder', [file('Photos', 'folder')]],
  ['an archive', [file('a.zip', 'archive')]],
  ['mixed kinds', [file('a.png', 'image'), file('b.mp4', 'video')]],
  ['something unknown', [file('a.dmg', 'other')]],
  ['nothing', []],
];

describe('the ring stays small and simple', () => {
  for (const [name, files] of scenarios) {
    it(`${name}: at most six petals on every ring, never deeper than three rings`, () => {
      const menu = build(files);
      expect(menu.root.length).toBeGreaterThan(0);
      expect(menu.root.length).toBeLessThanOrEqual(6);
      const check = (items: RadialItem[], where: string) => {
        expect(items.length, where).toBeLessThanOrEqual(6);
        for (const item of items) {
          expect(item.label.length, item.id).toBeLessThanOrEqual(16);
          expect(item.title.length, item.id).toBeGreaterThan(0);
          expect(item.icon || item.glyph, item.id).toBeTruthy();
          if (item.children) {
            expect(item.children.length, item.id).toBeGreaterThan(0);
            check(item.children, `${where} › ${item.id}`);
          }
        }
        expect(new Set(items.map((i) => i.id)).size, `${where} has duplicate ids`).toBe(items.length);
      };
      check(menu.root, name);
      expect(depth(menu.root)).toBeLessThanOrEqual(3);
    });

    it(`${name}: offers nothing Finder already does from the right-click menu`, () => {
      const menu = build(files);
      for (const id of FINDER_DOES_THESE) {
        expect(reachable(menu), id).not.toContain(id);
        expect(poolIds(menu), id).not.toContain(id);
      }
    });
  }

  it('a petal id keeps its icon and kind wherever it appears', () => {
    const seen = new Map<string, RadialItem>();
    for (const [, files] of scenarios) {
      for (const item of build(files).pool) {
        const known = seen.get(item.id);
        if (known) {
          expect(known.mode, item.id).toBe(item.mode);
          if (!item.id.startsWith('convert:')) expect(known.icon, item.id).toBe(item.icon);
        }
        seen.set(item.id, item);
      }
    }
  });
});

describe('an image', () => {
  it('opens on the three formats people want, compress, resize and More', () => {
    const menu = build([file('Sunset.heic', 'image')]);
    expect(rootIds(menu)).toEqual(['convert:jpg', 'convert:png', 'convert:webp', 'edit:compress', 'menu:resize', 'menu:more']);
  });

  it('skips the format the file already is and offers the next one instead', () => {
    const menu = build([file('a.jpg', 'image')]);
    expect(rootIds(menu)).toEqual(['convert:png', 'convert:webp', 'convert:pdf', 'edit:compress', 'menu:resize', 'menu:more']);
  });

  it('keeps everything else one tap away, in sub-rings', () => {
    const menu = build([file('a.png', 'image')]);
    expect(menuOf(menu, 'menu:resize')?.children?.map((i) => i.id)).toEqual(['edit:resize-50', 'edit:resize-25', 'edit:resize-1920', 'edit:resize-1280']);
    expect(reachable(menu)).toEqual(
      expect.arrayContaining(['edit:rotate-cw', 'edit:grayscale', 'edit:strip', 'tool:ocr', 'tool:qr-scan', 'tool:palette', 'convert:avif', 'convert:tiff']),
    );
  });

  it('lets you type your way to anything, including what no ring shows', () => {
    const menu = build([file('a.png', 'image')]);
    expect(searchItems(menu.pool, 'copy path').map((i) => i.id)).toContain('extra:copy-path');
    expect(searchItems(menu.pool, 'markdown').map((i) => i.id)).toContain('create:markdown');
    expect(searchItems(menu.pool, 'qr').map((i) => i.id)).toContain('tool:qr-scan');
    // The full app's tools are searchable too.
    expect(poolIds(menu).some((id) => id.startsWith('toolbox:'))).toBe(true);
  });
});

describe('other kinds', () => {
  it('video: formats, compress, mute and More', () => {
    const menu = build([file('clip.mov', 'video')]);
    expect(rootIds(menu)).toEqual(['convert:mp4', 'convert:gif', 'convert:mp3', 'edit:video-compress', 'edit:mute', 'menu:more']);
  });

  it('audio: formats, normalise, compress and More', () => {
    const menu = build([file('a.wav', 'audio')]);
    expect(rootIds(menu)).toEqual(['convert:mp3', 'convert:m4a', 'convert:flac', 'edit:normalize', 'edit:audio-small', 'menu:more']);
  });

  it('PDFs merge only when there are two or more', () => {
    expect(rootIds(build([file('a.pdf', 'pdf')]))).not.toContain('pdf:merge');
    expect(rootIds(build([file('a.pdf', 'pdf'), file('b.pdf', 'pdf')]))).toContain('pdf:merge');
  });

  it('JSON converts straight away, with counting under More', () => {
    const menu = build([file('c.json', 'data')]);
    expect(rootIds(menu)).toEqual(['text:json-yaml', 'text:json-csv', 'text:json-xml', 'text:json-pretty', 'text:json-min', 'menu:more']);
    expect(menuOf(menu, 'menu:more')?.children?.map((i) => i.id)).toEqual(['text:stats', 'text:copy']);
  });

  it('Markdown offers HTML without Pandoc and marks the Word family unavailable', () => {
    const menu = build([file('n.md', 'text')], { ...ALL, pandoc: false });
    const byId = new Map(flattenItems(menu.root).map((i) => [i.id, i]));
    expect(byId.get('convert:md-html')?.unavailable).toBeUndefined();
    expect(byId.get('convert:md-docx')?.unavailable).toMatch(/Pandoc/);
  });

  it('a folder gets folder things, not conversions or zipping', () => {
    const menu = build([file('Photos', 'folder')]);
    expect(rootIds(menu)).toEqual(['tool:folder-size', 'tool:duplicates', 'tool:organize', 'tool:flatten']);
  });

  it('an archive can be peeked into and checksummed — Finder already unzips', () => {
    const menu = build([file('a.zip', 'archive')]);
    expect(rootIds(menu)).toEqual(['archive:list', 'tool:hash']);
  });

  it('a mix offers only the formats every file can reach', () => {
    const ids = reachable(build([file('a.png', 'image'), file('b.mp4', 'video')]));
    expect(ids).toContain('convert:gif');
    expect(ids).not.toContain('convert:mp3');
    expect(ids).not.toContain('convert:jpg');
  });
});

describe('missing helper programs', () => {
  it('dims what cannot run, but prefers to fill the ring with what can', () => {
    const noFfmpeg = build([file('clip.mov', 'video')], { ...ALL, ffmpeg: false, ffprobe: false });
    const all = flattenItems(noFfmpeg.root);
    expect(all.find((i) => i.id === 'convert:mp4')?.unavailable).toMatch(/FFmpeg/);
    expect(all.find((i) => i.id === 'convert:mp4')?.needs).toContain('ffmpeg');

    const image = build([file('a.png', 'image')], { ...ALL, magick: false });
    // AVIF needs ImageMagick; the common formats do not, so the first ring is unaffected.
    expect(image.root.slice(0, 3).every((i) => !i.unavailable)).toBe(true);
  });
});

describe('with nothing selected', () => {
  const menu = build([]);

  it('opens on what you would want to make', () => {
    expect(rootIds(menu)).toEqual(['create:text', 'create:markdown', 'create:record', 'menu:new-file', 'create:paste', 'menu:more']);
  });

  it('reaches every file type and the extras in two taps or fewer of sub-rings', () => {
    const ids = reachable(menu);
    expect(ids).toEqual(
      expect.arrayContaining(['new:html', 'new:css', 'new:json', 'new:yaml', 'new:py', 'new:sh', 'create:daily', 'create:ocr-screen', 'clip:qr', 'clip:uuid', 'clip:password']),
    );
  });

  it('describes what is on the clipboard on the Paste petal', () => {
    expect(menu.root.find((i) => i.id === 'create:paste')?.hint).toContain('hello');
    const empty = buildMenu({ files: [], folder: '/x', bins: ALL, settings, intent: 'ring', clipboard: { kind: 'empty', preview: '', count: 0 } });
    expect(empty.root.find((i) => i.id === 'create:paste')?.unavailable).toBeTruthy();
  });

  it('can still find any tool of the full app by typing', () => {
    expect(searchItems(menu.pool, 'json formatter').length).toBeGreaterThan(0);
  });
});

describe('your own rings', () => {
  const png = [file('a.png', 'image')];

  it('change nothing until you make one', () => {
    const plain = build(png);
    expect(rootIds(build(png, ALL, {}))).toEqual(rootIds(plain));
    expect(rootIds(build(png, ALL, { video: { order: ['convert:mp4'], off: [] } }))).toEqual(rootIds(plain));
    expect(plain.standard).toBe(plain.root);
  });

  it('put what is on in your order, and keep the rest of the ring in More', () => {
    const everything = actionsFor('image').candidates.map((i) => i.id);
    const order = ['edit:compress', 'convert:webp', ...everything.filter((id) => id !== 'edit:compress' && id !== 'convert:webp')];
    const menu = build(png, ALL, { image: { order, off: [] } });
    expect(rootIds(menu).slice(0, 2)).toEqual(['edit:compress', 'convert:webp']);
    expect(rootIds(menu)).toHaveLength(6);
    expect(rootIds(menu)[5]).toBe('menu:more');
  });

  it('take switched-off actions off every ring but not out of search', () => {
    const everything = actionsFor('image').candidates.map((i) => i.id);
    const menu = build(png, ALL, { image: { order: everything, off: ['convert:jpg', 'convert:webp'] } });
    expect(reachable(menu)).not.toContain('convert:jpg');
    expect(reachable(menu)).not.toContain('convert:webp');
    expect(searchItems(menu.pool, 'jpg').map((i) => i.id)).toContain('convert:jpg');
  });

  it('only touch the kind they were made for', () => {
    const everything = actionsFor('image').candidates.map((i) => i.id);
    const layouts: RingLayouts = { image: { order: everything, off: everything } };
    expect(rootIds(build([file('a.mp4', 'video')], ALL, layouts))).toEqual(rootIds(build([file('a.mp4', 'video')])));
  });

  it('survive a selection that cannot do some of their actions', () => {
    // Saved while looking at a PNG; used on a JPG, where “PNG → JPG” does not exist.
    const menu = build([file('a.jpg', 'image')], ALL, { image: { order: ['convert:jpg', 'convert:png', 'edit:compress'], off: [] } });
    expect(rootIds(menu).slice(0, 2)).toEqual(['convert:png', 'edit:compress']);
  });

  it('can never leave the ring empty', () => {
    const everything = actionsFor('image').candidates.map((i) => i.id);
    const menu = build(png, ALL, { image: { order: everything, off: everything } });
    expect(menu.root.length).toBeGreaterThan(0);
    expect(rootIds(menu)).toEqual(rootIds(build(png)));
  });

  it('keep every ring within six petals and three levels, whatever is on', () => {
    for (const { key } of LAYOUT_TYPES) {
      const { candidates } = actionsFor(key);
      const layout = { order: candidates.map((i) => i.id), off: [] as string[] };
      const files = key === 'create' ? [] : sampleFilesFor(key);
      const menu = build(files, ALL, { [key]: layout } as RingLayouts);
      expect(menu.root.length, key).toBeLessThanOrEqual(6);
      expect(depth(menu.root), key).toBeLessThanOrEqual(3);
      expect(leaves(menu.root).length, key).toBeLessThanOrEqual(RING_CAPACITY);
    }
  });
});

describe('what each kind of file can be customised with', () => {
  for (const { key, label } of LAYOUT_TYPES) {
    it(`${label}: lists unique actions, including everything the standard ring reaches`, () => {
      const { candidates, shipped, standard } = actionsFor(key);
      expect(candidates.length).toBeGreaterThan(0);
      const ids = candidates.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(candidates.every((i) => !i.children)).toBe(true);
      for (const id of shipped) expect(ids, id).toContain(id);
      expect(leaves(standard).length).toBeGreaterThan(0);
    });
  }

  it('offers PDFs the merge that needs two files, and images every format', () => {
    expect(actionsFor('pdf').candidates.map((i) => i.id)).toContain('pdf:merge');
    const image = actionsFor('image').candidates.map((i) => i.id);
    expect(image).toEqual(expect.arrayContaining(['convert:png', 'convert:jpg', 'convert:webp', 'edit:compress']));
  });

  it('uses the same layout key the ring does', () => {
    for (const [, files] of scenarios) {
      const key = layoutKeyFor(files);
      expect(LAYOUT_TYPES.some((t) => t.key === key)).toBe(true);
    }
  });
});

function sampleFilesFor(key: string): FileInfo[] {
  const byKey: Record<string, FileInfo[]> = {
    image: [file('a.png', 'image')],
    video: [file('a.mov', 'video')],
    audio: [file('a.wav', 'audio')],
    pdf: [file('a.pdf', 'pdf'), file('b.pdf', 'pdf')],
    document: [file('a.docx', 'document')],
    text: [file('a.md', 'text')],
    svg: [file('a.svg', 'svg')],
    archive: [file('a.zip', 'archive')],
    folder: [file('Photos', 'folder')],
    mixed: [file('a.png', 'image'), file('b.mp4', 'video')],
  };
  return byKey[key] ?? [];
}
