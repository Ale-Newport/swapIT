import type { BinaryId, FileInfo, FileKind } from '@/core/types';
import { formatBytes } from '@/core/format';
import type { RadialItem } from '../model';

export type Bins = Partial<Record<BinaryId, boolean>>;

export const BINARY_LABEL: Record<string, string> = {
  ffmpeg: 'FFmpeg',
  ffprobe: 'FFmpeg',
  magick: 'ImageMagick',
  gs: 'Ghostscript',
  pdftoppm: 'Poppler',
  pdftotext: 'Poppler',
  qpdf: 'QPDF',
  exiftool: 'ExifTool',
  tesseract: 'Tesseract',
  'yt-dlp': 'yt-dlp',
  pandoc: 'Pandoc',
  soffice: 'LibreOffice',
};

export interface CatalogInput {
  files: FileInfo[];
  folder: string | null;
  bins: Bins;
  /** Quality knobs from the user's settings. */
  settings: { jpegQuality: number; defaultVideoCrf: number };
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export function isKind(files: FileInfo[], ...kinds: FileKind[]): boolean {
  return files.length > 0 && files.every((f) => kinds.includes(f.kind));
}

export function hasKind(files: FileInfo[], ...kinds: FileKind[]): boolean {
  return files.some((f) => kinds.includes(f.kind));
}

export function distinctKinds(files: FileInfo[]): FileKind[] {
  return [...new Set(files.map((f) => f.kind))];
}

export function distinctExts(files: FileInfo[]): string[] {
  return [...new Set(files.map((f) => f.extension.toLowerCase()).filter(Boolean))];
}

/** "photo.jpg", "3 images", "Downloads". */
export function describeSelection(files: FileInfo[]): string {
  if (files.length === 0) return 'Nothing selected';
  if (files.length === 1) return files[0].name;
  const kinds = distinctKinds(files);
  const noun: Record<string, [string, string]> = {
    image: ['image', 'images'],
    svg: ['SVG', 'SVGs'],
    video: ['video', 'videos'],
    audio: ['audio file', 'audio files'],
    pdf: ['PDF', 'PDFs'],
    document: ['document', 'documents'],
    archive: ['archive', 'archives'],
    text: ['text file', 'text files'],
    data: ['data file', 'data files'],
    code: ['code file', 'code files'],
    font: ['font', 'fonts'],
    folder: ['folder', 'folders'],
  };
  if (kinds.length === 1 && noun[kinds[0]]) {
    const [one, many] = noun[kinds[0]];
    return pluralize(files.length, one, many);
  }
  return pluralize(files.length, 'item');
}

export function describeSize(files: FileInfo[]): string {
  const bytes = files.reduce((sum, f) => sum + (f.isDir ? 0 : f.size), 0);
  return bytes > 0 ? formatBytes(bytes) : '';
}

/** "Needs FFmpeg" for the first missing program, or undefined when all are there. */
export function missing(bins: Bins, ...ids: BinaryId[]): string | undefined {
  const absent = ids.filter((id) => bins[id] === false);
  if (absent.length === 0) return undefined;
  const names = [...new Set(absent.map((id) => BINARY_LABEL[id] ?? id))];
  return `Needs ${names.join(' and ')}`;
}

export function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function stemOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '/';
}

/** The folder a "create here" action should use for this selection. */
export function targetFolder(input: Pick<CatalogInput, 'files' | 'folder'>): string | null {
  if (input.folder) return input.folder;
  const first = input.files[0];
  if (!first) return null;
  return first.isDir ? first.path : dirOf(first.path);
}

/**
 * A petal-sized version of a long name: "Convert Image Format" → "Convert Image…".
 * Filler words go first; if it still does not fit, it is cut at a word boundary.
 */
export function shortLabel(name: string, max = 16): string {
  if (name.length <= max) return name;
  const filler = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'files', 'file', 'your', 'this']);
  const words = name.split(/\s+/);
  let kept = words.filter((w) => !filler.has(w.toLowerCase()));
  if (kept.length === 0) kept = words;
  let out = kept.join(' ');
  if (out.length <= max) return out;
  out = '';
  for (const word of kept) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > max - 1) break;
    out = next;
  }
  return `${out || kept[0].slice(0, max - 1)}…`;
}

export function task(item: Omit<RadialItem, 'mode'>): RadialItem {
  return { ...item, mode: 'task' };
}

export function ui(item: Omit<RadialItem, 'mode'>): RadialItem {
  return { ...item, mode: 'ui' };
}

/**
 * A petal that opens a smaller ring. At most six children — if there are more, the caller
 * nests them. Returns null for an empty menu so callers can drop it without a branch.
 */
export function menu(spec: {
  id: string;
  label: string;
  title: string;
  hint?: string;
  icon: string;
  glyph?: string;
  keywords?: string[];
  children: Array<RadialItem | null | undefined | false>;
}): RadialItem | null {
  const children = spec.children.filter((c): c is RadialItem => Boolean(c));
  if (children.length === 0) return null;
  return {
    id: spec.id,
    label: spec.label,
    title: spec.title,
    hint: spec.hint ?? `${children.length} option${children.length === 1 ? '' : 's'}`,
    icon: spec.icon,
    glyph: spec.glyph,
    keywords: spec.keywords,
    mode: 'ui',
    children,
    run: async () => undefined,
  };
}

/** Keep the available ones first; fall back to dimmed ones only to fill a ring that would be empty. */
export function preferAvailable(items: RadialItem[], count: number): RadialItem[] {
  const ok = items.filter((i) => !i.unavailable);
  const out = ok.slice(0, count);
  if (out.length < count) out.push(...items.filter((i) => i.unavailable).slice(0, count - out.length));
  return out;
}

export function compact<T>(list: Array<T | null | undefined | false>): T[] {
  return list.filter((x): x is T => Boolean(x));
}
