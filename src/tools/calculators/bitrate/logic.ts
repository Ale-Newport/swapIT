/**
 * Bitrate ↔ duration ↔ file size. One relationship, three ways round:
 *
 *   bytes = bitrate (bits/s) × seconds ÷ 8
 *
 * Sizes are handled in decimal bytes (1 MB = 1,000,000 B) because that is the
 * convention every encoder and streaming spec quotes; the binary equivalent is
 * shown alongside rather than silently substituted.
 */

export type BitrateUnit = 'bps' | 'kbps' | 'Mbps';
export type DurationUnit = 'seconds' | 'minutes' | 'hours';
export type SizeUnit = 'MB' | 'GB' | 'MiB' | 'GiB';

export const BITRATE_FACTOR: Record<BitrateUnit, number> = { bps: 1, kbps: 1e3, Mbps: 1e6 };
export const DURATION_FACTOR: Record<DurationUnit, number> = { seconds: 1, minutes: 60, hours: 3600 };
export const SIZE_FACTOR: Record<SizeUnit, number> = {
  MB: 1e6,
  GB: 1e9,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
};

export const BITRATE_LABEL: Record<BitrateUnit, string> = { bps: 'bit/s', kbps: 'kbps', Mbps: 'Mbps' };

/** Bytes produced by a stream of `bitsPerSecond` running for `seconds`. */
export function sizeFromBitrate(bitsPerSecond: number, seconds: number): number | null {
  if (!Number.isFinite(bitsPerSecond) || !Number.isFinite(seconds)) return null;
  if (bitsPerSecond < 0 || seconds < 0) return null;
  return (bitsPerSecond * seconds) / 8;
}

/** Average bitrate of `bytes` spread over `seconds`. */
export function bitrateFromSize(bytes: number, seconds: number): number | null {
  if (!Number.isFinite(bytes) || !Number.isFinite(seconds) || seconds <= 0 || bytes < 0) return null;
  return (bytes * 8) / seconds;
}

/** How long `bytes` last at `bitsPerSecond`. */
export function durationFromSize(bytes: number, bitsPerSecond: number): number | null {
  if (!Number.isFinite(bytes) || !Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0 || bytes < 0) return null;
  return (bytes * 8) / bitsPerSecond;
}

/** Pick a readable bitrate unit: 128 kbps, 8.5 Mbps, 640 bit/s. */
export function formatBitrate(bitsPerSecond: number | null, decimals = 2): string {
  if (bitsPerSecond === null || !Number.isFinite(bitsPerSecond) || bitsPerSecond < 0) return '—';
  if (bitsPerSecond >= 1e6) return `${trim(bitsPerSecond / 1e6, decimals)} Mbps`;
  if (bitsPerSecond >= 1e3) return `${trim(bitsPerSecond / 1e3, decimals)} kbps`;
  return `${trim(bitsPerSecond, decimals)} bit/s`;
}

/** Decimal byte size with the unit chosen for readability. */
export function formatSize(bytes: number | null, decimals = 2): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1e12) return `${trim(bytes / 1e12, decimals)} TB`;
  if (bytes >= 1e9) return `${trim(bytes / 1e9, decimals)} GB`;
  if (bytes >= 1e6) return `${trim(bytes / 1e6, decimals)} MB`;
  if (bytes >= 1e3) return `${trim(bytes / 1e3, decimals)} kB`;
  return `${trim(bytes, 0)} B`;
}

/** The same size in binary units, which is what a file manager will show. */
export function formatSizeBinary(bytes: number | null, decimals = 2): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1024 ** 4) return `${trim(bytes / 1024 ** 4, decimals)} TiB`;
  if (bytes >= 1024 ** 3) return `${trim(bytes / 1024 ** 3, decimals)} GiB`;
  if (bytes >= 1024 ** 2) return `${trim(bytes / 1024 ** 2, decimals)} MiB`;
  if (bytes >= 1024) return `${trim(bytes / 1024, decimals)} KiB`;
  return `${trim(bytes, 0)} B`;
}

/** "2 h 5 min 3 s", or "0.75 s" for anything under a second. */
export function formatDurationLong(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 1) return `${trim(seconds, 3)} s`;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s || parts.length === 0) parts.push(`${s} s`);
  return parts.join(' ');
}

/** Round, drop trailing zeros, group thousands — locale independent. */
export function trim(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  const [intPart, fracPart = ''] = fixed.split('.');
  const frac = fracPart.replace(/0+$/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function parseNonNegative(text: string): number | null {
  const raw = text.trim().replace(/[\s,_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface BitratePreset {
  label: string;
  /** Video bitrate in kbps — 0 for audio-only targets. */
  videoKbps: number;
  audioKbps: number;
  note: string;
}

/** Bitrates the platforms themselves recommend, in kbps. */
export const PRESETS: BitratePreset[] = [
  { label: 'YouTube 1080p30', videoKbps: 8000, audioKbps: 128, note: 'SDR upload guideline' },
  { label: 'YouTube 1080p60', videoKbps: 12000, audioKbps: 128, note: 'SDR upload guideline' },
  { label: 'YouTube 4K30', videoKbps: 35000, audioKbps: 192, note: 'SDR upload guideline' },
  { label: 'Live stream 1080p60', videoKbps: 6000, audioKbps: 160, note: 'Typical RTMP ingest ceiling' },
  { label: 'Video call HD', videoKbps: 2000, audioKbps: 64, note: 'Comfortable on most connections' },
  { label: 'Podcast mono', videoKbps: 0, audioKbps: 64, note: 'Speech, 64 kbps mono AAC' },
  { label: 'Podcast stereo', videoKbps: 0, audioKbps: 128, note: 'Music beds and stereo hosts' },
  { label: 'MP3 320', videoKbps: 0, audioKbps: 320, note: 'Highest common MP3 rate' },
  { label: 'CD audio', videoKbps: 0, audioKbps: 1411, note: '44.1 kHz × 16 bit × 2 channels' },
];
