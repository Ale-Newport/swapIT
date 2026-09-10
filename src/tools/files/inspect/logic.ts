import type { FileInfo, FileKind } from '@/core/types';

/** `ImageInfo` from `src-tauri/src/cmd/images.rs`. */
export interface ImageInfo {
  path: string;
  name: string;
  width: number;
  height: number;
  megapixels: number;
  aspectRatio: string;
  colorType: string;
  format: string;
  size: number;
  hasAlpha: boolean;
}

/** `StreamInfo` / `MediaInfo` from `src-tauri/src/cmd/media.rs`. */
export interface StreamInfo {
  index: number;
  kind: string;
  codec: string;
  codecLong: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
  channelLayout?: string | null;
  pixFmt?: string | null;
  language?: string | null;
}

export interface MediaInfo {
  path: string;
  name: string;
  size: number;
  duration?: number | null;
  formatName: string;
  formatLong: string;
  bitrate?: number | null;
  streams: StreamInfo[];
  tags: Array<[string, string]>;
  video?: StreamInfo | null;
  audio?: StreamInfo | null;
}

/** `PdfInfo` from `src-tauri/src/cmd/pdf.rs`. */
export interface PdfInfo {
  path: string;
  name: string;
  size: number;
  pages: number;
  encrypted: boolean;
  title?: string | null;
  author?: string | null;
  subject?: string | null;
  keywords?: string | null;
  creator?: string | null;
  producer?: string | null;
  creationDate?: string | null;
  pageSize?: string | null;
  pdfVersion?: string | null;
  tagged: boolean;
}

/** `ArchiveEntry` from `src-tauri/src/cmd/archives.rs`. */
export interface ArchiveEntry {
  name: string;
  size: number;
  compressed: number;
  isDir: boolean;
}

export interface MetadataEntry {
  group: string;
  tag: string;
  value: string;
}

export interface FileHashes {
  path: string;
  name: string;
  size: number;
  sha256?: string | null;
}

/** Kinds whose text can be shown inline, when the file is small enough. */
export const TEXT_KINDS: FileKind[] = ['text', 'data', 'code'];

/** Reading a file into the renderer only makes sense while it is small. */
export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
export const TEXT_PREVIEW_LINES = 200;

export function canPreviewText(file: FileInfo): boolean {
  return !file.isDir && TEXT_KINDS.includes(file.kind) && file.size > 0 && file.size <= MAX_TEXT_PREVIEW_BYTES;
}

/** Formats a browser <img> can actually decode, for the inline preview. */
const VIEWABLE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']);

export function canPreviewImage(file: FileInfo): boolean {
  return VIEWABLE_IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

export interface TextPreview {
  text: string;
  truncated: boolean;
  binary: boolean;
}

/** Trim decoded text to the first lines, and spot content that is not text at all. */
export function buildTextPreview(raw: string, maxLines = TEXT_PREVIEW_LINES): TextPreview {
  const head = raw.slice(0, 200_000);
  if (head.includes('\u0000')) return { text: '', truncated: false, binary: true };
  const lines = head.split('\n');
  const truncated = lines.length > maxLines || head.length < raw.length;
  return { text: lines.slice(0, maxLines).join('\n'), truncated, binary: false };
}

export interface ArchiveSummary {
  files: number;
  folders: number;
  uncompressed: number;
  compressed: number;
  /** Percentage saved by compression, 0 when the archive stores raw copies. */
  savings: number;
}

export function summarizeArchive(entries: ArchiveEntry[]): ArchiveSummary {
  let files = 0;
  let folders = 0;
  let uncompressed = 0;
  let compressed = 0;
  for (const entry of entries) {
    if (entry.isDir) folders += 1;
    else {
      files += 1;
      uncompressed += entry.size;
      compressed += entry.compressed;
    }
  }
  const savings = uncompressed > 0 ? Math.max(0, ((uncompressed - compressed) / uncompressed) * 100) : 0;
  return { files, folders, uncompressed, compressed, savings };
}

export function streamLabel(stream: StreamInfo): string {
  const parts: string[] = [stream.codec];
  if (stream.width && stream.height) parts.push(`${stream.width}×${stream.height}`);
  if (stream.fps) parts.push(`${stream.fps.toFixed(2)} fps`);
  if (stream.sampleRate) parts.push(`${(stream.sampleRate / 1000).toFixed(1)} kHz`);
  if (stream.channels) parts.push(`${stream.channels} ch`);
  if (stream.language) parts.push(stream.language);
  return parts.join(' · ');
}

/** Which optional program each kind of detail needs, for an honest error note. */
export const REQUIREMENT_NOTES: Record<string, string> = {
  media: 'Codec, duration and stream details come from FFprobe, part of FFmpeg.',
  thumbnail: 'The preview frame is grabbed with FFmpeg.',
  pdf: 'Page count and document properties come from Poppler.',
  exif: 'EXIF is read in place; ExifTool widens what can be read.',
};

export function humanKind(kind: FileKind): string {
  const labels: Record<string, string> = {
    image: 'Image',
    svg: 'Vector image',
    video: 'Video',
    audio: 'Audio',
    pdf: 'PDF document',
    document: 'Document',
    archive: 'Archive',
    text: 'Text',
    data: 'Structured data',
    code: 'Source code',
    font: 'Font',
    folder: 'Folder',
    other: 'File',
  };
  return labels[kind] ?? 'File';
}
