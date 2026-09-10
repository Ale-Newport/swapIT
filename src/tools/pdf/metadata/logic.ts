/** Reading, editing and reporting helpers for PDF Metadata. */

/** Mirrors `PdfInfo` from `src-tauri/src/cmd/pdf.rs`. */
export interface PdfInfo {
  path: string;
  name: string;
  size: number;
  pages: number;
  encrypted: boolean;
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  pageSize: string | null;
  pdfVersion: string | null;
  tagged: boolean;
}

export type EditableField = 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer';

export const EDITABLE_FIELDS: Array<{ key: EditableField; label: string; hint: string }> = [
  { key: 'title', label: 'Title', hint: 'Shown in the reader’s window and in search results' },
  { key: 'author', label: 'Author', hint: 'Person or organisation credited with the document' },
  { key: 'subject', label: 'Subject', hint: 'One line describing what the document is about' },
  { key: 'keywords', label: 'Keywords', hint: 'Comma-separated terms, e.g. invoice, 2024, acme' },
  { key: 'creator', label: 'Creator', hint: 'The application the document was written in' },
  { key: 'producer', label: 'Producer', hint: 'The library or printer that produced the PDF file' },
];

export type Draft = Record<EditableField, string>;

export const EMPTY_DRAFT: Draft = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
};

/** Seed the editor from a file's current values, so editing starts from the truth. */
export function draftFromInfo(info: PdfInfo | undefined): Draft {
  if (!info) return { ...EMPTY_DRAFT };
  return {
    title: info.title ?? '',
    author: info.author ?? '',
    subject: info.subject ?? '',
    keywords: info.keywords ?? '',
    creator: info.creator ?? '',
    producer: info.producer ?? '',
  };
}

/** Only the fields the user actually filled in get written; blanks mean "leave alone". */
export function fieldsToWrite(draft: Draft): Array<{ key: EditableField; value: string }> {
  return EDITABLE_FIELDS.map(({ key }) => ({ key, value: draft[key].trim() })).filter(
    (entry) => entry.value.length > 0,
  );
}

/** PDF keeps Keywords as one string; split it the way readers expect. */
export function splitKeywords(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function joinKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

/** A plain-text report of everything read, for pasting into a ticket or an email. */
export function formatReport(infos: PdfInfo[]): string {
  return infos
    .map((info) =>
      [
        info.name,
        `  Pages: ${info.pages || 'unknown'}`,
        `  Page size: ${info.pageSize ?? 'unknown'}`,
        `  PDF version: ${info.pdfVersion ?? 'unknown'}`,
        `  Encrypted: ${info.encrypted ? 'yes' : 'no'}`,
        `  Tagged: ${info.tagged ? 'yes' : 'no'}`,
        `  Title: ${info.title ?? '—'}`,
        `  Author: ${info.author ?? '—'}`,
        `  Subject: ${info.subject ?? '—'}`,
        `  Keywords: ${info.keywords ?? '—'}`,
        `  Creator: ${info.creator ?? '—'}`,
        `  Producer: ${info.producer ?? '—'}`,
        `  Created: ${info.creationDate ?? '—'}`,
      ].join('\n'),
    )
    .join('\n\n');
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
