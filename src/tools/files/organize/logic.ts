import type { FileInfo } from '@/core/types';

/**
 * Extension → broad kind, mirroring `kind_for_extension` in
 * `src-tauri/src/cmd/files.rs`. Kept in sync so the preview shows exactly the
 * buckets the backend will create.
 */
const KINDS: Record<string, string> = {};
function register(kind: string, extensions: string[]): void {
  for (const ext of extensions) KINDS[ext] = kind;
}

register('image', [
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'heic', 'heif', 'avif',
  'ico', 'jfif', 'qoi', 'tga', 'pbm', 'ppm', 'dds', 'exr', 'hdr',
]);
register('svg', ['svg', 'svgz']);
register('video', [
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'mts', 'm2ts', 'ogv',
]);
register('audio', [
  'mp3', 'wav', 'aac', 'flac', 'ogg', 'oga', 'm4a', 'wma', 'aiff', 'aif', 'opus', 'alac', 'amr', 'caf',
]);
register('pdf', ['pdf']);
register('document', [
  'doc', 'docx', 'odt', 'rtf', 'pages', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'epub',
]);
register('archive', ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar']);
register('text', ['txt', 'md', 'markdown', 'log', 'rst', 'tex']);
register('data', ['json', 'yaml', 'yml', 'xml', 'csv', 'tsv', 'toml', 'ini', 'plist']);
register('code', [
  'js', 'ts', 'tsx', 'jsx', 'rs', 'py', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php',
  'swift', 'kt', 'sh', 'zsh', 'html', 'css', 'scss', 'sql', 'vue',
]);
register('font', ['ttf', 'otf', 'woff', 'woff2']);

export function kindForExtension(extension: string): string {
  return KINDS[extension.replace(/^\./, '').toLowerCase()] ?? 'other';
}

/** The seven folders the backend creates in category mode, in display order. */
export const CATEGORIES = ['Images', 'Videos', 'Audio', 'Documents', 'Archives', 'Code', 'Other'] as const;

export const CATEGORY_ICONS: Record<string, string> = {
  Images: 'Image',
  Videos: 'Video',
  Audio: 'Music',
  Documents: 'FileText',
  Archives: 'FileArchive',
  Code: 'Code2',
  Other: 'File',
};

/** The subfolder a file lands in. Mirrors `organize_folder`. */
export function bucketFor(extension: string, byKind: boolean): string {
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (!byKind) return ext ? ext.toUpperCase() : 'Other';
  switch (kindForExtension(ext)) {
    case 'image':
    case 'svg':
      return 'Images';
    case 'video':
      return 'Videos';
    case 'audio':
      return 'Audio';
    case 'pdf':
    case 'document':
    case 'text':
      return 'Documents';
    case 'archive':
      return 'Archives';
    case 'code':
    case 'data':
      return 'Code';
    default:
      return 'Other';
  }
}

export interface BucketGroup {
  bucket: string;
  count: number;
  size: number;
  /** A couple of file names, so the grouping is verifiable at a glance. */
  examples: string[];
}

/**
 * Group a non-recursive listing the way the run will. Folders are ignored: the
 * backend only touches files sitting directly in the chosen folder.
 */
export function groupForOrganize(files: FileInfo[], byKind: boolean): BucketGroup[] {
  const groups = new Map<string, BucketGroup>();
  for (const file of files) {
    if (file.isDir) continue;
    if (file.name.startsWith('.')) continue;
    const bucket = bucketFor(file.extension, byKind);
    const group = groups.get(bucket) ?? { bucket, count: 0, size: 0, examples: [] };
    group.count += 1;
    group.size += file.size;
    if (group.examples.length < 3) group.examples.push(file.name);
    groups.set(bucket, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.size - a.size || a.bucket.localeCompare(b.bucket),
  );
}

export function totalOf(groups: BucketGroup[]): { count: number; size: number } {
  return groups.reduce(
    (sum, group) => ({ count: sum.count + group.count, size: sum.size + group.size }),
    { count: 0, size: 0 },
  );
}
