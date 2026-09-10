const SEPARATORS = /[,;\s]+/;
/** Hyphen look-alikes people paste from Word, Notes and the web. */
const DASHES = /[\u2010-\u2015\u2212]/g;

function check(page: number, pageCount: number, token: string): number {
  if (page < 1) throw new Error(`Pages are numbered from 1, so “${token}” cannot be used.`);
  if (page > pageCount) {
    throw new Error(`“${token}” goes past the end — this PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
  }
  return page;
}

/**
 * Parse a page selection such as `2, 5-7` into a sorted, duplicate-free list of
 * 1-based page numbers. Deletion has no order, so the result is always sorted —
 * which also makes it stable to compare against the thumbnail grid.
 * Empty input means "delete nothing", not an error.
 */
export function parsePageSet(input: string, pageCount: number): number[] {
  const raw = input.replace(DASHES, '-').replace(/\s*-\s*/g, '-').trim();
  if (!raw) return [];
  if (pageCount < 1) throw new Error('This PDF has no pages to remove.');

  const chosen = new Set<number>();
  for (const token of raw.split(SEPARATORS).filter(Boolean)) {
    const span = token.match(/^(\d*)-(\d*)$/);
    if (span) {
      const [, from, to] = span;
      if (!from && !to) throw new Error(`“${token}” is not a page range. Use ranges like 2, 5-7.`);
      const a = check(from ? Number(from) : 1, pageCount, token);
      const b = check(to ? Number(to) : pageCount, pageCount, token);
      for (let page = Math.min(a, b); page <= Math.max(a, b); page += 1) chosen.add(page);
      continue;
    }
    if (/^\d+$/.test(token)) {
      chosen.add(check(Number(token), pageCount, token));
      continue;
    }
    throw new Error(`“${token}” is not a page number. Use ranges like 2, 5-7.`);
  }
  return [...chosen].sort((a, b) => a - b);
}

/** Render a sorted page list back as `2, 5-7`. */
export function formatPageList(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const page = sorted[i];
    if (i < sorted.length && page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    if (i < sorted.length) {
      start = page;
      previous = page;
    }
  }
  return parts.join(', ');
}

export function togglePage(pages: number[], page: number): number[] {
  const next = pages.includes(page) ? pages.filter((p) => p !== page) : [...pages, page];
  return next.sort((a, b) => a - b);
}

export function allPages(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => i + 1);
}

/** The pages that survive, in their original order. */
export function keptPages(pageCount: number, removed: number[]): number[] {
  const gone = new Set(removed);
  return allPages(pageCount).filter((page) => !gone.has(page));
}
