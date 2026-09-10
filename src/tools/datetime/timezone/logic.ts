/**
 * Time-zone maths built on Intl.
 *
 * A zone is only ever a rule for turning an instant into wall-clock fields and
 * back, so everything here goes through `Intl.DateTimeFormat.formatToParts`
 * rather than any hard-coded offset table — that way daylight saving, historical
 * changes and half-hour zones are all handled by the platform's tz database.
 */

export interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Used when `Intl.supportedValuesOf` is missing — enough to stay useful. */
export const FALLBACK_ZONES: string[] = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Lima',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Atlantic/Reykjavik',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Bucharest',
  'Europe/Budapest',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Kyiv',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Oslo',
  'Europe/Paris',
  'Europe/Prague',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Honolulu',
];

let zoneCache: string[] | null = null;

/** Every zone the platform knows, or the bundled list when it cannot say. */
export function allZones(): string[] {
  if (zoneCache) return zoneCache;
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  let zones: string[] = [];
  if (typeof supported === 'function') {
    try {
      zones = supported('timeZone').filter(isValidZone);
    } catch {
      zones = [];
    }
  }
  if (zones.length === 0) zones = FALLBACK_ZONES.filter(isValidZone);
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  zoneCache = [...new Set(zones)].sort();
  return zoneCache;
}

export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(zone, formatter);
  }
  return formatter;
}

/** The wall-clock fields a zone shows for an instant. */
export function zoneParts(instantMs: number, zone: string): WallParts {
  const parts = partsFormatter(zone).formatToParts(new Date(instantMs));
  const read = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const hour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Some engines still report midnight as hour 24 in a few locales.
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
    second: read('second'),
  };
}

function partsToUtcMs(parts: WallParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

/** Minutes the zone is ahead of UTC at that instant. Negative west of Greenwich. */
export function zoneOffsetMinutes(instantMs: number, zone: string): number {
  const whole = Math.floor(instantMs / 1000) * 1000;
  return Math.round((partsToUtcMs(zoneParts(whole, zone)) - whole) / 60_000);
}

export interface WallResolution {
  /** The instant the zone shows those wall-clock fields at. */
  instantMs: number;
  /**
   * Minutes the clock had to move forward because the requested time does not
   * exist — the hour a spring-forward skips. 0 whenever the time is real.
   */
  skippedMinutes: number;
}

/**
 * Turn wall-clock fields in a zone back into an instant. Two passes settle the
 * chicken-and-egg problem that the offset depends on the instant being found,
 * then the answer is read back to check the zone really shows that clock time.
 *
 * When it does not, the time fell in the gap a daylight-saving change skips —
 * 02:30 on the morning New York moves to 03:00 never happens. The naive two
 * passes land an hour *before* the time that was asked for, so the gap is
 * stepped over instead: the answer becomes the same clock time shifted forward
 * by the size of the gap, and `skippedMinutes` says how far it moved.
 *
 * An ambiguous time — the hour a clock repeats in autumn — is not a gap: the
 * first pass already lands on a real instant, so the earlier of the two is
 * returned unchanged.
 */
export function resolveWallTime(parts: WallParts, zone: string): WallResolution {
  const wallUtc = partsToUtcMs(parts);
  const first = wallUtc - zoneOffsetMinutes(wallUtc, zone) * 60_000;
  const candidate = wallUtc - zoneOffsetMinutes(first, zone) * 60_000;

  /** Minutes between the clock time an instant really shows and the one asked for. */
  const drift = (instantMs: number) =>
    Math.round((partsToUtcMs(zoneParts(instantMs, zone)) - wallUtc) / 60_000);

  const candidateDrift = drift(candidate);
  if (candidateDrift === 0) return { instantMs: candidate, skippedMinutes: 0 };
  // Landing past the requested time means the gap has already been stepped over.
  if (candidateDrift > 0) return { instantMs: candidate, skippedMinutes: candidateDrift };

  const stepped = candidate - candidateDrift * 60_000;
  const steppedDrift = drift(stepped);
  if (steppedDrift <= 0) return { instantMs: candidate, skippedMinutes: 0 };
  return { instantMs: stepped, skippedMinutes: steppedDrift };
}

/** The instant alone, for the places that do not care about a skipped hour. */
export function wallToInstant(parts: WallParts, zone: string): number {
  return resolveWallTime(parts, zone).instantMs;
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const abbrCache = new Map<string, Intl.DateTimeFormat>();

/** The short zone name the platform uses: CET, EDT, GMT+5:30 … */
export function zoneAbbreviation(instantMs: number, zone: string): string {
  let formatter = abbrCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' });
    abbrCache.set(zone, formatter);
  }
  const part = formatter.formatToParts(new Date(instantMs)).find((p) => p.type === 'timeZoneName');
  return part?.value ?? formatOffset(zoneOffsetMinutes(instantMs, zone));
}

/**
 * Daylight saving is in effect when the offset now is larger than the smallest
 * offset the zone uses that year. Sampling four months catches both hemispheres.
 */
export function isDaylightSaving(instantMs: number, zone: string): boolean {
  const year = zoneParts(instantMs, zone).year;
  const samples = [0, 3, 6, 9].map((month) => Date.UTC(year, month, 1, 12));
  const standard = Math.min(...samples.map((sample) => zoneOffsetMinutes(sample, zone)));
  return zoneOffsetMinutes(instantMs, zone) > standard;
}

/** "Los_Angeles" → "Los Angeles". */
export function zoneCity(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

export function zoneRegion(zone: string): string {
  const parts = zone.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join(' / ').replace(/_/g, ' ') : '';
}

/** Loose search across the zone id, its city and its current offset. */
export function searchZones(zones: string[], query: string, instantMs: number, limit = 12): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/);
  const scored: Array<{ zone: string; score: number }> = [];
  for (const zone of zones) {
    const haystack = `${zone} ${zoneCity(zone)} ${zoneRegion(zone)}`.toLowerCase().replace(/[_/]/g, ' ');
    const offset = formatOffset(zoneOffsetMinutes(instantMs, zone));
    const withOffset = `${haystack} ${offset} utc${offset}`;
    if (!tokens.every((token) => withOffset.includes(token))) continue;
    const city = zoneCity(zone).toLowerCase();
    const score = city.startsWith(tokens[0]) ? 0 : city.includes(tokens[0]) ? 1 : 2;
    scored.push({ zone, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.zone.localeCompare(b.zone))
    .slice(0, limit)
    .map((entry) => entry.zone);
}

/** How many calendar days the target zone is ahead of or behind the source. */
export function dayShift(instantMs: number, sourceZone: string, targetZone: string): number {
  const source = zoneParts(instantMs, sourceZone);
  const target = zoneParts(instantMs, targetZone);
  const a = Date.UTC(source.year, source.month - 1, source.day);
  const b = Date.UTC(target.year, target.month - 1, target.day);
  return Math.round((b - a) / 86_400_000);
}

export type HourBand = 'work' | 'fringe' | 'off';

export function hourBand(hour: number): HourBand {
  if (hour >= 9 && hour < 18) return 'work';
  if (hour >= 7 && hour < 21) return 'fringe';
  return 'off';
}

/** `YYYY-MM-DDTHH:mm:ss` for an `<input type="datetime-local">`. */
export function partsToLocalInput(parts: WallParts): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(parts.year).padStart(4, '0')}-${p(parts.month)}-${p(parts.day)}T${p(parts.hour)}:${p(
    parts.minute,
  )}:${p(parts.second)}`;
}

export function localInputToParts(value: string): WallParts | null {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) return null;
  const parts: WallParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? '0'),
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return null;
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) return null;
  return parts;
}
