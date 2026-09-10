/**
 * `join_files` sorts the inputs itself before concatenating them, so the UI has
 * to show the same order the backend will use — and warn when that order is not
 * the one the user expects.
 */

/** Compare two paths the way Rust's `Ord for PathBuf` does: component by component. */
export function comparePaths(a: string, b: string): number {
  const left = a.split('/').filter(Boolean);
  const right = b.split('/').filter(Boolean);
  const rootDiff = Number(a.startsWith('/')) - Number(b.startsWith('/'));
  if (rootDiff !== 0) return -rootDiff;
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return left.length - right.length;
}

export function sortForJoin(paths: string[]): string[] {
  return [...paths].sort(comparePaths);
}

/** The number in `movie.mp4.003.part`, or null when the name is not numbered. */
export function partNumber(name: string): number | null {
  const match = /\.(\d+)\.part$/i.exec(name);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** `movie.mp4.003.part` → `movie.mp4`; anything else is returned unchanged. */
export function basePartName(name: string): string {
  return name.replace(/\.(\d+)\.part$/i, '');
}

function fileStem(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

const ILLEGAL = /[/\\:*?"<>|\0]/g;

/** Mirrors `sanitize_filename` closely enough to preview the output name. */
function sanitize(value: string): string {
  const cleaned = value.replace(ILLEGAL, '_').trim().replace(/^\.+|\.+$/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'untitled';
  return cleaned.slice(0, 200);
}

/**
 * The file name `join_files` writes, derived from the first part: everything up
 * to the last `.part`, then with its final `.NNN` removed.
 */
export function joinedName(firstName: string): string {
  const partIndex = firstName.lastIndexOf('.part');
  const head = partIndex >= 0 ? firstName.slice(0, partIndex) : firstName;
  const dot = head.lastIndexOf('.');
  const stem = dot >= 0 ? head.slice(0, dot) : fileStem(firstName);
  return sanitize(stem);
}

export interface JoinPart {
  path: string;
  name: string;
  size: number;
  number: number | null;
  base: string;
}

export interface JoinReview {
  /** The parts in the exact order the backend will concatenate them. */
  order: JoinPart[];
  totalSize: number;
  outputName: string;
  /** Numbers between the first and last that are not present. */
  missing: number[];
  /** Numbers appearing on more than one file. */
  duplicates: number[];
  /** Files with no `.NNN.part` number at all. */
  unnumbered: number;
  /** Distinct base names — more than one means parts of different files are mixed. */
  bases: string[];
  /** True when the numbering does not begin at 1. */
  startsLate: boolean;
}

export function reviewParts(parts: Array<{ path: string; name: string; size: number }>): JoinReview {
  const order = sortForJoin(parts.map((p) => p.path)).map((path) => {
    const found = parts.find((p) => p.path === path)!;
    return {
      path,
      name: found.name,
      size: found.size,
      number: partNumber(found.name),
      base: basePartName(found.name),
    };
  });

  const numbers = order.map((p) => p.number).filter((n): n is number => n !== null);
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const n of numbers) {
    if (seen.has(n)) duplicates.add(n);
    seen.add(n);
  }

  const missing: number[] = [];
  if (numbers.length > 1) {
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    // A pathological range (a stray 9999.part) would otherwise list thousands.
    if (max - min < 10_000) {
      for (let n = min; n <= max; n += 1) if (!seen.has(n)) missing.push(n);
    }
  }

  return {
    order,
    totalSize: order.reduce((sum, p) => sum + p.size, 0),
    outputName: order.length > 0 ? joinedName(order[0].name) : '',
    missing,
    duplicates: [...duplicates].sort((a, b) => a - b),
    unnumbered: order.length - numbers.length,
    bases: [...new Set(order.map((p) => p.base))],
    startsLate: numbers.length > 0 && Math.min(...numbers) !== 1,
  };
}
