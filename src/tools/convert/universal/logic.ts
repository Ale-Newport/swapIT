import type { BinaryId, FileKind, OutputSpec } from '@/core/types';

/**
 * The conversion table behind the universal converter.
 *
 * Every entry says three things a person needs before they click Convert: what
 * comes out, which program does the work, and which knob is worth turning. A
 * pair that another tool already does properly is a `handoff` instead of a
 * half-implementation — the UI sends the files there rather than pretending.
 */

/** Which control the target's quality is expressed with. */
export type QualityKind = 'imageQuality' | 'videoCrf' | 'audioBitrate' | 'pdfRaster' | 'gif' | 'none';

export interface HandoffTarget {
  toolId: string;
  toolName: string;
  reason: string;
}

export interface ConversionTarget {
  /** Output extension, also the value used by the chip row. */
  ext: string;
  /** Chip label, e.g. "JPEG". */
  label: string;
  /** The program that does the work, shown to the user before they run it. */
  engine: string;
  /** Binaries that must be installed for this pair to work at all. */
  requires: BinaryId[];
  /** Backend command, or null when this pair is handled by another tool. */
  command: string | null;
  quality: QualityKind;
  /** The quality control only does something when this binary is present. */
  qualityRequires?: BinaryId;
  note?: string;
  handoff?: HandoffTarget;
}

/** Kinds the converter knows how to route. Everything else is refused up front. */
export const CONVERTIBLE_KINDS: FileKind[] = ['image', 'svg', 'video', 'audio', 'pdf', 'document'];

export const KIND_LABEL: Record<string, string> = {
  image: 'Images',
  svg: 'SVG files',
  video: 'Videos',
  audio: 'Audio files',
  pdf: 'PDFs',
  document: 'Documents',
};

export const KIND_ICON: Record<string, string> = {
  image: 'Image',
  svg: 'PenTool',
  video: 'Video',
  audio: 'AudioLines',
  pdf: 'FileText',
  document: 'FileType',
};

const IMAGES_TO_PDF: HandoffTarget = {
  toolId: 'pdf/images-to-pdf',
  toolName: 'Images to PDF',
  reason:
    'Putting photos on PDF pages needs a page size, an orientation and a margin, so it lives in its own tool.',
};

const SVG_TO_RASTER: HandoffTarget = {
  toolId: 'svg/to-raster',
  toolName: 'SVG to PNG or JPG',
  reason: 'Vectors have no fixed pixel size, so rasterising asks for a scale or an exact width first.',
};

const SVG_TO_PDF: HandoffTarget = {
  toolId: 'svg/to-pdf',
  toolName: 'SVG to PDF',
  reason: 'A PDF page needs a paper size and orientation before the artwork can be placed on it.',
};

const IMAGE_TARGETS: ConversionTarget[] = [
  { ext: 'jpg', label: 'JPEG', engine: 'Built-in image engine', requires: [], command: 'process_images', quality: 'imageQuality' },
  { ext: 'png', label: 'PNG', engine: 'Built-in image engine', requires: [], command: 'process_images', quality: 'none', note: 'Lossless, keeps transparency.' },
  {
    ext: 'webp',
    label: 'WebP',
    engine: 'Built-in image engine',
    requires: [],
    command: 'process_images',
    quality: 'imageQuality',
    qualityRequires: 'magick',
  },
  { ext: 'avif', label: 'AVIF', engine: 'ImageMagick', requires: ['magick'], command: 'process_images', quality: 'imageQuality' },
  { ext: 'tiff', label: 'TIFF', engine: 'Built-in image engine', requires: [], command: 'process_images', quality: 'none' },
  { ext: 'bmp', label: 'BMP', engine: 'Built-in image engine', requires: [], command: 'process_images', quality: 'none' },
  { ext: 'gif', label: 'GIF', engine: 'Built-in image engine', requires: [], command: 'process_images', quality: 'none', note: 'One frame per file — animation is not preserved.' },
  { ext: 'ico', label: 'ICO', engine: 'Built-in image engine', requires: [], command: 'process_images', quality: 'none' },
  { ext: 'pdf', label: 'PDF', engine: 'Images to PDF', requires: [], command: null, quality: 'none', handoff: IMAGES_TO_PDF },
];

const VIDEO_TARGETS: ConversionTarget[] = [
  { ext: 'mp4', label: 'MP4', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'videoCrf', note: 'H.264 and AAC — plays everywhere.' },
  { ext: 'mov', label: 'MOV', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'videoCrf' },
  { ext: 'mkv', label: 'MKV', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'videoCrf' },
  { ext: 'webm', label: 'WebM', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'videoCrf', note: 'VP9 and Opus — small, but slow to encode.' },
  { ext: 'avi', label: 'AVI', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Written with the MPEG-4 codec at FFmpeg’s default quality.' },
  { ext: 'm4v', label: 'M4V', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'videoCrf' },
  { ext: 'gif', label: 'GIF', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'video_to_gif', quality: 'gif', note: 'Animated, with a palette generated per clip.' },
  { ext: 'mp3', label: 'MP3', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Audio only, at FFmpeg’s default quality for the container.' },
  { ext: 'm4a', label: 'M4A', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Audio only, at FFmpeg’s default quality for the container.' },
  { ext: 'wav', label: 'WAV', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Audio only, uncompressed PCM.' },
  { ext: 'flac', label: 'FLAC', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Audio only, lossless.' },
];

const AUDIO_TARGETS: ConversionTarget[] = [
  { ext: 'mp3', label: 'MP3', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'audioBitrate' },
  { ext: 'm4a', label: 'M4A', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'audioBitrate', note: 'AAC — better than MP3 at the same size.' },
  { ext: 'wav', label: 'WAV', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Uncompressed 16-bit PCM.' },
  { ext: 'flac', label: 'FLAC', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Lossless, about half the size of WAV.' },
  { ext: 'ogg', label: 'OGG', engine: 'FFmpeg', requires: ['ffmpeg'], command: 'process_video', quality: 'none', note: 'Vorbis at FFmpeg’s default quality.' },
  {
    ext: 'opus',
    label: 'Opus',
    engine: 'FFmpeg',
    requires: ['ffmpeg'],
    command: 'process_video',
    // An Opus file is an Ogg stream, and Ogg cannot carry cover art at all, so the
    // picture has to be dropped — which is the one path `process_video` gives no
    // bitrate knob. See AUDIO_CODECS below.
    quality: 'none',
    note: 'The best quality per megabyte, at FFmpeg’s default rate. Cover art is dropped.',
  },
];

const PDF_TARGETS: ConversionTarget[] = [
  { ext: 'png', label: 'PNG', engine: 'Poppler (pdftoppm)', requires: ['pdftoppm'], command: 'pdf_to_images', quality: 'pdfRaster', note: 'One image per page, in a folder beside the PDF.' },
  { ext: 'jpg', label: 'JPEG', engine: 'Poppler (pdftoppm)', requires: ['pdftoppm'], command: 'pdf_to_images', quality: 'pdfRaster', note: 'One image per page, in a folder beside the PDF.' },
  { ext: 'txt', label: 'Text', engine: 'Poppler (pdftotext)', requires: ['pdftotext'], command: 'pdf_to_text', quality: 'none', note: 'Only PDFs with embedded text — scans need the OCR tool.' },
  {
    ext: 'docx',
    label: 'Word',
    engine: 'LibreOffice',
    requires: ['soffice'],
    command: 'convert_document',
    quality: 'none',
    note: 'LibreOffice re-flows the page, so complex layouts can shift.',
  },
];

const DOCUMENT_TARGETS: ConversionTarget[] = [
  { ext: 'pdf', label: 'PDF', engine: 'LibreOffice', requires: ['soffice'], command: 'convert_document', quality: 'none' },
  { ext: 'docx', label: 'Word', engine: 'LibreOffice', requires: ['soffice'], command: 'convert_document', quality: 'none' },
  { ext: 'odt', label: 'ODT', engine: 'LibreOffice', requires: ['soffice'], command: 'convert_document', quality: 'none' },
  { ext: 'rtf', label: 'RTF', engine: 'LibreOffice', requires: ['soffice'], command: 'convert_document', quality: 'none' },
  { ext: 'html', label: 'HTML', engine: 'LibreOffice', requires: ['soffice'], command: 'convert_document', quality: 'none' },
  { ext: 'txt', label: 'Text', engine: 'LibreOffice', requires: ['soffice'], command: 'convert_document', quality: 'none', note: 'Formatting and images are dropped.' },
  {
    ext: 'md',
    label: 'Markdown',
    engine: 'Pandoc',
    requires: ['pandoc'],
    command: 'pandoc_convert',
    quality: 'none',
    note: 'Pandoc reads DOCX, ODT, EPUB and HTML.',
  },
];

const SVG_TARGETS: ConversionTarget[] = [
  { ext: 'png', label: 'PNG', engine: 'SVG to PNG or JPG', requires: [], command: null, quality: 'none', handoff: SVG_TO_RASTER },
  { ext: 'jpg', label: 'JPEG', engine: 'SVG to PNG or JPG', requires: [], command: null, quality: 'none', handoff: SVG_TO_RASTER },
  { ext: 'pdf', label: 'PDF', engine: 'SVG to PDF', requires: [], command: null, quality: 'none', handoff: SVG_TO_PDF },
];

const TABLE: Record<string, ConversionTarget[]> = {
  image: IMAGE_TARGETS,
  video: VIDEO_TARGETS,
  audio: AUDIO_TARGETS,
  pdf: PDF_TARGETS,
  document: DOCUMENT_TARGETS,
  svg: SVG_TARGETS,
};

/** Sources Pandoc can actually read, so document → Markdown is never offered blindly. */
const PANDOC_SOURCES = new Set(['docx', 'odt', 'epub', 'html', 'htm']);

/**
 * What LibreOffice can write for the documents it reads. A text document reaches every format
 * in the table; a spreadsheet or a slide deck has no Word, ODT, RTF or text export, and an e-book
 * cannot be opened at all, so offering those would only end in an error.
 */
const SPREADSHEETS = new Set(['xls', 'xlsx', 'ods']);
const SLIDES = new Set(['ppt', 'pptx', 'odp']);
const SPREADSHEET_TARGETS = new Set(['pdf', 'html']);
const SLIDE_TARGETS = new Set(['pdf']);

function officeBlock(ext: string, target: string): string | null {
  // LibreOffice has no EPUB import ("source file could not be loaded"); Pandoc reads them.
  if (ext === 'epub') return 'LibreOffice cannot open e-books — Markdown (through Pandoc) works.';
  if (SPREADSHEETS.has(ext) && !SPREADSHEET_TARGETS.has(target)) {
    return `LibreOffice turns a spreadsheet into PDF or HTML, not .${target}.`;
  }
  if (SLIDES.has(ext) && !SLIDE_TARGETS.has(target)) {
    return `LibreOffice turns slides into PDF, not .${target}.`;
  }
  return null;
}

export function targetsForKind(kind: FileKind): ConversionTarget[] {
  return TABLE[kind] ?? [];
}

/** "jpeg" and "jpg" are the same target; so are "tif" and "tiff". */
export function normalizeExt(ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase();
  if (e === 'jpeg' || e === 'jfif') return 'jpg';
  if (e === 'tif') return 'tiff';
  if (e === 'htm') return 'html';
  if (e === 'markdown') return 'md';
  return e;
}

export interface TargetAvailability {
  target: ConversionTarget;
  available: boolean;
  /** Binaries that are missing, when `available` is false. */
  missing: BinaryId[];
  /** Why the target is not offered, when the reason is not a missing binary. */
  blocked?: string;
}

/**
 * The targets a group of files can actually reach right now: the table filtered
 * by what the sources are and by which programs are installed.
 */
export function availableTargets(
  kind: FileKind,
  sourceExtensions: string[],
  isInstalled: (id: BinaryId) => boolean,
): TargetAvailability[] {
  const sources = sourceExtensions.map(normalizeExt);
  return targetsForKind(kind).map((target) => {
    const missing = target.requires.filter((id) => !isInstalled(id));
    if (target.command === 'pandoc_convert') {
      const unreadable = sources.filter((ext) => !PANDOC_SOURCES.has(ext));
      if (unreadable.length > 0) {
        return {
          target,
          available: false,
          missing: [],
          blocked: `Pandoc cannot read .${unreadable[0]} files — convert to DOCX or HTML first.`,
        };
      }
    }
    if (target.command === 'convert_document' && kind === 'document') {
      const blocked = sources.map((ext) => officeBlock(ext, target.ext)).find((reason) => reason !== null);
      if (blocked) return { target, available: false, missing: [], blocked };
    }
    return { target, available: missing.length === 0, missing };
  });
}

/**
 * The format pre-selected for a group: the first one that is both available and
 * different from what the files already are, so the default is never a no-op.
 */
export function pickDefaultTarget(entries: TargetAvailability[], sourceExtensions: string[]): string {
  const pool = entries.some((e) => e.available) ? entries.filter((e) => e.available) : entries;
  if (pool.length === 0) return '';
  const sources = new Set(sourceExtensions.map(normalizeExt));
  const only = sources.size === 1 ? [...sources][0] : null;
  const differs = pool.find((e) => normalizeExt(e.target.ext) !== only);
  return (differs ?? pool[0]).target.ext;
}

export function findTarget(kind: FileKind, ext: string): ConversionTarget | undefined {
  return targetsForKind(kind).find((t) => t.ext === ext);
}

/** A group of dropped files that share a kind and therefore share a target. */
export interface KindGroup {
  kind: FileKind;
  paths: string[];
  /** Distinct source extensions in the group, lower-case and normalised. */
  extensions: string[];
}

const GROUP_ORDER: FileKind[] = ['image', 'video', 'audio', 'pdf', 'document', 'svg'];

export function groupFilesByKind(
  files: Array<{ path: string; kind: FileKind; extension: string }>,
): KindGroup[] {
  const byKind = new Map<FileKind, KindGroup>();
  for (const file of files) {
    if (!CONVERTIBLE_KINDS.includes(file.kind)) continue;
    let group = byKind.get(file.kind);
    if (!group) {
      group = { kind: file.kind, paths: [], extensions: [] };
      byKind.set(file.kind, group);
    }
    group.paths.push(file.path);
    const ext = normalizeExt(file.extension);
    if (ext && !group.extensions.includes(ext)) group.extensions.push(ext);
  }
  return GROUP_ORDER.filter((k) => byKind.has(k)).map((k) => byKind.get(k) as KindGroup);
}

// ------------------------------------------------------------------ quality

export interface QualityChoices {
  imageQuality: number;
  crf: number;
  audioBitrate: string;
  pdfDpi: number;
  gifWidth: number;
  gifFps: number;
}

export const DEFAULT_QUALITY: QualityChoices = {
  imageQuality: 85,
  crf: 23,
  audioBitrate: '192k',
  pdfDpi: 150,
  gifWidth: 480,
  gifFps: 12,
};

export const AUDIO_BITRATES = ['320k', '256k', '192k', '160k', '128k', '96k'];
export const PDF_DPI_CHOICES = [72, 150, 300, 600];
export const GIF_WIDTHS = [320, 480, 640, 800];
export const GIF_FPS = [8, 10, 12, 15, 20];

/**
 * Containers whose bitrate `process_video` can actually be told to honour, and the
 * encoder it has to be handed to get it.
 *
 * `build_video_args` only emits `-b:a` outside `audioOnly` mode, and outside that
 * mode FFmpeg keeps the source's other streams — for a tagged music file, the
 * embedded cover art. That is only safe where the target container can hold a
 * picture: MP3 stores it as an ID3 APIC frame and M4A as a `covr` atom, both of
 * which FFmpeg writes happily. Ogg — and therefore Opus — can hold no picture
 * stream whatsoever and aborts with “Could not find tag for codec mjpeg”, so Opus
 * is converted through the `-vn` path with WAV, FLAC and OGG instead, and offers
 * no bitrate control.
 */
const AUDIO_CODECS: Record<string, string> = {
  mp3: 'libmp3lame',
  m4a: 'aac',
};

// ------------------------------------------------------------------ dispatch

export interface JobPlan {
  command: string;
  args: Record<string, unknown>;
  label: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Turn a chosen pair into the exact backend call. Kept pure so the routing —
 * the part that is easy to get subtly wrong — is covered by tests.
 */
export function planConversion(params: {
  kind: FileKind;
  targetExt: string;
  paths: string[];
  output: OutputSpec;
  quality: QualityChoices;
}): JobPlan {
  const { kind, targetExt, paths, output, quality } = params;
  const target = findTarget(kind, targetExt);
  if (!target) {
    throw new Error(`Toolbox cannot turn ${KIND_LABEL[kind] ?? kind} into .${targetExt} files.`);
  }
  if (!target.command) {
    throw new Error(
      `${target.handoff?.toolName ?? 'Another tool'} handles this conversion — open it from the card above.`,
    );
  }

  const count = paths.length;
  const noun =
    kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio file' : kind === 'pdf' ? 'PDF' : 'document';
  const label = `Convert ${plural(count, noun, `${noun}s`)} to ${target.label}`;

  switch (target.command) {
    case 'process_images': {
      const lossy = targetExt === 'jpg' || targetExt === 'webp' || targetExt === 'avif';
      return {
        command: 'process_images',
        label,
        args: {
          inputs: paths,
          ops: { format: targetExt, quality: lossy ? quality.imageQuality : undefined },
          output,
        },
      };
    }
    case 'video_to_gif':
      return {
        command: 'video_to_gif',
        label,
        args: {
          inputs: paths,
          ops: { gifFps: quality.gifFps, gifWidth: quality.gifWidth },
          output,
        },
      };
    case 'process_video': {
      const ops: Record<string, unknown> = { format: targetExt };
      if (kind === 'audio') {
        // A container that can carry the source's cover art is encoded with an
        // explicit codec and bitrate, copying that picture across. Everything else
        // drops it with -vn, which is also the only way FFmpeg will accept an Ogg
        // or Opus output for a file that has one.
        const codec = AUDIO_CODECS[targetExt];
        if (codec) {
          ops.videoCodec = 'copy';
          ops.audioCodec = codec;
          ops.audioBitrate = quality.audioBitrate;
        } else {
          ops.audioOnly = true;
        }
      } else if (target.quality === 'videoCrf') {
        ops.crf = quality.crf;
      } else if (targetExt !== 'avi') {
        // A video turning into an audio container: drop the picture stream.
        // (AVI is the one video container with no CRF knob, so it sends nothing.)
        ops.audioOnly = true;
      }
      return { command: 'process_video', label, args: { inputs: paths, ops, output } };
    }
    case 'pdf_to_images':
      return {
        command: 'pdf_to_images',
        label,
        args: {
          inputs: paths,
          opts: {
            format: targetExt,
            dpi: quality.pdfDpi,
            jpegQuality: targetExt === 'jpg' ? quality.imageQuality : undefined,
          },
          output,
        },
      };
    case 'pdf_to_text':
      return { command: 'pdf_to_text', label, args: { inputs: paths, layout: true, output } };
    case 'convert_document':
      return { command: 'convert_document', label, args: { inputs: paths, targetFormat: targetExt, output } };
    case 'pandoc_convert':
      return { command: 'pandoc_convert', label, args: { inputs: paths, toFormat: 'gfm', output } };
    default:
      throw new Error(`Toolbox does not know how to run “${target.command}”.`);
  }
}
