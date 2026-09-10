import { Marked } from 'marked';

export interface MarkdownToHtmlOptions {
  /** GitHub flavour: tables, strikethrough, task lists, autolinks. */
  gfm: boolean;
  /** Turn a single newline into a `<br>`. */
  breaks: boolean;
  /** Give every heading a slug id so it can be linked to. */
  headerIds: boolean;
  /** Wrap the result in a complete HTML5 page with a readable stylesheet. */
  fullDocument: boolean;
}

export const DEFAULT_MD_OPTIONS: MarkdownToHtmlOptions = {
  gfm: true,
  breaks: false,
  headerIds: true,
  fullDocument: false,
};

/** GitHub-style anchor slug: lower case, punctuation dropped, spaces hyphenated. */
export function slugify(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The first level-one heading makes the best <title> for a standalone page. */
export function documentTitle(markdown: string): string {
  const atx = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  if (atx) return slugToTitle(atx[1]);
  const setext = /^(.+)\n=+\s*$/m.exec(markdown);
  if (setext) return slugToTitle(setext[1]);
  return 'Document';
}

function slugToTitle(raw: string): string {
  // Strip the inline markdown that would otherwise show up in the tab title.
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

/** A small, readable stylesheet for the standalone document mode. */
const DOCUMENT_CSS = `:root { color-scheme: light dark; }
body {
  max-width: 46rem;
  margin: 3rem auto;
  padding: 0 1.25rem;
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #1a1a1a;
  background: #ffffff;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 2rem 0 0.75rem; }
h1 { font-size: 1.9rem; }
h2 { font-size: 1.45rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.3rem; }
h3 { font-size: 1.2rem; }
a { color: #0b62d6; }
p, ul, ol, blockquote, table, pre { margin: 1rem 0; }
ul, ol { padding-left: 1.5rem; }
blockquote { border-left: 3px solid #d8d8d8; margin-left: 0; padding-left: 1rem; color: #555; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
  background: #f4f4f5; border-radius: 4px; padding: 0.1em 0.35em; }
pre { background: #f4f4f5; border-radius: 8px; padding: 0.9rem 1rem; overflow-x: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #e0e0e0; padding: 0.4rem 0.6rem; text-align: left; }
th { background: #f7f7f8; }
img { max-width: 100%; }
hr { border: 0; border-top: 1px solid #e5e5e5; margin: 2rem 0; }
@media (prefers-color-scheme: dark) {
  body { color: #e6e6e6; background: #131316; }
  h2 { border-bottom-color: #2a2a30; }
  a { color: #79a9ff; }
  blockquote { border-left-color: #3a3a42; color: #a5a5ad; }
  code, pre, th { background: #1d1d22; }
  th, td { border-color: #2a2a30; }
  hr { border-top-color: #2a2a30; }
}`;

export function wrapDocument(body: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${DOCUMENT_CSS}
</style>
</head>
<body>
${body.trimEnd()}
</body>
</html>
`;
}

export function markdownToHtml(markdown: string, opts: MarkdownToHtmlOptions): string {
  if (!markdown.trim()) return '';

  const marked = new Marked({ gfm: opts.gfm, breaks: opts.breaks });

  if (opts.headerIds) {
    // marked dropped built-in heading ids in v5, so add them here — and keep a
    // counter so two "Overview" headings do not end up with the same anchor.
    const used = new Map<string, number>();
    marked.use({
      renderer: {
        heading(token) {
          const inner = this.parser.parseInline(token.tokens);
          const base = slugify(token.text) || 'section';
          const seen = used.get(base) ?? 0;
          used.set(base, seen + 1);
          const id = seen === 0 ? base : `${base}-${seen}`;
          return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
        },
      },
    });
  }

  let html: string;
  try {
    html = marked.parse(markdown, { async: false });
  } catch (err) {
    throw new Error(
      `This Markdown could not be converted: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return opts.fullDocument ? wrapDocument(html, documentTitle(markdown)) : html.trimEnd();
}
