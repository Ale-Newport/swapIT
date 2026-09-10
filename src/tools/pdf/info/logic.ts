import { formatBytes } from '@/core/format';

/** Mirrors `PdfInfo` in `src-tauri/src/cmd/pdf.rs`. */
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

export interface InfoSummary {
  documents: number;
  pages: number;
  size: number;
  encrypted: number;
  /** Encrypted documents give up no page count at all. */
  unreadable: number;
}

export function summarise(infos: PdfInfo[]): InfoSummary {
  return {
    documents: infos.length,
    pages: infos.reduce((total, info) => total + info.pages, 0),
    size: infos.reduce((total, info) => total + info.size, 0),
    encrypted: infos.filter((info) => info.encrypted).length,
    unreadable: infos.filter((info) => info.pages === 0).length,
  };
}

/** Poppler reports `595.276 x 841.89 pts (A4)`; points are 1/72 inch. */
export function parsePageSize(
  raw: string | null | undefined,
): { widthPt: number; heightPt: number; name: string | null } | null {
  if (!raw) return null;
  const match = raw.match(/([\d.]+)\s*x\s*([\d.]+)\s*pts(?:\s*\(([^)]+)\))?/i);
  if (!match) return null;
  const widthPt = Number(match[1]);
  const heightPt = Number(match[2]);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) return null;
  return { widthPt, heightPt, name: match[3]?.trim() || null };
}

/** "A4 · 210 × 297 mm · 8.27 × 11.69 in" — the numbers people actually want. */
export function describePageSize(raw: string | null | undefined): string | null {
  const parsed = parsePageSize(raw);
  if (!parsed) return raw?.trim() || null;
  const mm = (pt: number) => Math.round((pt * 25.4) / 72);
  const inch = (pt: number) => (pt / 72).toFixed(2);
  const dimensions = `${mm(parsed.widthPt)} × ${mm(parsed.heightPt)} mm · ${inch(parsed.widthPt)} × ${inch(parsed.heightPt)} in`;
  return parsed.name ? `${parsed.name} · ${dimensions}` : dimensions;
}

export interface PropertyRow {
  label: string;
  value: string;
}

/** Everything worth showing about one document, empty fields dropped. */
export function propertyRows(info: PdfInfo): PropertyRow[] {
  const rows: PropertyRow[] = [
    { label: 'Pages', value: info.pages > 0 ? String(info.pages) : 'Unknown — the document is locked' },
    { label: 'File size', value: formatBytes(info.size) },
  ];
  const pageSize = describePageSize(info.pageSize);
  if (pageSize) rows.push({ label: 'Page size', value: pageSize });
  if (info.pdfVersion) rows.push({ label: 'PDF version', value: info.pdfVersion });
  rows.push({ label: 'Encrypted', value: info.encrypted ? 'Yes — a password is required' : 'No' });
  rows.push({ label: 'Tagged', value: info.tagged ? 'Yes — carries structure for screen readers' : 'No' });
  const optional: Array<[string, string | null]> = [
    ['Title', info.title],
    ['Author', info.author],
    ['Subject', info.subject],
    ['Keywords', info.keywords],
    ['Creator', info.creator],
    ['Producer', info.producer],
    ['Created', info.creationDate],
  ];
  for (const [label, value] of optional) {
    if (value && value.trim()) rows.push({ label, value: value.trim() });
  }
  return rows;
}

/** A plain-text report of the whole batch, for the copy button. */
export function formatReport(infos: PdfInfo[]): string {
  if (infos.length === 0) return '';
  const totals = summarise(infos);
  const header =
    infos.length === 1
      ? `${infos[0].name} — ${totals.pages} page${totals.pages === 1 ? '' : 's'}, ${formatBytes(totals.size)}`
      : `${totals.documents} PDF documents — ${totals.pages} pages, ${formatBytes(totals.size)} total`;

  const blocks = infos.map((info) => {
    const rows = propertyRows(info)
      .map((row) => `  ${row.label.padEnd(12)}${row.value}`)
      .join('\n');
    return `${info.name}\n${rows}`;
  });
  return `${[header, '', blocks.join('\n\n')].join('\n').trimEnd()}\n`;
}
