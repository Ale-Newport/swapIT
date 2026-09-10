import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  draftFromInfo,
  fieldsToWrite,
  formatReport,
  joinKeywords,
  splitKeywords,
  type PdfInfo,
} from './logic';

const info: PdfInfo = {
  path: '/docs/report.pdf',
  name: 'report.pdf',
  size: 1024,
  pages: 12,
  encrypted: false,
  title: 'Quarterly report',
  author: 'Ada Lovelace',
  subject: null,
  keywords: 'finance, q3',
  creator: 'Pages',
  producer: 'macOS Quartz',
  creationDate: 'Mon Jan 1 09:00:00 2024',
  pageSize: '595 x 842 pts (A4)',
  pdfVersion: '1.7',
  tagged: true,
};

describe('draftFromInfo', () => {
  it('turns missing values into empty strings, never "null"', () => {
    const draft = draftFromInfo(info);
    expect(draft.subject).toBe('');
    expect(draft.title).toBe('Quarterly report');
  });

  it('returns a blank draft when nothing is selected', () => {
    expect(draftFromInfo(undefined)).toEqual(EMPTY_DRAFT);
  });

  it('does not hand back the shared blank object, so editing cannot corrupt it', () => {
    expect(draftFromInfo(undefined)).not.toBe(EMPTY_DRAFT);
  });
});

describe('fieldsToWrite', () => {
  it('writes only what was filled in, so blanks leave the file alone', () => {
    const written = fieldsToWrite({ ...EMPTY_DRAFT, title: 'New title', author: '   ' });
    expect(written).toEqual([{ key: 'title', value: 'New title' }]);
  });

  it('trims surrounding whitespace off the values it keeps', () => {
    expect(fieldsToWrite({ ...EMPTY_DRAFT, author: '  Ada  ' })).toEqual([{ key: 'author', value: 'Ada' }]);
  });

  it('writes nothing at all for an untouched form', () => {
    expect(fieldsToWrite(EMPTY_DRAFT)).toEqual([]);
  });
});

describe('splitKeywords', () => {
  it('splits on commas and semicolons and drops the gaps', () => {
    expect(splitKeywords('invoice, 2024 ; acme,,')).toEqual(['invoice', '2024', 'acme']);
  });

  it('keeps a single keyword intact', () => {
    expect(splitKeywords('draft')).toEqual(['draft']);
  });

  it('returns nothing for an empty field', () => {
    expect(splitKeywords('   ')).toEqual([]);
  });

  it('round-trips through joinKeywords', () => {
    expect(joinKeywords(splitKeywords('a,b ,  c'))).toBe('a, b, c');
  });
});

describe('formatReport', () => {
  it('names every field and marks the missing ones', () => {
    const report = formatReport([info]);
    expect(report).toContain('report.pdf');
    expect(report).toContain('Pages: 12');
    expect(report).toContain('Subject: —');
    expect(report).toContain('Encrypted: no');
  });

  it('says "unknown" rather than 0 when the page count could not be read', () => {
    expect(formatReport([{ ...info, pages: 0 }])).toContain('Pages: unknown');
  });

  it('separates files with a blank line', () => {
    const report = formatReport([info, { ...info, name: 'second.pdf' }]);
    expect(report).toContain('\n\nsecond.pdf');
  });
});
