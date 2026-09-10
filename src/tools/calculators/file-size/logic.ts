/**
 * Byte-unit conversion, kept deliberately explicit about the two conventions:
 * SI decimal units (kB = 1000 B, what drive makers and macOS use) and IEC
 * binary units (KiB = 1024 B, what RAM, Windows Explorer and most developers
 * mean). Everything converts through an exact byte count.
 */

export type UnitSystem = 'decimal' | 'binary';

export interface Unit {
  id: string;
  /** Symbol as written: kB, MiB … */
  short: string;
  label: string;
  system: UnitSystem;
  /** Bytes in one of this unit. */
  factor: number;
  /** 0 = bytes, 1 = kilo, 2 = mega … used to pair the two systems up. */
  tier: number;
}

export const DECIMAL_UNITS: Unit[] = [
  { id: 'B', short: 'B', label: 'Bytes', system: 'decimal', factor: 1, tier: 0 },
  { id: 'kB', short: 'kB', label: 'Kilobytes', system: 'decimal', factor: 1e3, tier: 1 },
  { id: 'MB', short: 'MB', label: 'Megabytes', system: 'decimal', factor: 1e6, tier: 2 },
  { id: 'GB', short: 'GB', label: 'Gigabytes', system: 'decimal', factor: 1e9, tier: 3 },
  { id: 'TB', short: 'TB', label: 'Terabytes', system: 'decimal', factor: 1e12, tier: 4 },
  { id: 'PB', short: 'PB', label: 'Petabytes', system: 'decimal', factor: 1e15, tier: 5 },
];

export const BINARY_UNITS: Unit[] = [
  { id: 'B2', short: 'B', label: 'Bytes', system: 'binary', factor: 1, tier: 0 },
  { id: 'KiB', short: 'KiB', label: 'Kibibytes', system: 'binary', factor: 1024, tier: 1 },
  { id: 'MiB', short: 'MiB', label: 'Mebibytes', system: 'binary', factor: 1024 ** 2, tier: 2 },
  { id: 'GiB', short: 'GiB', label: 'Gibibytes', system: 'binary', factor: 1024 ** 3, tier: 3 },
  { id: 'TiB', short: 'TiB', label: 'Tebibytes', system: 'binary', factor: 1024 ** 4, tier: 4 },
  { id: 'PiB', short: 'PiB', label: 'Pebibytes', system: 'binary', factor: 1024 ** 5, tier: 5 },
];

export const ALL_UNITS: Unit[] = [...DECIMAL_UNITS, ...BINARY_UNITS];

export function unitById(id: string): Unit | undefined {
  return ALL_UNITS.find((u) => u.id === id);
}

export function toBytes(value: number, unitId: string): number | null {
  const unit = unitById(unitId);
  if (!unit || !Number.isFinite(value) || value < 0) return null;
  return value * unit.factor;
}

export function fromBytes(bytes: number, unitId: string): number | null {
  const unit = unitById(unitId);
  if (!unit || !Number.isFinite(bytes) || bytes < 0) return null;
  return bytes / unit.factor;
}

/** The unit that renders a byte count with a value between 1 and 1000/1024. */
export function bestUnit(bytes: number, system: UnitSystem): Unit {
  const list = system === 'decimal' ? DECIMAL_UNITS : BINARY_UNITS;
  let chosen = list[0];
  for (const unit of list) {
    if (bytes >= unit.factor) chosen = unit;
  }
  return chosen;
}

/**
 * Display a quantity with about ten significant digits, grouped, with trailing
 * zeros removed — no locale involved so the tests and the UI agree.
 */
export function formatQuantity(value: number | null, maxSignificant = 10): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e18 || abs < 1e-6) return value.toExponential(4);
  // Significant digits are counted from the first non-zero digit, so 0.00097…
  // keeps its precision instead of collapsing to three decimals.
  const magnitude = Math.floor(Math.log10(abs)) + 1;
  const decimals = Math.max(0, Math.min(12, maxSignificant - magnitude));
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart = ''] = fixed.split('.');
  const frac = fracPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export interface Ambiguity {
  /** What the number means read as a decimal unit. */
  decimalBytes: number;
  /** What it means read as the binary unit of the same tier. */
  binaryBytes: number;
  differenceBytes: number;
  /** How much bigger the binary reading is, in percent. */
  differencePercent: number;
  decimalUnit: Unit;
  binaryUnit: Unit;
}

/**
 * "4 GB" is either 4,000,000,000 or 4,294,967,296 bytes depending on who wrote
 * it. This spells the gap out for a given tier.
 */
export function ambiguity(value: number, tier: number): Ambiguity | null {
  if (!Number.isFinite(value) || value < 0 || tier <= 0) return null;
  const decimalUnit = DECIMAL_UNITS.find((u) => u.tier === tier);
  const binaryUnit = BINARY_UNITS.find((u) => u.tier === tier);
  if (!decimalUnit || !binaryUnit) return null;
  const decimalBytes = value * decimalUnit.factor;
  const binaryBytes = value * binaryUnit.factor;
  return {
    decimalBytes,
    binaryBytes,
    differenceBytes: binaryBytes - decimalBytes,
    differencePercent: decimalBytes === 0 ? 0 : ((binaryBytes - decimalBytes) / decimalBytes) * 100,
    decimalUnit,
    binaryUnit,
  };
}

export function parseAmount(text: string): number | null {
  const raw = text.trim().replace(/[\s_]/g, '');
  if (!raw) return null;
  const cleaned = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.');
  if (!/^\d*\.?\d+([eE][+-]?\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
