import type { FileInfo } from '@/core/types';

/** Mirrors `MetadataEntry` in `src-tauri/src/cmd/misc.rs`. */
export interface MetadataEntry {
  group: string;
  tag: string;
  value: string;
}

export type FileSortKey = 'name' | 'size' | 'modified' | 'kind';
export type SortDirection = 'asc' | 'desc';

/** Unix seconds from the backend, rendered in the user's own locale. */
export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '—';
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ISO 8601, for the JSON export where a machine will read it. */
export function isoTimestamp(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export function sortFiles(files: FileInfo[], key: FileSortKey, direction: SortDirection): FileInfo[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => {
    switch (key) {
      case 'size':
        return factor * (a.size - b.size) || a.name.localeCompare(b.name);
      case 'modified':
        return factor * ((a.modified ?? 0) - (b.modified ?? 0)) || a.name.localeCompare(b.name);
      case 'kind':
        return factor * a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
      default:
        return factor * a.name.localeCompare(b.name, undefined, { numeric: true });
    }
  });
}

export interface MetadataGroup {
  name: string;
  entries: MetadataEntry[];
}

/** EXIF arrives as a flat list; grouping it makes it readable. */
export function groupEntries(entries: MetadataEntry[]): MetadataGroup[] {
  const groups = new Map<string, MetadataEntry[]>();
  for (const entry of entries) {
    const name = entry.group?.trim() || 'Other';
    const bucket = groups.get(name);
    if (bucket) bucket.push(entry);
    else groups.set(name, [entry]);
  }
  return [...groups.entries()].map(([name, list]) => ({ name, entries: list }));
}

/** Tags that give away where a photo was taken. */
export function hasLocation(entries: MetadataEntry[]): boolean {
  return entries.some((e) => /gps|latitude|longitude/i.test(e.tag));
}

export interface FileReport {
  name: string;
  path: string;
  extension: string;
  mime: string;
  kind: string;
  bytes: number;
  created: string | null;
  modified: string | null;
  metadata?: Record<string, string>;
}

/**
 * One JSON document describing every selected file, with whatever embedded
 * metadata has been read so far. Duplicate tags keep the last value, which is
 * what the readers themselves report.
 */
export function buildReport(files: FileInfo[], metadata: Record<string, MetadataEntry[]>): FileReport[] {
  return files.map((file) => {
    const entries = metadata[file.path];
    const report: FileReport = {
      name: file.name,
      path: file.path,
      extension: file.extension,
      mime: file.mime,
      kind: file.kind,
      bytes: file.size,
      created: isoTimestamp(file.created),
      modified: isoTimestamp(file.modified),
    };
    if (entries && entries.length > 0) {
      report.metadata = Object.fromEntries(
        entries.map((entry) => [entry.group ? `${entry.group}:${entry.tag}` : entry.tag, entry.value]),
      );
    }
    return report;
  });
}

/** Tab-separated, so the table can be pasted straight into a spreadsheet. */
export function reportToTsv(files: FileInfo[]): string {
  const header = ['Name', 'Extension', 'Type', 'Kind', 'Bytes', 'Created', 'Modified', 'Path'].join('\t');
  const rows = files.map((file) =>
    [
      file.name,
      file.extension,
      file.mime,
      file.kind,
      String(file.size),
      isoTimestamp(file.created) ?? '',
      isoTimestamp(file.modified) ?? '',
      file.path,
    ].join('\t'),
  );
  return [header, ...rows].join('\n');
}
