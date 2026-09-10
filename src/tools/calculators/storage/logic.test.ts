import { describe, it, expect } from 'vitest';
import {
  CAPACITY_UNITS,
  DRIVE_PRESETS,
  ITEM_TYPES,
  capacityUnit,
  countThatFit,
  driveReality,
  formatSize,
  formatSizeBinary,
  minutesToClock,
  parsePositive,
  trim,
} from './logic';

describe('capacity units', () => {
  it('pairs each decimal unit with its binary twin', () => {
    for (const tier of [2, 3, 4]) {
      const decimal = CAPACITY_UNITS.find((u) => u.system === 'decimal' && u.tier === tier)!;
      const binary = CAPACITY_UNITS.find((u) => u.system === 'binary' && u.tier === tier)!;
      expect(decimal.factor).toBe(1000 ** tier);
      expect(binary.factor).toBe(1024 ** tier);
    }
    expect(capacityUnit('GiB')?.factor).toBe(1_073_741_824);
    expect(capacityUnit('nope')).toBeUndefined();
  });
});

describe('countThatFit', () => {
  it('counts whole items only', () => {
    expect(countThatFit(1e9, 4e6)).toBe(250);
    expect(countThatFit(1e9, 3e6)).toBe(333);
    expect(countThatFit(0, 4e6)).toBe(0);
  });

  it('fills a 1 TB drive with photos and 4K video', () => {
    expect(countThatFit(1e12, 4e6)).toBe(250_000);
    expect(countThatFit(1e12, 400e6)).toBe(2500);
  });

  it('refuses a zero-sized item', () => {
    expect(countThatFit(1e12, 0)).toBeNull();
    expect(countThatFit(-1, 4e6)).toBeNull();
  });
});

describe('minutesToClock', () => {
  it('reads minutes back as hours and minutes', () => {
    expect(minutesToClock(45)).toBe('45 min');
    expect(minutesToClock(60)).toBe('1 h');
    expect(minutesToClock(200)).toBe('3 h 20 min');
    expect(minutesToClock(0)).toBe('0 min');
    expect(minutesToClock(-1)).toBe('—');
  });
});

describe('driveReality', () => {
  it('explains the missing space on a 1 TB drive', () => {
    const r = driveReality(1, 4)!;
    expect(r.advertisedBytes).toBe(1e12);
    expect(r.shownValue).toBeCloseTo(0.9095, 4);
    expect(r.shownUnitLabel).toBe('TiB');
    expect(r.missingPercent).toBeCloseTo(9.0505, 4);
  });

  it('does the same at gigabyte scale', () => {
    const r = driveReality(256, 3)!;
    expect(r.shownValue).toBeCloseTo(238.42, 2);
    expect(r.missingPercent).toBeCloseTo(6.868, 3);
    expect(r.missingInAdvertisedUnit).toBeCloseTo(17.58, 2);
  });

  it('rejects impossible drives', () => {
    expect(driveReality(0, 4)).toBeNull();
    expect(driveReality(1, 9)).toBeNull();
  });
});

describe('item defaults', () => {
  it('are unique and positive', () => {
    expect(new Set(ITEM_TYPES.map((i) => i.id)).size).toBe(ITEM_TYPES.length);
    for (const item of ITEM_TYPES) expect(item.defaultMB).toBeGreaterThan(0);
  });

  it('keeps the documented rates', () => {
    expect(ITEM_TYPES.find((i) => i.id === 'photo')!.defaultMB).toBe(4);
    expect(ITEM_TYPES.find((i) => i.id === 'video4k')!.defaultMB).toBe(400);
    // MP3 320 kbps is 2.4 MB per minute, so a four-minute song is 9.6 MB.
    expect(ITEM_TYPES.find((i) => i.id === 'song')!.defaultMB).toBeCloseTo(2.4 * 4, 10);
  });

  it('offers drive presets that all resolve to a unit', () => {
    for (const preset of DRIVE_PRESETS) expect(capacityUnit(preset.unit)).toBeTruthy();
  });
});

describe('formatting helpers', () => {
  it('formats sizes in decimal units', () => {
    expect(formatSize(1e12)).toBe('1 TB');
    expect(formatSize(4e6)).toBe('4 MB');
    expect(formatSize(0)).toBe('0 B');
  });

  it('formats sizes in binary units at every tier', () => {
    expect(formatSizeBinary(1024 ** 4)).toBe('1 TiB');
    expect(formatSizeBinary(1e12)).toBe('931.32 GiB');
    expect(formatSizeBinary(1e6)).toBe('976.56 KiB');
    expect(formatSizeBinary(700 * 1e6)).toBe('667.57 MiB');
    expect(formatSizeBinary(512)).toBe('512 B');
    expect(formatSizeBinary(null)).toBe('—');
  });

  it('trims and parses', () => {
    expect(trim(250000, 0)).toBe('250,000');
    expect(parsePositive('1')).toBe(1);
    expect(parsePositive('0')).toBeNull();
    expect(parsePositive('')).toBeNull();
  });
});
