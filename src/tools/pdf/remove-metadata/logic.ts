/** What a PDF is carrying, and how to describe it, for Remove PDF Metadata. */

export interface RawMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  /** True when the document also carries an XMP metadata stream. */
  xmp?: boolean;
}

export interface FoundField {
  label: string;
  value: string;
}

/** Only fields that actually hold something; whitespace does not count. */
export function foundFields(meta: RawMetadata): FoundField[] {
  const found: FoundField[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value && value.trim().length > 0) found.push({ label, value: value.trim() });
  };
  push('Title', meta.title);
  push('Author', meta.author);
  push('Subject', meta.subject);
  push('Keywords', meta.keywords);
  push('Creator', meta.creator);
  push('Producer', meta.producer);
  if (isRealDate(meta.creationDate)) found.push({ label: 'Created', value: formatDate(meta.creationDate) });
  if (isRealDate(meta.modificationDate)) found.push({ label: 'Modified', value: formatDate(meta.modificationDate) });
  if (meta.xmp) found.push({ label: 'XMP', value: 'Embedded XMP metadata stream' });
  return found;
}

/**
 * A date pdf-lib could not parse comes back as an Invalid Date, and a document
 * already scrubbed to the epoch is not carrying anything worth reporting.
 */
export function isRealDate(date: Date | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getTime() !== 0;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** One-line summary used in the file list and in the result note. */
export function summarize(found: FoundField[]): string {
  if (found.length === 0) return 'Nothing to remove';
  return `${found.length} item${found.length === 1 ? '' : 's'}: ${found.map((f) => f.label).join(', ')}`;
}

export function describePdfError(err: unknown, name: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/encrypt|password/i.test(message)) {
    return `“${name}” is password-protected. Remove the password with the Decrypt PDF tool first, then run this again.`;
  }
  if (/parse|invalid|malformed|expected|unexpected|no pdf header/i.test(message)) {
    return `“${name}” could not be read — the file looks damaged, or it is not really a PDF.`;
  }
  return `“${name}” could not be processed. ${message}`;
}
