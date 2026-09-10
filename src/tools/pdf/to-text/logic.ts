/** pdftotext ends every page with a form feed. */
export const PAGE_BREAK = '\f';

/** Whitespace plus the zero-width characters some PDF producers sprinkle about. */
const INVISIBLE = /[\s\u00a0\u200b-\u200d\u2060\ufeff\f]+/g;

/**
 * True when a PDF gave us nothing usable. A scanned document still produces a
 * file — one form feed per page and nothing else — so a plain `!text` check
 * would call that a success.
 */
export function isEffectivelyEmpty(text: string): boolean {
  return text.replace(INVISIBLE, '') === '';
}

export interface TextStats {
  characters: number;
  words: number;
  lines: number;
  pages: number;
}

export function textStats(text: string): TextStats {
  const body = text.split(PAGE_BREAK).join('');
  const trimmed = body.trim();
  return {
    characters: body.length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    lines: trimmed ? body.replace(/\n+$/, '').split('\n').length : 0,
    pages: text.split(PAGE_BREAK).length - 1,
  };
}

/**
 * The preview pane holds a string in memory and re-renders it on every keystroke
 * elsewhere in the tool, so a 900-page book gets cut. The saved .txt is whole.
 */
export function truncateForPreview(text: string, limit: number): { text: string; truncated: boolean } {
  if (limit <= 0 || text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}
