import { describe, expect, it } from 'vitest';
import { describePdfError, foundFields, isRealDate, summarize } from './logic';

describe('foundFields', () => {
  it('lists only the fields that hold something', () => {
    const found = foundFields({ title: 'Report', author: '', subject: '   ', producer: 'Word' });
    expect(found.map((f) => f.label)).toEqual(['Title', 'Producer']);
  });

  it('trims the values it reports', () => {
    expect(foundFields({ author: '  Ada  ' })[0].value).toBe('Ada');
  });

  it('reports real dates as plain days', () => {
    const found = foundFields({ creationDate: new Date('2024-03-05T11:22:33Z') });
    expect(found).toEqual([{ label: 'Created', value: '2024-03-05' }]);
  });

  it('ignores an already-scrubbed epoch date, so a clean file reads as clean', () => {
    expect(foundFields({ creationDate: new Date(0), modificationDate: new Date(0) })).toEqual([]);
  });

  it('ignores a date pdf-lib could not parse', () => {
    expect(foundFields({ creationDate: new Date('not a date') })).toEqual([]);
  });

  it('reports an XMP stream separately from the info dictionary', () => {
    expect(foundFields({ xmp: true })).toEqual([
      { label: 'XMP', value: 'Embedded XMP metadata stream' },
    ]);
  });

  it('finds nothing in an empty document', () => {
    expect(foundFields({})).toEqual([]);
  });
});

describe('isRealDate', () => {
  it('rejects undefined, invalid dates and the epoch', () => {
    expect(isRealDate(undefined)).toBe(false);
    expect(isRealDate(new Date('nope'))).toBe(false);
    expect(isRealDate(new Date(0))).toBe(false);
  });

  it('accepts an ordinary timestamp', () => {
    expect(isRealDate(new Date('2020-01-01'))).toBe(true);
  });
});

describe('summarize', () => {
  it('says so plainly when there is nothing to strip', () => {
    expect(summarize([])).toBe('Nothing to remove');
  });

  it('counts and names what was found', () => {
    expect(summarize([{ label: 'Title', value: 'a' }, { label: 'Author', value: 'b' }])).toBe(
      '2 items: Title, Author',
    );
  });

  it('uses the singular for one item', () => {
    expect(summarize([{ label: 'Title', value: 'a' }])).toBe('1 item: Title');
  });
});

describe('describePdfError', () => {
  it('points an encrypted file at the decrypt tool', () => {
    expect(describePdfError(new Error('document is encrypted'), 'a.pdf')).toContain('Decrypt PDF');
  });

  it('names the file it could not handle', () => {
    expect(describePdfError(new Error('boom'), 'weird.pdf')).toContain('weird.pdf');
  });
});
