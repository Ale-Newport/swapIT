/** The page window sent to pdftoppm. `null` on either side means "no bound". */
export interface PageRange {
  first: number | null;
  last: number | null;
}

/** Nothing real has this many pages; the guard keeps typos out of the backend. */
const MAX_PAGE = 100_000;

/**
 * Read one of the two range fields. Blank means "no bound" rather than an
 * error, so a user can render "from page 5 to the end" by filling one box.
 */
export function parsePageField(value: string, label: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be a whole page number, like 1.`);
  }
  const page = Number(raw);
  if (page < 1) {
    throw new Error(`Pages are numbered from 1, so ${label.toLowerCase()} cannot be ${raw}.`);
  }
  if (page > MAX_PAGE) {
    throw new Error(`${label} is larger than any real document.`);
  }
  return page;
}

/** Both fields together, rejecting a window that runs backwards. */
export function resolvePageRange(firstText: string, lastText: string): PageRange {
  const first = parsePageField(firstText, 'First page');
  const last = parsePageField(lastText, 'Last page');
  if (first !== null && last !== null && last < first) {
    throw new Error(`The last page (${last}) comes before the first page (${first}).`);
  }
  return { first, last };
}

/**
 * How many images a document of `pageCount` pages will produce. Used only for
 * the "renders N pages" hint, so a window past the end simply yields 0.
 */
export function pagesInRange(range: PageRange, pageCount: number): number {
  if (pageCount <= 0) return 0;
  const first = Math.max(1, range.first ?? 1);
  const last = Math.min(range.last ?? pageCount, pageCount);
  return Math.max(0, last - first + 1);
}

/** Rough pixel size of one rendered page, so a 600 dpi choice is not a surprise. */
export function pixelsAtDpi(widthInches: number, heightInches: number, dpi: number): string {
  const w = Math.round(widthInches * dpi);
  const h = Math.round(heightInches * dpi);
  return `${w.toLocaleString()} × ${h.toLocaleString()} px`;
}

/**
 * Poppler reports page size as `595.276 x 841.89 pts (A4)`. PostScript points
 * are 1/72 inch, which is exactly what pdftoppm's -r flag scales from.
 */
export function parsePageSize(raw: string | null | undefined): { widthPt: number; heightPt: number; name: string | null } | null {
  if (!raw) return null;
  const match = raw.match(/([\d.]+)\s*x\s*([\d.]+)\s*pts(?:\s*\(([^)]+)\))?/i);
  if (!match) return null;
  const widthPt = Number(match[1]);
  const heightPt = Number(match[2]);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) return null;
  return { widthPt, heightPt, name: match[3]?.trim() || null };
}

/** "A4 · 2,481 × 3,507 px at 300 dpi" for the currently chosen resolution. */
export function describeRenderSize(pageSize: string | null | undefined, dpi: number): string | null {
  const parsed = parsePageSize(pageSize);
  if (!parsed) return null;
  const pixels = pixelsAtDpi(parsed.widthPt / 72, parsed.heightPt / 72, dpi);
  return parsed.name ? `${parsed.name} · ${pixels}` : pixels;
}
