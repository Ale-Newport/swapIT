/** Numbering and placement maths for Add Page Numbers. */

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

export const TEMPLATES = [
  { value: '{n}', label: '1' },
  { value: '{n} / {total}', label: '1 / 10' },
  { value: 'Page {n} of {total}', label: 'Page 1 of 10' },
  { value: '- {n} -', label: '- 1 -' },
];

export interface Stamp {
  /** Zero-based page index in the document. */
  index: number;
  /** The number printed on it. */
  number: number;
}

/**
 * Which pages get a number and what that number is.
 *
 * Numbering always counts every page from `startAt`, so skipping the cover
 * leaves page two showing “2” rather than “1”.
 */
export function planStamps(pageCount: number, startAt: number, skipFirst: boolean): Stamp[] {
  const stamps: Stamp[] = [];
  for (let index = 0; index < Math.max(0, pageCount); index += 1) {
    if (skipFirst && index === 0) continue;
    stamps.push({ index, number: startAt + index });
  }
  return stamps;
}

/** The highest number the document will show — what `{total}` means. */
export function highestNumber(pageCount: number, startAt: number): number {
  return startAt + Math.max(0, pageCount) - 1;
}

export function renderTemplate(template: string, n: number, total: number): string {
  return template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total));
}

/** Snap an arbitrary /Rotate value to the four the PDF spec allows. */
export function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const wrapped = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return wrapped as 0 | 90 | 180 | 270;
}

/**
 * Convert a point in the coordinates the reader sees into the page's own
 * unrotated user space, undoing the page's /Rotate entry.
 */
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

/** The page size as the reader sees it, which swaps for quarter turns. */
export function visualSize(
  pageWidth: number,
  pageHeight: number,
  rotation: 0 | 90 | 180 | 270,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: pageHeight, height: pageWidth }
    : { width: pageWidth, height: pageHeight };
}

export interface PlacementInput {
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  anchor: Anchor;
  margin: number;
  textWidth: number;
  fontSize: number;
}

export interface Placement {
  x: number;
  y: number;
  /** Degrees counter-clockwise to draw the text at so it reads upright. */
  rotate: 0 | 90 | 180 | 270;
}

/**
 * Where to start the baseline of the label. Works in the coordinates the reader
 * sees, then maps back into the page's own space so a rotated page still gets
 * its number in the visual bottom-centre.
 */
export function placeLabel(input: PlacementInput): Placement {
  const rotation = normalizeRotation(input.rotation);
  const { width: vw, height: vh } = visualSize(input.pageWidth, input.pageHeight, rotation);
  const margin = Math.max(0, input.margin);
  const [vertical, horizontal] = input.anchor.split('-');

  const vx =
    horizontal === 'left'
      ? margin
      : horizontal === 'right'
        ? vw - margin - input.textWidth
        : (vw - input.textWidth) / 2;

  const vy =
    vertical === 'bottom'
      ? margin
      : vertical === 'top'
        ? vh - margin - input.fontSize
        : (vh - input.fontSize) / 2;

  const { x, y } = toUserSpace(
    Math.max(0, vx),
    Math.max(0, vy),
    input.pageWidth,
    input.pageHeight,
    rotation,
  );
  return { x, y, rotate: rotation };
}

/** Split "#4a90d9" (or "#4ad") into the 0–1 channel values pdf-lib's rgb() wants. */
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
 * Turn a pdf-lib failure into something a person can act on. An encrypted file
 * is the common case and has a specific fix.
 */
export function describePdfError(err: unknown, name: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/encrypt|password/i.test(message)) {
    return `“${name}” is password-protected. Remove the password with the Decrypt PDF tool first, then run this again.`;
  }
  if (/parse|invalid|malformed|expected|unexpected|no pdf header/i.test(message)) {
    return `“${name}” could not be read — the file looks damaged, or it is not really a PDF.`;
  }
  return `“${name}” could not be processed. ${message}`;
}
