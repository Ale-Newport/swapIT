import Papa from 'papaparse';

/**
 * Turning whatever is on the clipboard into a file worth keeping: guessing the
 * format, tidying JSON, wrapping bare text in a real HTML document, and giving
 * the file a name that says what is inside it.
 */

export type ClipFormat = 'txt' | 'md' | 'json' | 'csv' | 'html';

export const FORMATS: Array<{ value: ClipFormat; label: string; hint: string }> = [
  { value: 'txt', label: 'Plain text (.txt)', hint: 'Saved exactly as copied, in UTF-8.' },
  { value: 'md', label: 'Markdown (.md)', hint: 'Saved as-is, ready for a Markdown editor.' },
  { value: 'json', label: 'JSON (.json)', hint: 'Checked and pretty-printed before saving.' },
  { value: 'csv', label: 'CSV (.csv)', hint: 'Saved as-is; the rows and columns are counted first.' },
  { value: 'html', label: 'HTML (.html)', hint: 'Saved as-is, or wrapped in a page when it is plain text.' },
];

export function looksLikeHtml(text: string): boolean {
  return /<(!doctype html|html|body|div|p|span|table|h[1-6]|ul|ol|img|a)\b/i.test(text);
}

export function looksLikeMarkdown(text: string): boolean {
  return (
    /^\s{0,3}#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s+\S/m.test(text) ||
    /^\s*\d+\.\s+\S/m.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /```/.test(text) ||
    /^\s*>\s+\S/m.test(text)
  );
}

export function isJson(text: string): boolean {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export interface CsvFacts {
  rows: number;
  columns: number;
  ragged: boolean;
  delimiter: string;
}

/** Row and column counts, plus whether some row has a different width. */
export function analyseCsv(text: string): CsvFacts {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const rows = parsed.data.filter((row) => Array.isArray(row));
  const widths = rows.map((row) => row.length);
  const columns = widths.length > 0 ? Math.max(...widths) : 0;
  return {
    rows: rows.length,
    columns,
    ragged: widths.length > 1 && widths.some((w) => w !== widths[0]),
    delimiter: parsed.meta?.delimiter ?? ',',
  };
}

export function looksLikeCsv(text: string): boolean {
  if (!text.includes('\n')) return false;
  const facts = analyseCsv(text);
  return facts.rows > 1 && facts.columns > 1 && !facts.ragged;
}

/** The format offered when the clipboard is read, based on what the text is. */
export function detectFormat(text: string): ClipFormat {
  if (!text.trim()) return 'txt';
  if (isJson(text)) return 'json';
  if (looksLikeHtml(text)) return 'html';
  if (looksLikeMarkdown(text)) return 'md';
  if (looksLikeCsv(text)) return 'csv';
  return 'txt';
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text becomes a real, valid page: one paragraph per blank-line block. */
export function wrapInHtmlDocument(text: string, title: string): string {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `    <p>${escapeHtml(block).replace(/\n/g, '<br />\n    ')}</p>`)
    .join('\n');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    `    <title>${escapeHtml(title)}</title>`,
    '  </head>',
    '  <body>',
    paragraphs || '    <p></p>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

export interface PrepareOptions {
  /** Spaces used when pretty-printing JSON. */
  indent: number;
  /** Wrap plain text in an HTML document rather than saving it raw. */
  wrapHtml: boolean;
  /** Used as the <title> of a wrapped HTML document. */
  title: string;
}

/**
 * The exact bytes that will be written. Throws a sentence the user can act on
 * when the clipboard cannot honestly be saved in the chosen format.
 */
export function prepare(text: string, format: ClipFormat, options: PrepareOptions): string {
  if (!text.trim()) {
    throw new Error('There is nothing on the clipboard to save. Copy some text first.');
  }
  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim());
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `The clipboard is not valid JSON, so it cannot be saved as a .json file (${detail}). Save it as plain text instead, or fix the JSON and copy it again.`,
      );
    }
    return `${JSON.stringify(parsed, null, Math.max(0, Math.min(8, options.indent)))}\n`;
  }
  if (format === 'html' && options.wrapHtml && !looksLikeHtml(text)) {
    return wrapInHtmlDocument(text, options.title);
  }
  return text.endsWith('\n') ? text : `${text}\n`;
}

/** A file name taken from the first meaningful line of the text. */
export function suggestFilename(text: string, format: ClipFormat): string {
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const base = (firstLine ?? '')
    .replace(/^[#>\-*\s]+/, '')
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48);
  if (base) return base.toLowerCase();
  return format === 'csv' ? 'clipboard-table' : 'clipboard';
}
