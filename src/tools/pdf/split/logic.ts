/** A 1-based, inclusive span of pages. */
export interface PageRange {
  start: number;
  end: number;
}

const SEPARATORS = /[,;\s]+/;
/** Hyphen look-alikes people paste from Word, Notes and the web. */
const DASHES = /[\u2010-\u2015\u2212]/g;

function bound(start: number, end: number, pageCount: number, token: string): PageRange {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (lo < 1) throw new Error(`Pages are numbered from 1, so “${token}” cannot be used.`);
  if (hi > pageCount) {
    throw new Error(`“${token}” goes past the end — this PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
  }
  return { start: lo, end: hi };
}

/**
 * Parse a human page-range list such as `1-3, 5, 8-10` into spans.
 * `3-` means "3 to the end" and `-4` means "1 to 4"; reversed spans are righted.
 * Throws a sentence the user can act on rather than returning a silent empty list.
 */
export function parsePageRanges(input: string, pageCount: number): PageRange[] {
  if (pageCount < 1) throw new Error('This PDF has no pages to split.');
  // Collapse spacing around dashes first, so "1 - 3" still reads as one range.
  const raw = input.replace(DASHES, '-').replace(/\s*-\s*/g, '-').trim();
  if (!raw) throw new Error('Enter at least one page range, for example 1-3, 5, 8-10.');

  const ranges: PageRange[] = [];
  for (const token of raw.split(SEPARATORS).filter(Boolean)) {
    const span = token.match(/^(\d*)-(\d*)$/);
    if (span) {
      const [, from, to] = span;
      if (!from && !to) throw new Error(`“${token}” is not a page range. Use ranges like 1-3, 5, 8-10.`);
      ranges.push(bound(from ? Number(from) : 1, to ? Number(to) : pageCount, pageCount, token));
      continue;
    }
    if (/^\d+$/.test(token)) {
      const page = Number(token);
      ranges.push(bound(page, page, pageCount, token));
      continue;
    }
    throw new Error(`“${token}” is not a page number. Use ranges like 1-3, 5, 8-10.`);
  }
  return ranges;
}

/** One range per page: the "every page" split mode. */
export function singlePageRanges(pageCount: number): PageRange[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => ({ start: i + 1, end: i + 1 }));
}

/** Consecutive blocks of `size` pages, the last one short if it has to be. */
export function chunkRanges(pageCount: number, size: number): PageRange[] {
  const step = Math.max(1, Math.floor(size) || 1);
  const out: PageRange[] = [];
  for (let start = 1; start <= pageCount; start += step) {
    out.push({ start, end: Math.min(pageCount, start + step - 1) });
  }
  return out;
}

/** Zero-padded file-name fragment, so the parts sort correctly in Finder. */
export function rangeLabel(range: PageRange, pageCount: number): string {
  const width = String(Math.max(pageCount, 1)).length;
  const pad = (n: number) => String(n).padStart(width, '0');
  return range.start === range.end ? `p${pad(range.start)}` : `p${pad(range.start)}-${pad(range.end)}`;
}

export function rangeSize(range: PageRange): number {
  return range.end - range.start + 1;
}

export function totalPages(ranges: PageRange[]): number {
  return ranges.reduce((sum, r) => sum + rangeSize(r), 0);
}
