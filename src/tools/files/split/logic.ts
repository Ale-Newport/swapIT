export const KIB = 1024;
export const MIB = 1024 * KIB;
export const GIB = 1024 * MIB;

export type SizeUnit = 'MB' | 'GB';

/** Binary units, matching what Finder and `formatBytes` report. */
export function unitBytes(unit: SizeUnit): number {
  return unit === 'GB' ? GIB : MIB;
}

export function chunkBytesFor(value: number, unit: SizeUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value * unitBytes(unit));
}

export interface Preset {
  label: string;
  hint: string;
  value: number;
  unit: SizeUnit;
}

export const PRESETS: Preset[] = [
  { label: '100 MB', hint: 'Comfortable for uploads and cloud sync', value: 100, unit: 'MB' },
  { label: '700 MB', hint: 'One CD-R', value: 700, unit: 'MB' },
  { label: '1 GB', hint: 'A round number for transfers', value: 1, unit: 'GB' },
  { label: 'FAT32 4 GB', hint: '4095 MB — just under the 4 GB maximum file size of a FAT32 USB stick', value: 4095, unit: 'MB' },
  { label: 'DVD 4.7 GB', hint: '4482 MB — fits a single-layer 4.7 GB DVD', value: 4482, unit: 'MB' },
];

export interface SplitPlan {
  valid: boolean;
  /** Why the plan cannot run, in a sentence. */
  problem: string | null;
  parts: number;
  chunkBytes: number;
  /** Size of the final, usually smaller, part. */
  lastPartBytes: number;
  /**
   * Part numbers are zero-padded to three digits, so beyond 999 parts the
   * names no longer sort in numeric order and the Join tool would rebuild
   * them in the wrong sequence.
   */
  tooManyParts: boolean;
}

/** Mirrors `split_file`: whole chunks of `chunkBytes`, then whatever is left. */
export function planSplit(totalBytes: number, chunkBytes: number): SplitPlan {
  const base: SplitPlan = {
    valid: false,
    problem: null,
    parts: 0,
    chunkBytes,
    lastPartBytes: 0,
    tooManyParts: false,
  };

  if (!Number.isFinite(chunkBytes) || chunkBytes < KIB) {
    return { ...base, problem: 'Each part has to be at least 1 KB.' };
  }
  if (totalBytes <= 0) {
    return { ...base, problem: 'This file is empty, so there is nothing to split.' };
  }
  if (chunkBytes >= totalBytes) {
    return {
      ...base,
      problem: 'The part size is larger than the file — it would produce a single part identical to the original.',
    };
  }

  const parts = Math.ceil(totalBytes / chunkBytes);
  return {
    valid: true,
    problem: null,
    parts,
    chunkBytes,
    lastPartBytes: totalBytes - (parts - 1) * chunkBytes,
    tooManyParts: parts > 999,
  };
}

/** The name of part `index` (1-based), exactly as the backend writes it. */
export function partName(sourceName: string, index: number): string {
  return `${sourceName}.${String(index).padStart(3, '0')}.part`;
}
