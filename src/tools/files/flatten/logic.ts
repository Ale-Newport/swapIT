import type { FileInfo } from '@/core/types';

/**
 * Where `flatten_folder` writes when no destination is chosen — mirrors
 * `root.join("_flattened")` in `src-tauri/src/cmd/files.rs`.
 */
export function defaultFlattenDestination(source: string): string {
  return `${source.replace(/\/+$/, '')}/_flattened`;
}

/** Directory part of an absolute path, without a trailing slash. */
export function parentDirOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  if (index < 0) return '';
  return index === 0 ? '/' : trimmed.slice(0, index);
}

export interface FlattenPlan {
  /** Files that will actually be copied or moved. */
  fileCount: number;
  totalSize: number;
  /** Files whose name is already taken by another file in the same run. */
  renamedCount: number;
  /** Names shared by more than one file, most contested first. */
  duplicateNames: Array<{ name: string; count: number }>;
  /** Files already sitting in the destination — the backend leaves them alone. */
  skippedInDestination: number;
  /** True when the scan hit its ceiling, so the numbers are a lower bound. */
  truncated: boolean;
}

/**
 * Work out what a flatten run will do, from a recursive listing of the source.
 *
 * The backend walks every file under the source except those already sitting
 * directly inside the destination folder, and resolves same-name files by
 * appending `_1`, `_2`, … rather than overwriting.
 */
export function planFlatten(files: FileInfo[], destination: string, scanLimit = Infinity): FlattenPlan {
  const dest = destination.replace(/\/+$/, '');
  const counts = new Map<string, number>();
  let fileCount = 0;
  let totalSize = 0;
  let skippedInDestination = 0;

  for (const file of files) {
    if (file.isDir) continue;
    if (dest && parentDirOf(file.path) === dest) {
      skippedInDestination += 1;
      continue;
    }
    fileCount += 1;
    totalSize += file.size;
    counts.set(file.name, (counts.get(file.name) ?? 0) + 1);
  }

  const duplicateNames = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const renamedCount = duplicateNames.reduce((sum, d) => sum + d.count - 1, 0);

  return {
    fileCount,
    totalSize,
    renamedCount,
    duplicateNames,
    skippedInDestination,
    truncated: files.length >= scanLimit,
  };
}
