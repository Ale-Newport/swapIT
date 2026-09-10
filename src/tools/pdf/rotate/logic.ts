const SEPARATORS = /[,;\s]+/;
/** Hyphen look-alikes people paste from Word, Notes and the web. */
const DASHES = /[\u2010-\u2015\u2212]/g;

/** A page span with no document to bound it yet — `end: null` means "to the end". */
export interface OpenRange {
  start: number;
  end: number | null;
}

/**
 * Parse `1-3, 5, 8-` without knowing how long the document is, because one
 * rotation batch is applied to files of different lengths. Bounds are checked
 * later, per file, by `pagesForCount`. Empty input is an empty selection.
 */
export function parseOpenRanges(input: string): OpenRange[] {
  const raw = input.replace(DASHES, '-').replace(/\s*-\s*/g, '-').trim();
  if (!raw) return [];

  const ranges: OpenRange[] = [];
  for (const token of raw.split(SEPARATORS).filter(Boolean)) {
    const span = token.match(/^(\d*)-(\d*)$/);
    if (span) {
      const [, from, to] = span;
      if (!from && !to) throw new Error(`“${token}” is not a page range. Use ranges like 1-3, 5, 8-10.`);
      const start = from ? Number(from) : 1;
      const end = to ? Number(to) : null;
      if (start < 1 || (end !== null && end < 1)) {
        throw new Error(`Pages are numbered from 1, so “${token}” cannot be used.`);
      }
      ranges.push(end !== null && end < start ? { start: end, end: start } : { start, end });
      continue;
    }
    if (/^\d+$/.test(token)) {
      const page = Number(token);
      if (page < 1) throw new Error(`Pages are numbered from 1, so “${token}” cannot be used.`);
      ranges.push({ start: page, end: page });
      continue;
    }
    throw new Error(`“${token}” is not a page number. Use ranges like 1-3, 5, 8-10.`);
  }
  return ranges;
}

/**
 * The 1-based pages a selection touches in a document of `pageCount` pages.
 * Pages past the end are ignored rather than failing the whole batch — a range
 * that suits a 40-page report should still do something sensible to a 6-page one.
 */
export function pagesForCount(ranges: OpenRange[], pageCount: number): number[] {
  const pages = new Set<number>();
  for (const range of ranges) {
    const end = Math.min(range.end ?? pageCount, pageCount);
    for (let page = Math.max(1, range.start); page <= end; page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Add a turn to a page's existing rotation, always landing on 0, 90, 180 or 270. */
export function normaliseRotation(current: number, delta: number): number {
  return (((Math.round(current + delta) % 360) + 360) % 360);
}
