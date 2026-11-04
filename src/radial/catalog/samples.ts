import type { FileInfo, FileKind } from '@/core/types';
import type { RadialItem } from '../model';
import { leaves, type LayoutKey } from '../layouts';
import { buildMenu } from './index';
import type { Bins } from './util';

/**
 * What each kind of file can do, found by building the menu for a few typical selections and
 * putting the results together. This is what the "customise the ring" page lists, so it must
 * cover the formats and the one-file / several-files differences that change what is offered
 * (a PDF can only be merged with another one, a JPG is never converted to JPG).
 */

type Sample = Array<[name: string, kind: FileKind]>;

const SAMPLES: Record<LayoutKey, Sample[]> = {
  create: [[]],
  image: [[['a.png', 'image']], [['a.jpg', 'image']], [['a.heic', 'image'], ['b.png', 'image']]],
  video: [[['a.mov', 'video']], [['a.mp4', 'video']]],
  audio: [[['a.wav', 'audio']], [['a.mp3', 'audio']]],
  pdf: [[['a.pdf', 'pdf']], [['a.pdf', 'pdf'], ['b.pdf', 'pdf']]],
  document: [[['a.docx', 'document']]],
  text: [[['a.md', 'text']], [['a.txt', 'text']], [['a.json', 'data']], [['a.yaml', 'data']], [['a.csv', 'data']]],
  svg: [[['a.svg', 'svg']]],
  archive: [[['a.zip', 'archive']]],
  folder: [[['Photos', 'folder']]],
  mixed: [[['a.png', 'image'], ['b.mp4', 'video']], [['a.dmg', 'other']]],
};

const EVERYTHING: Bins = {
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

function sampleFile(name: string, kind: FileKind): FileInfo {
  const dot = name.lastIndexOf('.');
  return {
    path: `/Users/you/${name}`,
    name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
    mime: '',
    kind,
    size: 1000,
    isDir: kind === 'folder',
  };
}

export interface KindActions {
  /** Everything this kind of file can do. */
  candidates: RadialItem[];
  /** The ids the standard ring reaches (in some ring), i.e. what is on until you change it. */
  shipped: Set<string>;
  /** The standard first ring, for reference. */
  standard: RadialItem[];
}

/** Settings the catalogue reads; the real values do not change what is on offer. */
const SETTINGS = { jpegQuality: 85, defaultVideoCrf: 23 };

export function actionsFor(key: LayoutKey): KindActions {
  const candidates: RadialItem[] = [];
  const seen = new Set<string>();
  const shipped = new Set<string>();
  let standard: RadialItem[] = [];

  SAMPLES[key].forEach((files, index) => {
    const model = buildMenu({
      files: files.map(([name, kind]) => sampleFile(name, kind)),
      folder: '/Users/you/Desktop',
      bins: EVERYTHING,
      settings: SETTINGS,
      intent: 'ring',
      clipboard: { kind: 'text', preview: 'Text', count: 4 },
    });
    if (index === 0) standard = model.standard;
    for (const item of leaves(model.standard)) shipped.add(item.id);
    for (const item of model.candidates) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      candidates.push(item);
    }
  });
  return { candidates, shipped, standard };
}
