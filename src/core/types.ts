import type { ComponentType } from 'react';

export type CategoryId =
  | 'convert'
  | 'images'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'qr'
  | 'svg'
  | 'text'
  | 'developer'
  | 'files'
  | 'generators'
  | 'datetime'
  | 'calculators'
  | 'clipboard'
  | 'capture';

/** Broad file classification, mirrored in `src-tauri/src/cmd/files.rs`. */
export type FileKind =
  | 'image'
  | 'svg'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'archive'
  | 'text'
  | 'data'
  | 'code'
  | 'font'
  | 'folder'
  | 'other';

/** External programs a tool may depend on. Mirrors `binaries.rs`. */
export type BinaryId =
  | 'ffmpeg'
  | 'ffprobe'
  | 'magick'
  | 'gs'
  | 'pdftoppm'
  | 'pdftotext'
  | 'qpdf'
  | 'exiftool'
  | 'tesseract'
  | 'yt-dlp'
  | 'pandoc'
  | 'soffice';

export interface AcceptSpec {
  /** Lower-case extensions without a dot. */
  extensions?: string[];
  kinds?: FileKind[];
  /** When true the tool works on folders rather than files. */
  folders?: boolean;
  /** When false the tool takes exactly one input. */
  multiple?: boolean;
}

export interface ToolDefinition {
  /** `category/slug`, also the route: `/t/images/resize`. */
  id: string;
  name: string;
  /** One line, sentence case, no trailing period needed. */
  description: string;
  category: CategoryId;
  /** A lucide-react icon name, e.g. 'Image'. */
  icon: string;
  /** Extra search terms — plain words users would actually type. */
  keywords?: string[];
  accepts?: AcceptSpec;
  /** Output extensions this tool can produce, for the universal converter. */
  produces?: string[];
  requires?: BinaryId[];
  /** Shown in the drop-zone quick actions; defaults to `name`. */
  quickLabel?: string;
  /** Higher sorts first inside its category. */
  weight?: number;
  /** Hidden from grids but still routable and searchable. */
  hidden?: boolean;
  /** True when the tool needs no files at all (generators, calculators). */
  standalone?: boolean;
  load: () => Promise<{ default: ComponentType }>;
}

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
  /** Sidebar ordering. */
  order: number;
}

/** Result payloads returned by the Rust command layer. */
export type Disposition = 'created' | 'renamed' | 'overwritten' | 'skipped';

export interface FileResult {
  path: string;
  name: string;
  size: number;
  source?: string | null;
  sourceSize?: number | null;
  disposition: Disposition;
  note?: string;
}

export interface FileFailure {
  path: string;
  name: string;
  message: string;
  details?: string | null;
}

export interface BatchResult {
  results: FileResult[];
  failures: FileFailure[];
  cancelled: boolean;
  elapsedMs: number;
}

export interface FileInfo {
  path: string;
  name: string;
  stem: string;
  extension: string;
  mime: string;
  kind: FileKind;
  size: number;
  isDir: boolean;
  created?: number | null;
  modified?: number | null;
}

export interface OutputSpec {
  mode: 'same_dir' | 'custom';
  dir?: string | null;
  suffix?: string | null;
  collision: 'rename' | 'skip' | 'overwrite';
  filename?: string | null;
}

export interface ToolboxError {
  message: string;
  details?: string | null;
  kind:
    | 'not_found'
    | 'invalid_input'
    | 'missing_dependency'
    | 'cancelled'
    | 'io'
    | 'process'
    | 'unsupported'
    | 'internal';
}

export interface BinaryStatus {
  id: BinaryId;
  label: string;
  installed: boolean;
  path?: string | null;
  version?: string | null;
  installHint: string;
  usedFor: string;
  overridden: boolean;
}
