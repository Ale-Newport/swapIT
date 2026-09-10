import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

/**
 * Pretty-printing SVG is an XML problem, not a text problem: attribute order,
 * comments, CDATA, the XML declaration and the DOCTYPE all have to survive.
 * `preserveOrder` keeps the tree in document order so the rebuild is the same
 * file, re-indented.
 *
 * Two things must never be re-indented, because inside them whitespace is
 * content rather than layout: anything under `xml:space="preserve"`, and any
 * element that mixes character data with child elements — `<text>Hello<tspan>…`
 * renders as "Helloworld", and a newline between the two would turn it into
 * "Hello world". Those subtrees are lifted out before parsing and put back byte
 * for byte afterwards, so the formatted file renders exactly like the original.
 */
export type IndentStyle = '2' | '4' | 'tab';

export function indentString(style: IndentStyle): string {
  if (style === 'tab') return '\t';
  return ' '.repeat(style === '4' ? 4 : 2);
}

const SHARED = {
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: '@_',
  suppressEmptyNode: true,
  commentPropName: '#comment',
  cdataPropName: '#cdata',
  parseTagValue: false,
  parseAttributeValue: false,
  // Entity references are left exactly as written: expanding them would resolve
  // entities declared in the DOCTYPE's internal subset, and re-encoding them
  // turns a numeric reference such as `&#169;` into the broken `&amp;#169;`.
  processEntities: false,
  // Whitespace between elements is layout, not content: dropping it is what
  // makes re-indenting possible at all. Elements where that is *not* true never
  // reach the parser — see `findPreservedSpans`.
  trimValues: true,
} as const;

/**
 * Elements whose children are laid out as text. Whitespace between their child
 * elements is rendered, so such a subtree can never be re-indented.
 */
const TEXT_CONTENT_ELEMENTS = new Set([
  'text',
  'tspan',
  'textpath',
  'tref',
  'altglyph',
  'altglyphdef',
  'altglyphitem',
  'glyphref',
  'title',
  'desc',
]);

export interface PreservedSpan {
  /** Index of the `<` that opens the element. */
  start: number;
  /** Index just past the element's closing `>`. */
  end: number;
  /** Tag name as written in the file. */
  tag: string;
  reason: 'preserve' | 'mixed';
}

/** Index just past the `>` that closes a tag, honouring quoted attribute values. */
function endOfTag(source: string, open: number): number {
  let quote: string | null = null;
  for (let i = open + 1; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return i + 1;
  }
  return source.length;
}

/** Index just past a `<!…>` declaration, whose internal subset may contain `>`. */
function endOfDeclaration(source: string, open: number): number {
  let depth = 0;
  for (let i = open + 2; i < source.length; i += 1) {
    const char = source[i];
    if (char === '[') depth += 1;
    else if (char === ']') depth -= 1;
    else if (char === '>' && depth <= 0) return i + 1;
  }
  return source.length;
}

function readTagName(source: string, from: number): string {
  let i = from;
  while (i < source.length && !/[\s/>]/.test(source[i])) i += 1;
  return source.slice(from, i);
}

const XML_SPACE_RE = /\sxml:space\s*=\s*("|')([^"']*)\1/i;

/**
 * The DOCTYPE, exactly as written. fast-xml-parser consumes it and the builder
 * never emits it again, so it has to be lifted out and put back by hand.
 */
export function extractDoctype(source: string): string | null {
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open < 0) return null;
    if (source.startsWith('<!--', open)) {
      const close = source.indexOf('-->', open + 4);
      cursor = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith('<?', open)) {
      const close = source.indexOf('?>', open + 2);
      cursor = close < 0 ? source.length : close + 2;
      continue;
    }
    if (/^<!doctype/i.test(source.slice(open, open + 9))) {
      return source.slice(open, endOfDeclaration(source, open));
    }
    // Anything else at this point is the root element.
    return null;
  }
  return null;
}

/**
 * The outermost subtrees whose inner whitespace is significant. Scanning the
 * text rather than a parsed tree is what makes byte-for-byte preservation
 * possible: the span is a pair of offsets into the original source.
 */
export function findPreservedSpans(source: string): PreservedSpan[] {
  interface Frame {
    name: string;
    start: number;
    preserve: boolean;
    hasElementChild: boolean;
    hasTextChild: boolean;
  }

  const stack: Frame[] = [];
  const found: PreservedSpan[] = [];
  let cursor = 0;

  const markText = (from: number, to: number) => {
    const top = stack[stack.length - 1];
    if (!top || to <= from) return;
    if (/\S/.test(source.slice(from, to))) top.hasTextChild = true;
  };

  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open < 0) {
      markText(cursor, source.length);
      break;
    }
    markText(cursor, open);

    if (source.startsWith('<!--', open)) {
      const close = source.indexOf('-->', open + 4);
      cursor = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const close = source.indexOf(']]>', open + 9);
      const end = close < 0 ? source.length : close + 3;
      markText(open + 9, Math.max(open + 9, end - 3));
      cursor = end;
      continue;
    }
    if (source.startsWith('<?', open)) {
      const close = source.indexOf('?>', open + 2);
      cursor = close < 0 ? source.length : close + 2;
      continue;
    }
    if (source.startsWith('<!', open)) {
      cursor = endOfDeclaration(source, open);
      continue;
    }
    if (source.startsWith('</', open)) {
      const close = source.indexOf('>', open + 2);
      const end = close < 0 ? source.length : close + 1;
      const frame = stack.pop();
      if (frame) {
        const mixed =
          frame.hasElementChild &&
          (frame.hasTextChild || TEXT_CONTENT_ELEMENTS.has(frame.name.toLowerCase()));
        if (frame.preserve || mixed) {
          found.push({
            start: frame.start,
            end,
            tag: frame.name,
            reason: frame.preserve ? 'preserve' : 'mixed',
          });
        }
      }
      cursor = end;
      continue;
    }

    const name = readTagName(source, open + 1);
    if (!name) {
      // A stray `<` in text. The validator rejects those before we get here,
      // but the scanner must not spin on one either.
      cursor = open + 1;
      continue;
    }
    const end = endOfTag(source, open);
    const tag = source.slice(open, end);
    const parent = stack[stack.length - 1];
    if (parent) parent.hasElementChild = true;
    if (!/\/\s*>$/.test(tag)) {
      const declared = XML_SPACE_RE.exec(tag)?.[2];
      stack.push({
        name,
        start: open,
        preserve: declared === undefined ? Boolean(parent?.preserve) : declared.trim().toLowerCase() === 'preserve',
        hasElementChild: false,
        hasTextChild: false,
      });
    }
    cursor = end;
  }

  // Inner spans close first, so drop everything an outer span already covers.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const outermost: PreservedSpan[] = [];
  for (const span of found) {
    const last = outermost[outermost.length - 1];
    if (last && span.start < last.end) continue;
    outermost.push(span);
  }
  return outermost;
}

const PLACEHOLDER = 'toolbox-preserved';
const PLACEHOLDER_RE = new RegExp(`<${PLACEHOLDER}-(\\d+)\\s*(?:/>|>\\s*</${PLACEHOLDER}-\\d+>)`, 'g');

function liftPreserved(source: string, spans: PreservedSpan[]): { text: string; chunks: string[] } {
  if (spans.length === 0) return { text: source, chunks: [] };
  const chunks: string[] = [];
  let text = '';
  let last = 0;
  spans.forEach((span, index) => {
    text += `${source.slice(last, span.start)}<${PLACEHOLDER}-${index}/>`;
    chunks.push(source.slice(span.start, span.end));
    last = span.end;
  });
  return { text: text + source.slice(last), chunks };
}

function restorePreserved(built: string, chunks: string[]): string {
  if (chunks.length === 0) return built;
  return built.replace(PLACEHOLDER_RE, (match, index: string) => chunks[Number(index)] ?? match);
}

function withDoctype(built: string, doctype: string | null): string {
  if (!doctype) return built;
  const declaration = /^<\?xml[\s\S]*?\?>[ \t]*\n?/.exec(built);
  if (!declaration) return `${doctype}\n${built}`;
  const head = declaration[0].endsWith('\n') ? declaration[0] : `${declaration[0]}\n`;
  return `${head}${doctype}\n${built.slice(declaration[0].length)}`;
}

export interface FormatOptions {
  indent: IndentStyle;
}

export function formatSvg(source: string, opts: FormatOptions): string {
  const text = source.trim();
  if (!text) return '';

  const check = XMLValidator.validate(text);
  if (check !== true) {
    const { msg, line, col } = check.err;
    throw new Error(`This is not valid XML, so it cannot be formatted: ${msg} (line ${line}, column ${col})`);
  }

  const doctype = extractDoctype(text);
  const { text: liftedText, chunks } = liftPreserved(text, findPreservedSpans(text));

  const tree = new XMLParser(SHARED).parse(liftedText) as unknown[];
  const output = new XMLBuilder({
    ...SHARED,
    format: true,
    indentBy: indentString(opts.indent),
  }).build(tree) as string;

  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error('There was no markup to format — check that the file contains an <svg> element.');
  }
  return `${withDoctype(restorePreserved(trimmed, chunks), doctype)}\n`;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.replace(/\n$/, '').split('\n').length;
}

export const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><!-- badge --><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8ef7"/><stop offset="1" stop-color="#1b45b4"/></linearGradient></defs><rect width="48" height="48" rx="10" fill="url(#g)"/><path d="M14 25l7 7 13-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>';
