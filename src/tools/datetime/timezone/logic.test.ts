import { describe, it, expect } from 'vitest';
import {
  FALLBACK_ZONES,
  allZones,
  dayShift,
  formatOffset,
  hourBand,
  isDaylightSaving,
  isValidZone,
  localInputToParts,
  partsToLocalInput,
  resolveWallTime,
  searchZones,
  wallToInstant,
  zoneAbbreviation,
  zoneCity,
  zoneOffsetMinutes,
  zoneParts,
  zoneRegion,
} from './logic';

// A fixed instant: 2024-06-15T12:00:00Z, summer in the northern hemisphere.
const SUMMER = Date.UTC(2024, 5, 15, 12, 0, 0);
// 2024-01-15T12:00:00Z, winter in the northern hemisphere.
const WINTER = Date.UTC(2024, 0, 15, 12, 0, 0);

describe('zone list', () => {
  it('always includes UTC and is sorted without duplicates', () => {
    const zones = allZones();
    expect(zones).toContain('UTC');
    expect(zones.length).toBeGreaterThan(20);
    expect([...zones].sort()).toEqual(zones);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it('ships a fallback list of real zones', () => {
    expect(FALLBACK_ZONES.every(isValidZone)).toBe(true);
  });

  it('rejects a made-up zone', () => {
    expect(isValidZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('zoneParts and zoneOffsetMinutes', () => {
  it('reads the wall clock in a zone', () => {
    expect(zoneParts(SUMMER, 'UTC')).toEqual({ year: 2024, month: 6, day: 15, hour: 12, minute: 0, second: 0 });
    expect(zoneParts(SUMMER, 'Asia/Tokyo')).toMatchObject({ day: 15, hour: 21 });
    expect(zoneParts(SUMMER, 'America/Los_Angeles')).toMatchObject({ day: 15, hour: 5 });
  });

  it('rolls the date over when the zone is far enough ahead', () => {
    const lateUtc = Date.UTC(2024, 5, 15, 23, 30);
    expect(zoneParts(lateUtc, 'Asia/Tokyo')).toMatchObject({ day: 16, hour: 8, minute: 30 });
  });

  it('reports whole and half-hour offsets', () => {
    expect(zoneOffsetMinutes(SUMMER, 'UTC')).toBe(0);
    expect(zoneOffsetMinutes(SUMMER, 'Asia/Tokyo')).toBe(540);
    expect(zoneOffsetMinutes(SUMMER, 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(SUMMER, 'America/New_York')).toBe(-240); // EDT
    expect(zoneOffsetMinutes(WINTER, 'America/New_York')).toBe(-300); // EST
  });

  it('handles a 45-minute zone', () => {
    expect(zoneOffsetMinutes(SUMMER, 'Asia/Kathmandu')).toBe(345);
  });
});

describe('wallToInstant', () => {
  it('is the inverse of zoneParts', () => {
    for (const zone of ['UTC', 'Europe/Madrid', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
      const parts = zoneParts(SUMMER, zone);
      expect(wallToInstant(parts, zone)).toBe(SUMMER);
    }
  });

  it('converts a wall time in one zone to the right instant', () => {
    const instant = wallToInstant({ year: 2024, month: 6, day: 15, hour: 21, minute: 0, second: 0 }, 'Asia/Tokyo');
    expect(instant).toBe(SUMMER);
  });

  it('survives a daylight-saving transition day', () => {
    // 2024-03-31 is the spring-forward day in Europe/Madrid; 03:00 exists.
    const parts = { year: 2024, month: 3, day: 31, hour: 3, minute: 0, second: 0 };
    const instant = wallToInstant(parts, 'Europe/Madrid');
    expect(zoneParts(instant, 'Europe/Madrid')).toMatchObject({ hour: 3, day: 31 });
  });

  it('lands on a real instant even for a wall time that does not exist', () => {
    // 02:30 on 2024-03-31 is skipped in Madrid; the result must still be a time.
    const instant = wallToInstant({ year: 2024, month: 3, day: 31, hour: 2, minute: 30, second: 0 }, 'Europe/Madrid');
    expect(Number.isFinite(instant)).toBe(true);
    expect(zoneParts(instant, 'Europe/Madrid').day).toBe(31);
  });
});

describe('resolveWallTime — daylight-saving gaps', () => {
  it('steps a skipped clock time forward instead of an hour backwards', () => {
    // 02:30 on 2025-03-09 does not exist in New York: the clock goes 02:00 → 03:00.
    const resolved = resolveWallTime(
      { year: 2025, month: 3, day: 9, hour: 2, minute: 30, second: 0 },
      'America/New_York',
    );
    expect(resolved.skippedMinutes).toBe(60);
    expect(zoneParts(resolved.instantMs, 'America/New_York')).toMatchObject({ day: 9, hour: 3, minute: 30 });
    expect(new Date(resolved.instantMs).toISOString()).toBe('2025-03-09T07:30:00.000Z');
  });

  it('does the same where the naive answer happened to land forward', () => {
    // 02:30 on 2025-03-30 does not exist in Berlin either.
    const resolved = resolveWallTime({ year: 2025, month: 3, day: 30, hour: 2, minute: 30, second: 0 }, 'Europe/Berlin');
    expect(resolved.skippedMinutes).toBe(60);
    expect(zoneParts(resolved.instantMs, 'Europe/Berlin')).toMatchObject({ day: 30, hour: 3, minute: 30 });
  });

  it('reports a half-hour gap as half an hour', () => {
    // Lord Howe Island moves forward by 30 minutes, on 2025-10-05 at 02:00.
    const resolved = resolveWallTime(
      { year: 2025, month: 10, day: 5, hour: 2, minute: 15, second: 0 },
      'Australia/Lord_Howe',
    );
    expect(resolved.skippedMinutes).toBe(30);
    expect(zoneParts(resolved.instantMs, 'Australia/Lord_Howe')).toMatchObject({ hour: 2, minute: 45 });
  });

  it('leaves a real clock time alone, ambiguous ones included', () => {
    const plain = resolveWallTime({ year: 2024, month: 6, day: 15, hour: 21, minute: 0, second: 0 }, 'Asia/Tokyo');
    expect(plain).toEqual({ instantMs: SUMMER, skippedMinutes: 0 });

    // 01:30 on 2025-11-02 happens twice in New York; the first is returned.
    const ambiguous = resolveWallTime(
      { year: 2025, month: 11, day: 2, hour: 1, minute: 30, second: 0 },
      'America/New_York',
    );
    expect(ambiguous.skippedMinutes).toBe(0);
    expect(new Date(ambiguous.instantMs).toISOString()).toBe('2025-11-02T05:30:00.000Z');
    expect(zoneParts(ambiguous.instantMs, 'America/New_York')).toMatchObject({ hour: 1, minute: 30 });
  });

  it('agrees with wallToInstant', () => {
    const parts = { year: 2025, month: 3, day: 9, hour: 2, minute: 30, second: 0 };
    expect(wallToInstant(parts, 'America/New_York')).toBe(resolveWallTime(parts, 'America/New_York').instantMs);
  });
});

describe('formatOffset', () => {
  it('writes signed hours and minutes', () => {
    expect(formatOffset(0)).toBe('+00:00');
    expect(formatOffset(330)).toBe('+05:30');
    expect(formatOffset(-480)).toBe('-08:00');
    expect(formatOffset(-210)).toBe('-03:30');
    expect(formatOffset(840)).toBe('+14:00');
  });
});

describe('daylight saving', () => {
  it('is on in New York in June and off in January', () => {
    expect(isDaylightSaving(SUMMER, 'America/New_York')).toBe(true);
    expect(isDaylightSaving(WINTER, 'America/New_York')).toBe(false);
  });

  it('is reversed in the southern hemisphere', () => {
    expect(isDaylightSaving(SUMMER, 'Australia/Sydney')).toBe(false);
    expect(isDaylightSaving(WINTER, 'Australia/Sydney')).toBe(true);
  });

  it('is never on in a zone that does not observe it', () => {
    expect(isDaylightSaving(SUMMER, 'UTC')).toBe(false);
    expect(isDaylightSaving(WINTER, 'UTC')).toBe(false);
    expect(isDaylightSaving(SUMMER, 'Asia/Tokyo')).toBe(false);
    expect(isDaylightSaving(SUMMER, 'America/Phoenix')).toBe(false);
  });
});

describe('zoneAbbreviation', () => {
  it('returns a non-empty short name', () => {
    expect(zoneAbbreviation(SUMMER, 'America/New_York')).toBe('EDT');
    expect(zoneAbbreviation(WINTER, 'America/New_York')).toBe('EST');
    expect(zoneAbbreviation(SUMMER, 'Asia/Kolkata').length).toBeGreaterThan(0);
  });
});

describe('labels and search', () => {
  it('splits a zone id into city and region', () => {
    expect(zoneCity('America/Los_Angeles')).toBe('Los Angeles');
    expect(zoneRegion('America/Los_Angeles')).toBe('America');
    expect(zoneCity('UTC')).toBe('UTC');
    expect(zoneRegion('UTC')).toBe('');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneRegion('America/Argentina/Buenos_Aires')).toBe('America / Argentina');
  });

  it('finds zones by city, region and offset', () => {
    const zones = allZones();
    expect(searchZones(zones, 'tokyo', SUMMER)).toContain('Asia/Tokyo');
    expect(searchZones(zones, 'los angeles', SUMMER)).toContain('America/Los_Angeles');
    expect(searchZones(zones, 'america new', SUMMER)).toContain('America/New_York');
    const halfHour = searchZones(zones, '+05:30', SUMMER);
    expect(halfHour.length).toBeGreaterThan(0);
    expect(halfHour.every((zone) => zoneOffsetMinutes(SUMMER, zone) === 330)).toBe(true);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(searchZones(allZones(), '   ', SUMMER)).toEqual([]);
    expect(searchZones(allZones(), 'a', SUMMER, 5).length).toBeLessThanOrEqual(5);
  });
});

describe('dayShift', () => {
  it('reports the date difference between two zones', () => {
    const lateUtc = Date.UTC(2024, 5, 15, 23, 30);
    expect(dayShift(lateUtc, 'UTC', 'Asia/Tokyo')).toBe(1);
    expect(dayShift(lateUtc, 'Asia/Tokyo', 'UTC')).toBe(-1);
    expect(dayShift(SUMMER, 'UTC', 'Europe/Madrid')).toBe(0);
  });
});

describe('hourBand', () => {
  it('marks the working day, its fringes and the night', () => {
    expect(hourBand(9)).toBe('work');
    expect(hourBand(17)).toBe('work');
    expect(hourBand(18)).toBe('fringe');
    expect(hourBand(8)).toBe('fringe');
    expect(hourBand(6)).toBe('off');
    expect(hourBand(23)).toBe('off');
    expect(hourBand(0)).toBe('off');
  });
});

describe('datetime-local values', () => {
  it('round-trips', () => {
    const parts = { year: 2024, month: 2, day: 29, hour: 7, minute: 5, second: 3 };
    expect(partsToLocalInput(parts)).toBe('2024-02-29T07:05:03');
    expect(localInputToParts('2024-02-29T07:05:03')).toEqual(parts);
  });

  it('rejects impossible field values', () => {
    expect(localInputToParts('2024-13-01T00:00')).toBeNull();
    expect(localInputToParts('2024-01-01T25:00')).toBeNull();
    expect(localInputToParts('nope')).toBeNull();
  });
});
