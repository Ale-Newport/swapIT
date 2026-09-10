import { describe, expect, it } from 'vitest';
import { describePageSize, formatReport, parsePageSize, propertyRows, summarise, type PdfInfo } from './logic';

function info(overrides: Partial<PdfInfo> = {}): PdfInfo {
  return {
    path: '/docs/report.pdf',
    name: 'report.pdf',
    size: 1024 * 1024,
    pages: 12,
    encrypted: false,
    title: null,
    author: null,
    subject: null,
    keywords: null,
    creator: null,
    producer: null,
    creationDate: null,
    pageSize: '595.276 x 841.89 pts (A4)',
    pdfVersion: '1.7',
    tagged: false,
    ...overrides,
  };
}

describe('summarise', () => {
  it('totals pages and bytes across the batch', () => {
    const totals = summarise([info({ pages: 12, size: 100 }), info({ pages: 3, size: 50 })]);
    expect(totals).toEqual({ documents: 2, pages: 15, size: 150, encrypted: 0, unreadable: 0 });
  });

  it('counts locked documents, whose page count is unknown', () => {
    const totals = summarise([info(), info({ encrypted: true, pages: 0 })]);
    expect(totals.encrypted).toBe(1);
    expect(totals.unreadable).toBe(1);
    expect(totals.pages).toBe(12);
  });

  it('handles an empty selection', () => {
    expect(summarise([])).toEqual({ documents: 0, pages: 0, size: 0, encrypted: 0, unreadable: 0 });
  });
});

describe('parsePageSize', () => {
  it('reads the size and paper name', () => {
    expect(parsePageSize('595.276 x 841.89 pts (A4)')).toEqual({
      widthPt: 595.276,
      heightPt: 841.89,
      name: 'A4',
    });
  });

  it('gives up on an unparseable value', () => {
    expect(parsePageSize('unknown')).toBeNull();
    expect(parsePageSize(undefined)).toBeNull();
  });
});

describe('describePageSize', () => {
  it('converts points into millimetres and inches', () => {
    expect(describePageSize('595.276 x 841.89 pts (A4)')).toBe('A4 · 210 × 297 mm · 8.27 × 11.69 in');
  });

  it('handles US Letter, which poppler reports without a name', () => {
    expect(describePageSize('612 x 792 pts (letter)')).toBe('letter · 216 × 279 mm · 8.50 × 11.00 in');
  });

  it('falls back to whatever poppler said when it cannot be parsed', () => {
    expect(describePageSize('varies')).toBe('varies');
    expect(describePageSize(null)).toBeNull();
  });
});

describe('propertyRows', () => {
  it('drops properties the document does not carry', () => {
    const labels = propertyRows(info()).map((row) => row.label);
    expect(labels).toContain('Pages');
    expect(labels).toContain('Encrypted');
    expect(labels).not.toContain('Author');
  });

  it('keeps the properties that are set', () => {
    const rows = propertyRows(info({ author: ' Ada Lovelace ', title: 'Notes' }));
    expect(rows.find((row) => row.label === 'Author')?.value).toBe('Ada Lovelace');
    expect(rows.find((row) => row.label === 'Title')?.value).toBe('Notes');
  });

  it('explains an unknown page count rather than printing 0', () => {
    const rows = propertyRows(info({ pages: 0, encrypted: true }));
    expect(rows.find((row) => row.label === 'Pages')?.value).toMatch(/locked/);
  });
});

describe('formatReport', () => {
  it('leads with the document name and page count for a single file', () => {
    expect(formatReport([info()]).split('\n')[0]).toBe('report.pdf — 12 pages, 1.0 MB');
  });

  it('leads with the totals for a batch and lists every document', () => {
    const report = formatReport([info({ name: 'a.pdf' }), info({ name: 'b.pdf', pages: 1 })]);
    expect(report.split('\n')[0]).toBe('2 PDF documents — 13 pages, 2.0 MB total');
    expect(report).toContain('a.pdf');
    expect(report).toContain('b.pdf');
    expect(report.endsWith('\n')).toBe(true);
  });

  it('returns nothing when there is nothing to report', () => {
    expect(formatReport([])).toBe('');
  });
});
