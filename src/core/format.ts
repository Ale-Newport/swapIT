/** Human-readable byte size. Uses binary units, which is what Finder reports. */
export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  const dp = i === 0 ? 0 : decimals;
  return `${value.toFixed(dp)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "1h 4m 3s" style, used by the human-readable duration tool. */
export function formatLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const neg = seconds < 0;
  let rest = Math.abs(Math.floor(seconds));
  const units: Array<[string, number]> = [
    ['year', 31536000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  const parts: string[] = [];
  for (const [name, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n} ${name}${n === 1 ? '' : 's'}`);
      rest -= n * size;
    }
  }
  if (parts.length === 0) return '0 seconds';
  return (neg ? '-' : '') + parts.join(', ');
}

export function formatTimecode(seconds: number, withMillis = false): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const base = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return withMillis ? `${base}.${String(ms).padStart(3, '0')}` : base;
}

/** Parse "1:23", "01:02:03", "83" or "1m23s" into seconds. */
export function parseTimecode(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);
  const compact = raw.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i);
  if (compact && (compact[1] || compact[2] || compact[3])) {
    return (
      parseInt(compact[1] ?? '0', 10) * 3600 +
      parseInt(compact[2] ?? '0', 10) * 60 +
      parseFloat(compact[3] ?? '0')
    );
  }
  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return parts.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

/** Relative time such as "3 minutes ago", for the recent list. */
export function formatRelative(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 45_000) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestampMs).toLocaleDateString();
}

export function sizeDelta(before: number, after: number): { percent: number; label: string; smaller: boolean } {
  if (!before) return { percent: 0, label: '—', smaller: false };
  const percent = ((before - after) / before) * 100;
  const smaller = after < before;
  const label = smaller ? `${percent.toFixed(1)}% smaller` : `${Math.abs(percent).toFixed(1)}% larger`;
  return { percent, label, smaller };
}

export function basename(path: string): string {
  return path.split('/').pop() || path;
}

export function dirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function extname(path: string): string {
  const name = basename(path);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/** Shorten a long path for display: /Users/me/…/Photos/img.jpg */
export function shortenPath(path: string, maxSegments = 3): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= maxSegments) return path;
  return `…/${parts.slice(-maxSegments).join('/')}`;
}
