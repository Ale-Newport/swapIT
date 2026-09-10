import TurndownService from 'turndown';

export interface HtmlToMarkdownOptions {
  headingStyle: 'atx' | 'setext';
  bullet: '-' | '*' | '+';
  codeBlockStyle: 'fenced' | 'indented';
  /** Underscores give `_em_` and `__strong__`; asterisks give `*em*` and `**strong**`. */
  emphasis: 'underscore' | 'asterisk';
  /** What to do with elements Markdown has no equivalent for. */
  unknownTags: 'convert' | 'keep' | 'remove';
}

export const DEFAULT_HTML_OPTIONS: HtmlToMarkdownOptions = {
  headingStyle: 'atx',
  bullet: '-',
  codeBlockStyle: 'fenced',
  emphasis: 'asterisk',
  unknownTags: 'convert',
};

/**
 * Elements Markdown can represent, plus the structural wrappers whose contents
 * should simply flow through. Anything outside this set counts as "unknown".
 */
const HANDLED = new Set([
  'html', 'head', 'body', 'div', 'span', 'main', 'section', 'article', 'header', 'footer',
  'nav', 'aside', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code',
  'a', 'img', 'strong', 'b', 'em', 'i', 'del', 's', 'strike', 'ins', 'u', 'mark',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'small', 'sub', 'sup', 'figure', 'figcaption', 'label', 'time', 'abbr', 'cite', 'q',
]);

/** Never worth converting — their text is markup, not prose. */
const ALWAYS_DROP: TurndownService.TagName[] = [
  'script', 'style', 'head', 'noscript', 'template', 'iframe', 'object', 'embed',
];

function baseOptions(opts: HtmlToMarkdownOptions): TurndownService.Options {
  return {
    headingStyle: opts.headingStyle,
    bulletListMarker: opts.bullet,
    codeBlockStyle: opts.codeBlockStyle,
    fence: '```',
    emDelimiter: opts.emphasis === 'underscore' ? '_' : '*',
    strongDelimiter: opts.emphasis === 'underscore' ? '__' : '**',
    hr: '---',
    linkStyle: 'inlined',
  };
}

function cellText(html: string, cells: TurndownService): string {
  return cells
    .turndown(html)
    .replace(/\|/g, '\\|')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

/**
 * Turndown has no table rule of its own — without this a table collapses into a
 * run of loose paragraphs, which is the single worst thing it does to a page.
 */
function tableToMarkdown(table: Element, cells: TurndownService): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table);
  const grid = rows
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH')
        .map((cell) => cellText(cell.innerHTML, cells)),
    )
    .filter((row) => row.length > 0);

  if (grid.length === 0) return '';

  // A loop, not `Math.max(...grid.map(…))`: one spread argument per row blows
  // the call stack on a very large table, and nothing caps the input size.
  let width = 0;
  for (const row of grid) {
    if (row.length > width) width = row.length;
  }
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
  const head = line(grid[0]);
  const rule = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  const body = grid.slice(1).map(line);
  return `\n\n${[head, rule, ...body].join('\n')}\n\n`;
}

function build(opts: HtmlToMarkdownOptions): TurndownService {
  // A second service converts individual table cells; it must not carry the
  // table rule itself or a nested table would recurse.
  const cells = new TurndownService(baseOptions(opts));
  cells.remove(ALWAYS_DROP);

  const service = new TurndownService(baseOptions(opts));
  service.remove(ALWAYS_DROP);
  service.addRule('gfmTable', {
    filter: 'table',
    replacement: (_content, node) => tableToMarkdown(node as unknown as Element, cells),
  });

  if (opts.unknownTags === 'keep') {
    service.keep((node) => !HANDLED.has(node.nodeName.toLowerCase()));
  } else if (opts.unknownTags === 'remove') {
    service.remove((node) => !HANDLED.has(node.nodeName.toLowerCase()));
  }

  return service;
}

/** Convert an HTML fragment or whole document into Markdown. */
export function htmlToMarkdown(html: string, opts: HtmlToMarkdownOptions): string {
  if (!html.trim()) return '';
  let markdown: string;
  try {
    markdown = build(opts).turndown(html);
  } catch (err) {
    throw new Error(
      `This HTML could not be converted: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Trim blank lines only — an indented code block at the very top keeps its
  // four leading spaces.
  return markdown.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
}
