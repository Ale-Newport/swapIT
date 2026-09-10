/** Placement and page-selection maths for PDF Watermark. */

export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const ANCHORS: Anchor[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

/** Hard ceiling on tiles per page, so a tiny mark cannot explode a document. */
export const MAX_TILES = 400;

export function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const wrapped = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return wrapped as 0 | 90 | 180 | 270;
}

export function visualSize(
  pageWidth: number,
  pageHeight: number,
  rotation: 0 | 90 | 180 | 270,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: pageHeight, height: pageWidth }
    : { width: pageWidth, height: pageHeight };
}

/** Undo a page's /Rotate: reader coordinates in, page user space out. */
export function toUserSpace(
  vx: number,
  vy: number,
  pageWidth: number,
  pageHeight: number,
  rotation: 0 | 90 | 180 | 270,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: pageWidth - vy, y: vx };
    case 180:
      return { x: pageWidth - vx, y: pageHeight - vy };
    case 270:
      return { x: vy, y: pageHeight - vx };
    default:
      return { x: vx, y: vy };
  }
}

/** How much room a `width` x `height` box takes once it is turned `deg` degrees. */
export function rotatedExtent(width: number, height: number, deg: number): { width: number; height: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

/**
 * pdf-lib turns text and images about their bottom-left corner, but a watermark
 * is easiest to think about by its centre. Convert one to the other.
 */
export function anchorFromCenter(
  cx: number,
  cy: number,
  width: number,
  height: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const hw = width / 2;
  const hh = height / 2;
  return {
    x: cx - (hw * Math.cos(rad) - hh * Math.sin(rad)),
    y: cy - (hw * Math.sin(rad) + hh * Math.cos(rad)),
  };
}

/** Centre point for one of the nine positions, in reader coordinates. */
export function anchorCenter(
  anchor: Anchor,
  visualWidth: number,
  visualHeight: number,
  margin: number,
  boxWidth: number,
  boxHeight: number,
): { cx: number; cy: number } {
  const [vertical, horizontal] = anchor.split('-');
  const cx =
    horizontal === 'left'
      ? margin + boxWidth / 2
      : horizontal === 'right'
        ? visualWidth - margin - boxWidth / 2
        : visualWidth / 2;
  const cy =
    vertical === 'bottom'
      ? margin + boxHeight / 2
      : vertical === 'top'
        ? visualHeight - margin - boxHeight / 2
        : visualHeight / 2;
  return { cx, cy };
}

/**
 * Evenly spread centres for a tiled watermark. The step is a target rather than
 * an exact pitch: the grid is squared up to the page so the pattern stays
 * symmetric instead of trailing off at the edges.
 */
export function tileCenters(
  visualWidth: number,
  visualHeight: number,
  stepX: number,
  stepY: number,
): Array<{ cx: number; cy: number }> {
  const cols = Math.max(1, Math.round(visualWidth / Math.max(1, stepX)));
  const rows = Math.max(1, Math.round(visualHeight / Math.max(1, stepY)));
  const centers: Array<{ cx: number; cy: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      centers.push({
        cx: ((col + 0.5) * visualWidth) / cols,
        cy: ((row + 0.5) * visualHeight) / rows,
      });
      if (centers.length >= MAX_TILES) return centers;
    }
  }
  return centers;
}

/** One "1-3", "7" or "12-" token. `to: null` means "to the end of the document". */
export interface RangeToken {
  from: number;
  to: number | null;
}

/**
 * Split "1-3, 7, 12-" into tokens, throwing a message the user can act on
 * rather than silently ignoring a typo. No page list is built, so this is safe
 * to call before a document's length is known.
 */
export function parseRangeTokens(spec: string): RangeToken[] {
  const trimmed = spec.trim();
  if (!trimmed) throw new Error('Enter the pages to watermark, for example 1-3, 7.');

  const tokens: RangeToken[] = [];
  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = part.match(/^(\d+)\s*(?:-\s*(\d+)?)?$/);
    if (!match) {
      throw new Error(`“${part}” is not a page range. Use numbers such as 1-3, 7 or 12-.`);
    }
    const from = parseInt(match[1], 10);
    const openEnded = part.includes('-') && match[2] === undefined;
    const to = openEnded ? null : match[2] !== undefined ? parseInt(match[2], 10) : from;
    if (from < 1) throw new Error('Page numbers start at 1.');
    if (to !== null && to < from) {
      throw new Error(`“${part}” runs backwards — write the smaller page first.`);
    }
    tokens.push({ from, to });
  }
  return tokens;
}

/**
 * Check the syntax of a range without resolving it against a document. Used up
 * front so a typo is reported once, before a batch starts, instead of once per
 * file — and without materialising a page list for an open-ended range.
 */
export function validatePageRange(spec: string): void {
  if (parseRangeTokens(spec).length === 0) {
    throw new Error('Enter the pages to watermark, for example 1-3, 7.');
  }
}

/**
 * Parse "1-3, 7, 12-" into zero-based page indexes, clamped to `pageCount`.
 */
export function parsePageRange(spec: string, pageCount: number): number[] {
  const wanted = new Set<number>();
  for (const { from, to } of parseRangeTokens(spec)) {
    const last = Math.min(to ?? pageCount, pageCount);
    for (let page = from; page <= last; page += 1) wanted.add(page - 1);
  }

  if (wanted.size === 0) {
    throw new Error(`This PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}, so that range selects nothing.`);
  }
  return [...wanted].sort((a, b) => a - b);
}

export function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const hex = input.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex.length === 6
        ? hex
        : null;
  if (!full || !/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/**
 * The 14 fonts every PDF reader has are WinAnsi-encoded: Latin-1 plus a handful
 * of typographic extras. Anything else (CJK, Cyrillic, emoji) cannot be drawn,
 * and pdf-lib throws rather than dropping the character silently — so catch it
 * before the run starts.
 */
const WINANSI_EXTRAS = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);

export function unsupportedCharacters(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0xff) || WINANSI_EXTRAS.has(ch)) continue;
    bad.add(ch);
  }
  return [...bad];
}

export function describePdfError(err: unknown, name: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/cannot encode|winansi/i.test(message)) {
    return `“${name}” — the watermark text uses a character the built-in PDF fonts cannot draw. Use Latin letters, digits and common punctuation, or switch to an image watermark.`;
  }
  if (/encrypt|password/i.test(message)) {
    return `“${name}” is password-protected. Remove the password with the Decrypt PDF tool first, then run this again.`;
  }
  if (/parse|invalid|malformed|expected|unexpected|no pdf header/i.test(message)) {
    return `“${name}” could not be read — the file looks damaged, or it is not really a PDF.`;
  }
  return `“${name}” could not be processed. ${message}`;
}
