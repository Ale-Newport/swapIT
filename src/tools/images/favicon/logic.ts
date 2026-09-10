/**
 * The favicon set the backend writes, mirrored here so the UI can label, preview
 * and explain each file. Keep in step with `generate_favicons` in
 * `src-tauri/src/cmd/images.rs`.
 */

export interface FaviconOutput {
  name: string;
  /** Square pixel size, or null for files that are not a single bitmap. */
  size: number | null;
  label: string;
}

export const FAVICON_OUTPUTS: FaviconOutput[] = [
  { name: 'favicon.ico', size: null, label: 'Classic icon — 16, 32 and 48 px in one file' },
  { name: 'favicon-16x16.png', size: 16, label: 'Browser tab' },
  { name: 'favicon-32x32.png', size: 32, label: 'Retina tab and bookmarks' },
  { name: 'apple-touch-icon.png', size: 180, label: 'iOS home screen' },
  { name: 'android-chrome-192x192.png', size: 192, label: 'Android home screen' },
  { name: 'android-chrome-512x512.png', size: 512, label: 'Android splash screen' },
  { name: 'mstile-150x150.png', size: 150, label: 'Windows tile' },
  { name: 'site.webmanifest', size: null, label: 'Web app manifest' },
  { name: 'favicon-snippet.html', size: null, label: 'The markup below, saved as a file' },
];

/** Byte-for-byte the snippet `generate_favicons` writes next to the icons. */
export const FAVICON_SNIPPET = [
  '<link rel="icon" href="/favicon.ico" sizes="any">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
].join('\n');

/** Where the set lands unless the user picks somewhere else: a `favicon` folder beside the image. */
export function defaultFaviconDir(imagePath: string, folderName = 'favicon'): string {
  if (!imagePath.includes('/')) return folderName;
  const parts = imagePath.split('/');
  parts.pop();
  const dir = parts.join('/');
  return dir === '' ? `/${folderName}` : `${dir}/${folderName}`;
}

export function outputFor(name: string): FaviconOutput | undefined {
  return FAVICON_OUTPUTS.find((output) => output.name === name);
}

/** Characters `sanitize_filename` in src-tauri/src/paths.rs replaces with an underscore. */
const ILLEGAL_IN_NAME = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/**
 * Turn typed text into one safe path component, the way the backend would.
 * Never returns an empty name, a separator, or a traversal token.
 */
export function sanitizeFolderName(raw: string, fallback = 'favicon'): string {
  let out = '';
  for (const ch of raw) {
    out += ILLEGAL_IN_NAME.has(ch) || (ch.codePointAt(0) ?? 0) < 0x20 ? '_' : ch;
  }
  const cleaned = out.trim().replace(/^\.+|\.+$/g, '').trim().slice(0, 200);
  return cleaned === '' ? fallback : cleaned;
}

/** Where the set is written for a given output spec: a folder inside the chosen location. */
export function faviconTargetDir(
  imagePath: string | null,
  spec: { mode: string; dir?: string | null },
  folderName: string,
): string | null {
  const folder = sanitizeFolderName(folderName);
  if (spec.mode === 'custom') {
    const base = spec.dir?.trim();
    if (!base) return null;
    return base === '/' ? `/${folder}` : `${base.replace(/\/+$/, '')}/${folder}`;
  }
  if (!imagePath) return null;
  return defaultFaviconDir(imagePath, folder);
}

/** `…/favicon` → `…/favicon_1`, mirroring `unique_path` in src-tauri/src/paths.rs. */
export function numberedFolder(dir: string, n: number): string {
  return `${dir}_${n}`;
}

/** Every file `generate_favicons` writes into its output folder. */
export function faviconFilesIn(dir: string): string[] {
  return FAVICON_OUTPUTS.map((output) => `${dir}/${output.name}`);
}

/** Display size for a preview tile: real pixels, but never taller than the row. */
export function previewSize(size: number, cap = 96): number {
  return Math.min(size, cap);
}
