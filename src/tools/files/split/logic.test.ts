import { describe, expect, it } from 'vitest';
import { GIB, KIB, MIB, PRESETS, chunkBytesFor, partName, planSplit, unitBytes } from './logic';

describe('chunkBytesFor', () => {
  it('uses binary units so the sizes match Finder', () => {
    expect(chunkBytesFor(100, 'MB')).toBe(100 * MIB);
    expect(chunkBytesFor(1, 'GB')).toBe(GIB);
    expect(unitBytes('MB')).toBe(MIB);
  });

  it('rounds down a fractional size to a whole number of bytes', () => {
    expect(chunkBytesFor(1.5, 'MB')).toBe(Math.floor(1.5 * MIB));
  });

  it('returns zero for input that cannot be a size', () => {
    expect(chunkBytesFor(0, 'MB')).toBe(0);
    expect(chunkBytesFor(-5, 'GB')).toBe(0);
    expect(chunkBytesFor(Number.NaN, 'MB')).toBe(0);
  });
});

describe('planSplit', () => {
  it('splits into whole chunks plus a remainder', () => {
    const plan = planSplit(250 * KIB, 100 * KIB);
    expect(plan.valid).toBe(true);
    expect(plan.parts).toBe(3);
    expect(plan.lastPartBytes).toBe(50 * KIB);
  });

  it('makes the last part a full chunk when the file divides exactly', () => {
    const plan = planSplit(300 * KIB, 100 * KIB);
    expect(plan.parts).toBe(3);
    expect(plan.lastPartBytes).toBe(100 * KIB);
  });

  it('refuses a part size below the 1 KB the backend enforces', () => {
    const plan = planSplit(10_000, 512);
    expect(plan.valid).toBe(false);
    expect(plan.problem).toMatch(/at least 1 KB/);
  });

  it('refuses to make a single part that just duplicates the file', () => {
    expect(planSplit(1000, MIB).problem).toMatch(/single part/);
    expect(planSplit(2 * KIB, 2 * KIB).problem).toMatch(/single part/);
  });

  it('refuses an empty file', () => {
    expect(planSplit(0, 1024).problem).toMatch(/empty/);
  });

  it('warns once the part count outgrows three-digit numbering', () => {
    expect(planSplit(999 * 1024, 1024).tooManyParts).toBe(false);
    expect(planSplit(1000 * 1024, 1024).tooManyParts).toBe(true);
  });

  it('handles a real 8 GB file split for FAT32', () => {
    const plan = planSplit(8 * GIB, 4095 * MIB);
    expect(plan.parts).toBe(3);
    expect(plan.chunkBytes).toBeLessThan(4 * GIB);
  });
});

describe('partName', () => {
  it('keeps the whole original name and pads to three digits', () => {
    expect(partName('movie.mp4', 1)).toBe('movie.mp4.001.part');
    expect(partName('movie.mp4', 42)).toBe('movie.mp4.042.part');
  });

  it('keeps growing past three digits rather than truncating', () => {
    expect(partName('movie.mp4', 1234)).toBe('movie.mp4.1234.part');
  });
});

describe('PRESETS', () => {
  it('stays under the FAT32 4 GB per-file limit', () => {
    const fat32 = PRESETS.find((p) => p.label.includes('FAT32'))!;
    expect(chunkBytesFor(fat32.value, fat32.unit)).toBeLessThan(4 * GIB);
  });

  it('fits a 4.7 GB DVD, which is 4.7 decimal gigabytes', () => {
    const dvd = PRESETS.find((p) => p.label.includes('DVD'))!;
    expect(chunkBytesFor(dvd.value, dvd.unit)).toBeLessThanOrEqual(4_700_000_000);
  });
});
