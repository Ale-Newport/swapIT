/** Mirrors `DuplicateGroup` / `DuplicateReport` in `src-tauri/src/cmd/hashing.rs`. */
export interface DuplicateGroup {
  hash: string;
  size: number;
  files: string[];
  wasted: number;
}

export interface DuplicateReport {
  groups: DuplicateGroup[];
  scanned: number;
  totalWasted: number;
  elapsedMs: number;
}

export type SizeUnit = 'B' | 'KB' | 'MB';

export const UNIT_FACTORS: Record<SizeUnit, number> = { B: 1, KB: 1024, MB: 1024 * 1024 };

/**
 * The scan skips anything smaller than this. Zero-byte files are all identical
 * to each other, so the floor never drops below one byte.
 */
export function toBytes(value: number, unit: SizeUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.round(value * UNIT_FACTORS[unit]));
}

/** Every copy after the first one in each group — the bytes that could be freed. */
export function extraCopies(groups: DuplicateGroup[]): string[] {
  return groups.flatMap((g) => g.files.slice(1));
}

export function totalCopies(groups: DuplicateGroup[]): number {
  return groups.reduce((sum, g) => sum + g.files.length, 0);
}

/** path → size, so a selection can be weighed without re-walking the groups. */
export function sizeIndex(groups: DuplicateGroup[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const group of groups) {
    for (const file of group.files) index.set(file, group.size);
  }
  return index;
}

export function selectionBytes(groups: DuplicateGroup[], selected: Set<string>): number {
  const index = sizeIndex(groups);
  let total = 0;
  for (const path of selected) total += index.get(path) ?? 0;
  return total;
}

/**
 * A group where every copy is selected would leave nothing behind, which is
 * almost never what someone wants — the UI warns about exactly these.
 */
export function fullySelectedGroups(groups: DuplicateGroup[], selected: Set<string>): number {
  return groups.filter((g) => g.files.length > 0 && g.files.every((f) => selected.has(f))).length;
}

/** The folder a path sits in, for the second line of a result row. */
export function folderOf(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function shortHash(hash: string, length = 12): string {
  return hash.length > length ? hash.slice(0, length) : hash;
}
