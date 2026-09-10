/**
 * Storage capacity in human terms: how much of a thing fits, and why a drive
 * sold as 1 TB shows up as 931 GB.
 *
 * Capacities are held in bytes. Drive makers sell decimal bytes (1 TB =
 * 1,000,000,000,000 B) while operating systems mostly display binary units, so
 * the same drive gets two different numbers — no space is actually lost.
 */

export interface CapacityUnit {
  id: string;
  label: string;
  factor: number;
  /** 3 = giga, 4 = tera. Used to pair a decimal unit with its binary twin. */
  tier: number;
  system: 'decimal' | 'binary';
}

export const CAPACITY_UNITS: CapacityUnit[] = [
  { id: 'MB', label: 'MB', factor: 1e6, tier: 2, system: 'decimal' },
  { id: 'GB', label: 'GB', factor: 1e9, tier: 3, system: 'decimal' },
  { id: 'TB', label: 'TB', factor: 1e12, tier: 4, system: 'decimal' },
  { id: 'MiB', label: 'MiB', factor: 1024 ** 2, tier: 2, system: 'binary' },
  { id: 'GiB', label: 'GiB', factor: 1024 ** 3, tier: 3, system: 'binary' },
  { id: 'TiB', label: 'TiB', factor: 1024 ** 4, tier: 4, system: 'binary' },
];

export function capacityUnit(id: string): CapacityUnit | undefined {
  return CAPACITY_UNITS.find((u) => u.id === id);
}

export interface ItemType {
  id: string;
  label: string;
  /** What one unit is: "photo", "minute", "episode"… */
  noun: string;
  pluralNoun: string;
  /** Default size of one unit, in megabytes (decimal). */
  defaultMB: number;
  note: string;
  /** True when one unit is a minute of running time. */
  perMinute?: boolean;
}

export const ITEM_TYPES: ItemType[] = [
  {
    id: 'photo',
    label: 'Photos — 12 MP JPEG',
    noun: 'photo',
    pluralNoun: 'photos',
    defaultMB: 4,
    note: 'Phone camera, quality 85',
  },
  {
    id: 'raw',
    label: 'Photos — RAW',
    noun: 'file',
    pluralNoun: 'files',
    defaultMB: 25,
    note: '24 MP mirrorless, 14-bit',
  },
  {
    id: 'song',
    label: 'Songs — MP3 320 kbps',
    noun: 'song',
    pluralNoun: 'songs',
    defaultMB: 9.6,
    note: 'Four minutes at 2.4 MB per minute',
  },
  {
    id: 'podcast',
    label: 'Podcast episodes — 1 hour',
    noun: 'episode',
    pluralNoun: 'episodes',
    defaultMB: 43.2,
    note: '96 kbps mono speech',
  },
  {
    id: 'video4k',
    label: 'Video — 4K 60 fps',
    noun: 'minute',
    pluralNoun: 'minutes',
    defaultMB: 400,
    note: 'Phone or mirrorless, ~53 Mbps',
    perMinute: true,
  },
  {
    id: 'video1080',
    label: 'Video — 1080p 30 fps',
    noun: 'minute',
    pluralNoun: 'minutes',
    defaultMB: 130,
    note: 'Phone capture, ~17 Mbps',
    perMinute: true,
  },
  {
    id: 'movie',
    label: 'Movies — 1080p, 2 hours',
    noun: 'movie',
    pluralNoun: 'movies',
    defaultMB: 4000,
    note: 'Typical download at 4.5 Mbps',
  },
  {
    id: 'doc',
    label: 'Documents — PDF',
    noun: 'document',
    pluralNoun: 'documents',
    defaultMB: 1,
    note: 'Twenty pages with a few images',
  },
  {
    id: 'app',
    label: 'Apps — mobile',
    noun: 'app',
    pluralNoun: 'apps',
    defaultMB: 200,
    note: 'Median large app with assets',
  },
];

/** Whole items of `itemBytes` that fit in `capacityBytes`. */
export function countThatFit(capacityBytes: number, itemBytes: number): number | null {
  if (!Number.isFinite(capacityBytes) || !Number.isFinite(itemBytes)) return null;
  if (capacityBytes < 0 || itemBytes <= 0) return null;
  return Math.floor(capacityBytes / itemBytes);
}

/** "3 h 20 min" for a count of minutes. */
export function minutesToClock(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const total = Math.floor(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export interface DriveReality {
  advertisedBytes: number;
  /** The same capacity expressed in the binary unit of the same tier. */
  shownValue: number;
  shownUnitLabel: string;
  /** How much smaller the displayed number looks, as a percentage. */
  missingPercent: number;
  /** The difference expressed in the advertised unit. */
  missingInAdvertisedUnit: number;
}

/**
 * What an operating system will report for a drive sold as `value` decimal
 * units at `tier` (3 = GB, 4 = TB).
 */
export function driveReality(value: number, tier: number): DriveReality | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const decimal = CAPACITY_UNITS.find((u) => u.system === 'decimal' && u.tier === tier);
  const binary = CAPACITY_UNITS.find((u) => u.system === 'binary' && u.tier === tier);
  if (!decimal || !binary) return null;
  const advertisedBytes = value * decimal.factor;
  const shownValue = advertisedBytes / binary.factor;
  return {
    advertisedBytes,
    shownValue,
    shownUnitLabel: binary.label,
    missingPercent: (1 - decimal.factor / binary.factor) * 100,
    missingInAdvertisedUnit: value - shownValue,
  };
}

export function parsePositive(text: string): number | null {
  const raw = text.trim().replace(/[\s,_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function trim(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart = ''] = fixed.split('.');
  const frac = fracPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function formatSize(bytes: number | null, decimals = 2): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1e12) return `${trim(bytes / 1e12, decimals)} TB`;
  if (bytes >= 1e9) return `${trim(bytes / 1e9, decimals)} GB`;
  if (bytes >= 1e6) return `${trim(bytes / 1e6, decimals)} MB`;
  if (bytes >= 1e3) return `${trim(bytes / 1e3, decimals)} kB`;
  return `${trim(bytes, 0)} B`;
}

/** The same ladder as `formatSize`, in the 1024-based units systems display. */
export function formatSizeBinary(bytes: number | null, decimals = 2): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1024 ** 4) return `${trim(bytes / 1024 ** 4, decimals)} TiB`;
  if (bytes >= 1024 ** 3) return `${trim(bytes / 1024 ** 3, decimals)} GiB`;
  if (bytes >= 1024 ** 2) return `${trim(bytes / 1024 ** 2, decimals)} MiB`;
  if (bytes >= 1024) return `${trim(bytes / 1024, decimals)} KiB`;
  return `${trim(bytes, 0)} B`;
}

export interface DrivePreset {
  label: string;
  value: string;
  unit: string;
}

export const DRIVE_PRESETS: DrivePreset[] = [
  { label: '64 GB', value: '64', unit: 'GB' },
  { label: '128 GB', value: '128', unit: 'GB' },
  { label: '256 GB', value: '256', unit: 'GB' },
  { label: '512 GB', value: '512', unit: 'GB' },
  { label: '1 TB', value: '1', unit: 'TB' },
  { label: '2 TB', value: '2', unit: 'TB' },
  { label: '4 TB', value: '4', unit: 'TB' },
  { label: '8 TB', value: '8', unit: 'TB' },
];
