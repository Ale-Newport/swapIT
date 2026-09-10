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
 * Parse a page selection such as `1-3, 5, 8-10` into 1-based page numbers.
 *
 * Order is preserved, because extraction writes the pages in the order given:
 * `5, 1-2` really does mean page 5 first. A descending range counts backwards,
 * and a page named twice is only taken once so the selection stays in step with
 * the thumbnail grid. Empty input is an empty selection, not an error.
 */
export function parsePageSequence(input: string, pageCount: number): number[] {
  const raw = input.replace(DASHES, '-').replace(/\s*-\s*/g, '-').trim();
  if (!raw) return [];
  if (pageCount < 1) throw new Error('This PDF has no pages to choose from.');

  const seen = new Set<number>();
  const pages: number[] = [];
  const push = (page: number) => {
    if (seen.has(page)) return;
    seen.add(page);
    pages.push(page);
  };

  for (const token of raw.split(SEPARATORS).filter(Boolean)) {
    const span = token.match(/^(\d*)-(\d*)$/);
    if (span) {
      const [, from, to] = span;
      if (!from && !to) throw new Error(`“${token}” is not a page range. Use ranges like 1-3, 5, 8-10.`);
      const start = check(from ? Number(from) : 1, pageCount, token);
      const end = check(to ? Number(to) : pageCount, pageCount, token);
      const step = start <= end ? 1 : -1;
      for (let page = start; step > 0 ? page <= end : page >= end; page += step) push(page);
      continue;
    }
    if (/^\d+$/.test(token)) {
      push(check(Number(token), pageCount, token));
      continue;
    }
    throw new Error(`“${token}” is not a page number. Use ranges like 1-3, 5, 8-10.`);
  }
  return pages;
}

/**
 * Render a page selection back as `1-3, 5, 8-10`, compressing only runs that
 * are consecutive in the order given so a custom order survives the round trip.
 */
export function formatPageSequence(pages: number[]): string {
  if (pages.length === 0) return '';
  const parts: string[] = [];
  let start = pages[0];
  let previous = pages[0];
  for (let i = 1; i <= pages.length; i += 1) {
    const page = pages[i];
    if (i < pages.length && page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    if (i < pages.length) {
      start = page;
      previous = page;
    }
  }
  return parts.join(', ');
}

/** Toggle one page, appending it to the end of the order when it is added. */
export function togglePage(pages: number[], page: number): number[] {
  return pages.includes(page) ? pages.filter((p) => p !== page) : [...pages, page];
}

export function allPages(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => i + 1);
}
