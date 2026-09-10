import { XMLParser, XMLValidator } from 'fast-xml-parser';

export interface XmlFormatOptions {
  /** Collapse everything onto one line instead of indenting it. */
  minify: boolean;
  /** The string used for one level of indentation. */
  indent: string;
  keepComments: boolean;
  /** Write `<tag/>` rather than `<tag></tag>` for elements with no content. */
  collapseEmpty: boolean;
}

export const DEFAULT_XML_OPTIONS: XmlFormatOptions = {
  minify: false,
  indent: '  ',
  keepComments: true,
  collapseEmpty: true,
};

const TEXT = '#text';
const CDATA = '#cdata';
const COMMENT = '#comment';
const ATTRS = ':@';

type OrderedNode = Record<string, unknown>;
type NodeKind = 'text' | 'cdata' | 'comment' | 'pi' | 'element';

/**
 * The DOCTYPE, which the parser reads for its entity declarations and then
 * throws away — it never reaches the tree, so it has to be carried across by
 * hand or every DTD-validated document (plist, DocBook, XHTML, SVG 1.1) comes
 * back invalid.
 */
const DOCTYPE = /^(\s*(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*)(<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?[^>]*>)/i;

function tagOf(node: OrderedNode): string {
  for (const key of Object.keys(node)) if (key !== ATTRS) return key;
  return '';
}

function childrenOf(node: OrderedNode, tag: string): OrderedNode[] {
  const value = node[tag];
  return Array.isArray(value) ? (value as OrderedNode[]) : [];
}

function attributesOf(node: OrderedNode): Record<string, string | boolean> {
  const attrs = node[ATTRS];
  return attrs && typeof attrs === 'object' ? (attrs as Record<string, string | boolean>) : {};
}

function kindOf(node: OrderedNode): NodeKind {
  const tag = tagOf(node);
  if (tag === TEXT) return 'text';
  if (tag === CDATA) return 'cdata';
  if (tag === COMMENT) return 'comment';
  if (tag.startsWith('?')) return 'pi';
  return 'element';
}

/** The characters inside a text, CDATA or comment node, exactly as authored. */
function innerText(node: OrderedNode, tag: string): string {
  if (tag === TEXT) return String(node[TEXT] ?? '');
  return childrenOf(node, tag)
    .map((child) => String(child[TEXT] ?? ''))
    .join('');
}

function renderAttributes(attrs: Record<string, string | boolean>): string {
  return Object.entries(attrs)
    .map(([rawName, rawValue]) => {
      const name = rawName.startsWith('@_') ? rawName.slice(2) : rawName;
      const value = rawValue === true ? 'true' : String(rawValue);
      // The parser drops the quote character the author used, so pick one that
      // does not need escaping and only fall back to &quot; when both appear.
      const quote = value.includes('"') && !value.includes("'") ? "'" : '"';
      const body = quote === '"' ? value.replace(/"/g, '&quot;') : value;
      return ` ${name}=${quote}${body}${quote}`;
    })
    .join('');
}

/** `xml:space="preserve"` means every space inside this element is content. */
function isPreserved(attrs: Record<string, string | boolean>): boolean {
  return attrs['@_xml:space'] === 'preserve';
}

function isWhitespaceText(node: OrderedNode): boolean {
  return kindOf(node) === 'text' && String(node[TEXT] ?? '').trim() === '';
}

/**
 * Serialize a run of nodes without adding, removing or moving a single
 * character of whitespace — used for mixed content and `xml:space="preserve"`,
 * where indentation would change what the document means.
 */
function renderInline(nodes: OrderedNode[], opts: XmlFormatOptions): string {
  return nodes.map((node) => renderNodeInline(node, opts)).join('');
}

function renderNodeInline(node: OrderedNode, opts: XmlFormatOptions): string {
  const tag = tagOf(node);
  switch (kindOf(node)) {
    case 'text':
      return innerText(node, tag);
    case 'cdata':
      return `<![CDATA[${innerText(node, tag)}]]>`;
    case 'comment':
      return `<!--${innerText(node, tag)}-->`;
    case 'pi':
      return renderProcessingInstruction(node, tag);
    default: {
      const attrs = renderAttributes(attributesOf(node));
      const kids = childrenOf(node, tag);
      if (kids.length === 0) return opts.collapseEmpty ? `<${tag}${attrs}/>` : `<${tag}${attrs}></${tag}>`;
      return `<${tag}${attrs}>${renderInline(kids, opts)}</${tag}>`;
    }
  }
}

function renderProcessingInstruction(node: OrderedNode, tag: string): string {
  const attrs = renderAttributes(attributesOf(node));
  const body = innerText(node, tag).trim();
  return `<${tag}${attrs}${body ? ` ${body}` : ''}?>`;
}

function renderNode(node: OrderedNode, depth: number, opts: XmlFormatOptions): string {
  const tag = tagOf(node);
  const kind = kindOf(node);
  if (kind === 'element') return renderElement(node, tag, depth, opts);
  return renderNodeInline(node, opts);
}

function renderElement(node: OrderedNode, tag: string, depth: number, opts: XmlFormatOptions): string {
  const attrs = attributesOf(node);
  const attrText = renderAttributes(attrs);
  const empty = opts.collapseEmpty ? `<${tag}${attrText}/>` : `<${tag}${attrText}></${tag}>`;
  const open = `<${tag}${attrText}>`;
  const close = `</${tag}>`;
  const kids = childrenOf(node, tag);

  if (kids.length === 0) return empty;
  if (isPreserved(attrs)) return open + renderInline(kids, opts) + close;

  const hasMarkup = kids.some((kid) => {
    const kind = kindOf(kid);
    return kind === 'element' || kind === 'comment' || kind === 'pi';
  });
  const hasCdata = kids.some((kid) => kindOf(kid) === 'cdata');
  const text = kids.filter((kid) => kindOf(kid) === 'text').map((kid) => innerText(kid, TEXT)).join('');

  // Plain text content: the surrounding indentation is the author's, not data.
  if (!hasMarkup && !hasCdata) {
    const trimmed = text.trim();
    return trimmed === '' ? empty : open + trimmed + close;
  }

  // Mixed content — text or CDATA sitting next to elements. The spaces between
  // them are characters of the document, so the whole run goes out verbatim.
  if (hasCdata || text.trim() !== '') return open + renderInline(kids, opts) + close;

  const rendered = kids.filter((kid) => !isWhitespaceText(kid)).map((kid) => renderNode(kid, depth + 1, opts));
  if (rendered.length === 0) return empty;
  if (opts.minify) return open + rendered.join('') + close;
  const pad = opts.indent.repeat(depth + 1);
  return `${open}\n${rendered.map((line) => pad + line).join('\n')}\n${opts.indent.repeat(depth)}${close}`;
}

/** Put the DOCTYPE back where it belongs: immediately before the root element. */
function withDoctype(parts: string[], nodes: OrderedNode[], doctype: string | null): string[] {
  if (!doctype) return parts;
  const root = nodes.findIndex((node) => kindOf(node) === 'element');
  const at = root === -1 ? parts.length : root;
  return [...parts.slice(0, at), doctype, ...parts.slice(at)];
}

/**
 * Reformat an XML document. `preserveOrder` keeps siblings, comments and CDATA
 * exactly where the author put them, which is the whole point of a formatter —
 * the default object mode would silently reorder and merge repeated tags.
 *
 * Indentation is only ever added where it cannot change the document: between
 * elements that hold no character data of their own. Mixed content, CDATA and
 * `xml:space="preserve"` subtrees are written back byte for byte, and entities
 * are never decoded or re-encoded, so `&#233;` stays `&#233;`.
 */
export function formatXml(input: string, opts: XmlFormatOptions): string {
  const text = input.trim();
  if (!text) return '';

  const check = XMLValidator.validate(text, { allowBooleanAttributes: true });
  if (check !== true) {
    const { msg, line, col } = check.err;
    throw new Error(`${msg.replace(/\.$/, '')} — line ${line}, column ${col}.`);
  }

  const comment = opts.keepComments ? COMMENT : false;
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    allowBooleanAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    commentPropName: comment,
    cdataPropName: CDATA,
    processEntities: false,
  });

  let tree: unknown;
  try {
    tree = parser.parse(text);
  } catch (err) {
    throw new Error(`This XML could not be read: ${err instanceof Error ? err.message : String(err)}`);
  }

  const nodes = ((Array.isArray(tree) ? tree : []) as OrderedNode[]).filter((node) => !isWhitespaceText(node));
  const parts = nodes.map((node) => renderNode(node, 0, opts));
  return withDoctype(parts, nodes, text.match(DOCTYPE)?.[2] ?? null).join(opts.minify ? '' : '\n');
}

/** Rough element count, used for the stats line under the output. */
export function countElements(xml: string): number {
  const matches = xml.match(/<(?!\/|\?|!)[^\s/>]+/g);
  return matches ? matches.length : 0;
}
