export type ArchiveFormat = 'zip' | 'tar' | 'tar.gz';

export const FORMATS: Array<{ value: ArchiveFormat; label: string; hint: string }> = [
  { value: 'zip', label: 'ZIP (.zip)', hint: 'Opens everywhere, including Finder and Windows. Deflate compressed.' },
  { value: 'tar', label: 'TAR (.tar)', hint: 'No compression at all — just one file holding the others. Fast.' },
  { value: 'tar.gz', label: 'Gzipped TAR (.tar.gz)', hint: 'The Unix default. Usually smaller than ZIP, needs a tool on Windows.' },
];

/** The extension `create_archive` will actually write for a format. */
export function archiveExtension(format: string): ArchiveFormat {
  switch (format.toLowerCase()) {
    case 'tar':
      return 'tar';
    case 'tar.gz':
    case 'tgz':
    case 'targz':
      return 'tar.gz';
    default:
      return 'zip';
  }
}

/**
 * The name without its final extension, matching Rust's `Path::file_stem`:
 * a leading dot is part of the name, and only the last dot is a separator.
 */
export function stemOf(path: string): string {
  const name = path.replace(/\/+$/, '').split('/').pop() ?? '';
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * What `create_archive` names the archive when the name field is left blank:
 * the stem of the first selected item.
 */
export function suggestArchiveName(paths: string[]): string {
  const first = paths[0];
  if (!first) return '';
  return stemOf(first) || 'archive';
}

/** The file name the run will produce, for display before it exists. */
export function archiveFileName(name: string, format: string): string {
  const base = name.trim() || 'archive';
  return `${base}.${archiveExtension(format)}`;
}
