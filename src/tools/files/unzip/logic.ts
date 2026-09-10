/** One row of `list_archive`. Mirrors `ArchiveEntry` in `src-tauri/src/cmd/archives.rs`. */
export interface ArchiveEntry {
  name: string;
  size: number;
  compressed: number;
  isDir: boolean;
}

export interface ArchiveTotals {
  files: number;
  folders: number;
  size: number;
  compressed: number;
  /** 0–1, how much the compression saved. Null when the format does not report it. */
  ratio: number | null;
  /**
   * TAR listings report the stored size as the compressed size, so a ratio
   * would be a lie. ZIP reports both per entry.
   */
  reportsCompression: boolean;
}

export function archiveTotals(entries: ArchiveEntry[]): ArchiveTotals {
  let files = 0;
  let folders = 0;
  let size = 0;
  let compressed = 0;
  let reportsCompression = false;

  for (const entry of entries) {
    if (entry.isDir) {
      folders += 1;
      continue;
    }
    files += 1;
    size += entry.size;
    compressed += entry.compressed;
    if (entry.compressed !== entry.size) reportsCompression = true;
  }

  const ratio = reportsCompression && size > 0 ? 1 - compressed / size : null;
  return { files, folders, size, compressed, ratio, reportsCompression };
}

export type ArchiveKind = 'zip' | 'tar' | 'tar.gz';

/** What the backend will do with this file name, or null if it will refuse it. */
export function supportedArchiveKind(fileName: string): ArchiveKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar')) return 'tar';
  return null;
}

function trimEndRepeated(value: string, suffix: string): string {
  let out = value;
  while (out.length > suffix.length && out.endsWith(suffix)) out = out.slice(0, -suffix.length);
  return out;
}

/**
 * The folder `extract_archive` creates when no destination is chosen: the
 * archive name, lower-cased, with its extension removed — and a `_1` style
 * suffix if a folder of that name is already there.
 */
export function defaultExtractFolderName(fileName: string): string {
  let name = fileName.toLowerCase();
  for (const suffix of ['.tar.gz', '.tgz', '.zip', '.tar']) {
    name = trimEndRepeated(name, suffix);
  }
  return name || fileName;
}

/** Top-level entries, so a preview can say whether everything is in one folder. */
export function topLevelNames(entries: ArchiveEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const head = entry.name.replace(/^\.\//, '').split('/').filter(Boolean)[0];
    if (head) seen.add(head);
  }
  return [...seen];
}
