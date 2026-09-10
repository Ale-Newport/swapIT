/**
 * Transfer time = size ÷ speed, with the one trap that makes people get it
 * wrong: links are sold in bits per second and files are measured in bytes, so
 * a 1 Gbps line moves 125 MB/s, not 1 GB/s.
 *
 *   seconds = bytes × 8 ÷ (link bits per second × efficiency)
 *
 * The efficiency factor covers protocol overhead, encoding, latency and the
 * simple fact that no link runs at its nameplate rate.
 */

export interface SpeedUnit {
  id: string;
  label: string;
  /** Bits per second in one of this unit. */
  bps: number;
  /** True when the unit counts bytes, and therefore needs the ×8. */
  isBytes: boolean;
}

export const SPEED_UNITS: SpeedUnit[] = [
  { id: 'kbps', label: 'kbps', bps: 1e3, isBytes: false },
  { id: 'Mbps', label: 'Mbps', bps: 1e6, isBytes: false },
  { id: 'Gbps', label: 'Gbps', bps: 1e9, isBytes: false },
  { id: 'KBps', label: 'KB/s', bps: 8e3, isBytes: true },
  { id: 'MBps', label: 'MB/s', bps: 8e6, isBytes: true },
  { id: 'GBps', label: 'GB/s', bps: 8e9, isBytes: true },
];

export interface SizeUnit {
  id: string;
  label: string;
  bytes: number;
}

export const SIZE_UNITS: SizeUnit[] = [
  { id: 'MB', label: 'MB', bytes: 1e6 },
  { id: 'GB', label: 'GB', bytes: 1e9 },
  { id: 'TB', label: 'TB', bytes: 1e12 },
  { id: 'MiB', label: 'MiB', bytes: 1024 ** 2 },
  { id: 'GiB', label: 'GiB', bytes: 1024 ** 3 },
];

export function speedUnit(id: string): SpeedUnit | undefined {
  return SPEED_UNITS.find((u) => u.id === id);
}

export function sizeUnit(id: string): SizeUnit | undefined {
  return SIZE_UNITS.find((u) => u.id === id);
}

/** Seconds to move `bytes` over a link of `bitsPerSecond` at `efficiency` (0–1]. */
export function transferSeconds(bytes: number, bitsPerSecond: number, efficiency = 1): number | null {
  if (![bytes, bitsPerSecond, efficiency].every((n) => Number.isFinite(n))) return null;
  if (bytes < 0 || bitsPerSecond <= 0 || efficiency <= 0) return null;
  return (bytes * 8) / (bitsPerSecond * efficiency);
}

/** Effective throughput in bytes per second. */
export function bytesPerSecond(bitsPerSecond: number, efficiency = 1): number | null {
  if (!Number.isFinite(bitsPerSecond) || !Number.isFinite(efficiency)) return null;
  if (bitsPerSecond <= 0 || efficiency <= 0) return null;
  return (bitsPerSecond * efficiency) / 8;
}

/** "3 min 20 s", "2 h 5 min", "1 d 4 h" — two units, never more. */
export function formatTransferTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 1) return `${trim(seconds, 2)} s`;
  if (seconds < 60) return `${trim(seconds, seconds < 10 ? 1 : 0)} s`;
  const total = Math.round(seconds);
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s ? `${m} min ${s} s` : `${m} min`;
  }
  if (total < 86_400) {
    const h = Math.floor(total / 3600);
    const m = Math.round((total % 3600) / 60);
    if (m === 60) return `${h + 1} h`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(total / 86_400);
  const h = Math.round((total % 86_400) / 3600);
  if (h === 24) return `${d + 1} d`;
  return h ? `${d} d ${h} h` : `${d} d`;
}

export function trim(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart = ''] = fixed.split('.');
  const frac = fracPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Bit rate written the way the industry writes it. */
export function formatRate(bitsPerSecond: number | null, decimals = 2): string {
  if (bitsPerSecond === null || !Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return '—';
  if (bitsPerSecond >= 1e9) return `${trim(bitsPerSecond / 1e9, decimals)} Gbps`;
  if (bitsPerSecond >= 1e6) return `${trim(bitsPerSecond / 1e6, decimals)} Mbps`;
  return `${trim(bitsPerSecond / 1e3, decimals)} kbps`;
}

/** Byte throughput, decimal units. */
export function formatThroughput(bps: number | null, decimals = 2): string {
  if (bps === null || !Number.isFinite(bps) || bps <= 0) return '—';
  if (bps >= 1e9) return `${trim(bps / 1e9, decimals)} GB/s`;
  if (bps >= 1e6) return `${trim(bps / 1e6, decimals)} MB/s`;
  if (bps >= 1e3) return `${trim(bps / 1e3, decimals)} kB/s`;
  return `${trim(bps, 0)} B/s`;
}

export function formatSize(bytes: number | null, decimals = 2): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1e12) return `${trim(bytes / 1e12, decimals)} TB`;
  if (bytes >= 1e9) return `${trim(bytes / 1e9, decimals)} GB`;
  if (bytes >= 1e6) return `${trim(bytes / 1e6, decimals)} MB`;
  if (bytes >= 1e3) return `${trim(bytes / 1e3, decimals)} kB`;
  return `${trim(bytes, 0)} B`;
}

export interface Connection {
  label: string;
  /** Nominal link rate in bits per second. */
  bps: number;
  note: string;
  group: 'network' | 'wireless' | 'wired';
}

/** Nameplate rates for the links people actually wait on. */
export const CONNECTIONS: Connection[] = [
  { label: 'Broadband 100 Mbps', bps: 100e6, note: 'Common cable or fibre tier', group: 'network' },
  { label: 'Gigabit Ethernet', bps: 1e9, note: '1000BASE-T, the office standard', group: 'network' },
  { label: '2.5 Gigabit Ethernet', bps: 2.5e9, note: 'Modern NAS and mainboards', group: 'network' },
  { label: '10 Gigabit Ethernet', bps: 10e9, note: 'Studio and data-centre links', group: 'network' },
  { label: '4G LTE', bps: 50e6, note: 'Typical real-world mobile', group: 'wireless' },
  { label: '5G mid-band', bps: 300e6, note: 'Good signal, not millimetre wave', group: 'wireless' },
  { label: 'Wi-Fi 5 · 80 MHz', bps: 866e6, note: '802.11ac, two streams', group: 'wireless' },
  { label: 'Wi-Fi 6 · 80 MHz', bps: 1201e6, note: '802.11ax, two streams', group: 'wireless' },
  { label: 'Wi-Fi 7 · 160 MHz', bps: 2882e6, note: '802.11be, two streams', group: 'wireless' },
  { label: 'USB 2.0', bps: 480e6, note: 'Never exceeds about 40 MB/s in practice', group: 'wired' },
  { label: 'USB 3.0 · 5 Gbps', bps: 5e9, note: '8b/10b encoding caps it near 500 MB/s', group: 'wired' },
  { label: 'USB 3.2 Gen 2 · 10 Gbps', bps: 10e9, note: '128b/132b, near 1.2 GB/s at best', group: 'wired' },
  { label: 'SATA III', bps: 6e9, note: '8b/10b encoding caps it at 600 MB/s', group: 'wired' },
  { label: 'Thunderbolt 4', bps: 40e9, note: 'Shared with display traffic; ~2.8 GB/s to storage', group: 'wired' },
];

export function parsePositive(text: string): number | null {
  const raw = text.trim().replace(/[\s,_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
