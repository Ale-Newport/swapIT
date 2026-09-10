/** Mirrors `FolderEntry` / `FolderReport` in `src-tauri/src/cmd/files.rs`. */
export interface FolderEntry {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  fileCount: number;
}

export interface FolderReport {
  root: string;
  totalSize: number;
  fileCount: number;
  dirCount: number;
  entries: FolderEntry[];
  /** [kind, bytes, file count] */
  byKind: Array<[string, number, number]>;
  largest: FolderEntry[];
}

export type SortKey = 'name' | 'size' | 'files';
export type SortDirection = 'asc' | 'desc';

/** Percentage of a whole, safe when the whole is zero. */
export function share(part: number, total: number): number {
  if (!total || total <= 0 || !Number.isFinite(part)) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

/** A width that stays visible for the tiny slices at the end of a list. */
export function barWidth(part: number, total: number): string {
  const value = share(part, total);
  return `${value > 0 && value < 0.6 ? 0.6 : value}%`;
}

export function sortEntries(entries: FolderEntry[], key: SortKey, direction: SortDirection): FolderEntry[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (key === 'name') return factor * a.name.localeCompare(b.name, undefined, { numeric: true });
    if (key === 'files') return factor * (a.fileCount - b.fileCount) || a.name.localeCompare(b.name);
    return factor * (a.size - b.size) || a.name.localeCompare(b.name);
  });
}

const KIND_LABELS: Record<string, string> = {
  image: 'Images',
  svg: 'Vectors',
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  document: 'Documents',
  archive: 'Archives',
  text: 'Text',
  data: 'Data',
  code: 'Code',
  font: 'Fonts',
  folder: 'Folders',
  other: 'Everything else',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * A monochrome ramp keeps the composition bar readable in both themes without
 * inventing colours outside the design tokens.
 */
const RAMP = ['bg-ink', 'bg-ink/75', 'bg-ink/60', 'bg-ink/48', 'bg-ink/38', 'bg-ink/29', 'bg-ink/21', 'bg-ink/14'];

export function rampClass(index: number): string {
  return RAMP[Math.min(index, RAMP.length - 1)];
}

/**
 * The folded tail. `other` is a real backend kind, so the tail needs a key of
 * its own or a folder holding both would produce two segments called `other`.
 */
export const REST_KIND = '__rest';

export interface KindSegment {
  /** A backend kind, or {@link REST_KIND} for the folded tail. Unique in a list. */
  kind: string;
  label: string;
  bytes: number;
  count: number;
  share: number;
  className: string;
}

/**
 * The kinds that actually take up room, with the long tail folded into a single
 * "Everything else" slice so the legend stays readable.
 */
export function kindSegments(
  byKind: Array<[string, number, number]>,
  total: number,
  max = RAMP.length,
): KindSegment[] {
  const sorted = [...byKind].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, Math.max(1, max - 1));
  const tail = sorted.slice(Math.max(1, max - 1));
  const segments: KindSegment[] = head.map(([kind, bytes, count], index) => ({
    kind,
    label: kindLabel(kind),
    bytes,
    count,
    share: share(bytes, total),
    className: rampClass(index),
  }));
  if (tail.length > 0) {
    const bytes = tail.reduce((sum, [, size]) => sum + size, 0);
    const count = tail.reduce((sum, [, , files]) => sum + files, 0);
    segments.push({
      kind: REST_KIND,
      label: `${tail.length} other kind${tail.length === 1 ? '' : 's'}`,
      bytes,
      count,
      share: share(bytes, total),
      className: rampClass(head.length),
    });
  }
  return segments.filter((segment) => segment.bytes > 0);
}
