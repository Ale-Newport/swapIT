/** One row of `preview_rename` in `src-tauri/src/cmd/files.rs`. */
export interface RenamePreview {
  path: string;
  from: string;
  to: string;
  conflict: boolean;
}

/** ".JPG " → "jpg". The backend trims the dot too; this keeps the preview honest. */
export function normalizeExtension(raw: string): string {
  return raw.trim().replace(/^\.+/, '').replace(/\s+/g, '').toLowerCase();
}

/** Extensions offered as one-click choices, grouped the way people think. */
export const COMMON_EXTENSIONS = [
  'jpg',
  'png',
  'webp',
  'mp4',
  'mp3',
  'txt',
  'md',
  'json',
  'csv',
  'zip',
];

/**
 * Renaming a file does not convert it. When the new extension implies a
 * different kind of file, the tool has to say so and point at the tool that
 * really converts.
 */
export interface ConverterHint {
  label: string;
  to: string;
}

const CONVERTERS: Array<{ extensions: string[]; hint: ConverterHint }> = [
  {
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'tif', 'bmp', 'ico', 'heic', 'heif'],
    hint: { label: 'Image Converter', to: '/t/images/convert' },
  },
  {
    extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
    hint: { label: 'Video Converter', to: '/t/video/convert' },
  },
  {
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'],
    hint: { label: 'Audio Converter', to: '/t/audio/convert' },
  },
];

export function converterFor(extension: string): ConverterHint | null {
  const ext = normalizeExtension(extension);
  return CONVERTERS.find((c) => c.extensions.includes(ext))?.hint ?? null;
}

/** The distinct extensions of the selected files, most common first. */
export function currentExtensions(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    const index = name.lastIndexOf('.');
    const ext = index > 0 ? name.slice(index + 1).toLowerCase() : '';
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([ext]) => ext);
}

/**
 * True when the rename crosses file families — .png → .jpg is a real risk of a
 * file that no longer opens, while .jpeg → .jpg is just tidying.
 */
export function isRisky(from: string[], to: string): boolean {
  const target = normalizeExtension(to);
  if (!target) return false;
  const equivalents: string[][] = [
    ['jpg', 'jpeg', 'jpe', 'jfif'],
    ['tif', 'tiff'],
    ['htm', 'html'],
    ['yml', 'yaml'],
    ['md', 'markdown'],
  ];
  return from
    .filter((ext) => ext && ext !== target)
    .some((ext) => !equivalents.some((group) => group.includes(ext) && group.includes(target)));
}
