import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

export type Format = 'json' | 'xml';
export type Direction = 'auto' | 'jsonToXml' | 'xmlToJson';

/** The element name used for entries of a top-level JSON array. */
export const ARRAY_ITEM_NAME = 'item';

export interface XmlOptions {
  /** Wrapper element used when the JSON is an array or has several top-level keys. */
  rootName: string;
  indent: number;
  /** Object keys carrying this prefix become XML attributes. */
  attributePrefix: string;
  declaration: boolean;
}

export interface JsonOptions {
  indent: number;
  attributePrefix: string;
  /** Read `42` and `true` as a number and a boolean rather than as strings. */
  parseValues: boolean;
}

export function jsonErrorMessage(input: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const at = /at position (\d+)/.exec(message);
  if (at) {
    const before = input.slice(0, Number(at[1]));
    const line = before.split('\n').length;
    const column = before.length - before.lastIndexOf('\n');
    const cleaned = message.replace(/\s*(in JSON)?\s*at position \d+.*$/, '').replace(/[.\s]+$/, '');
    return `${cleaned} — line ${line}, column ${column}.`;
  }
  if (/Unexpected end of JSON input/i.test(message)) {
    return 'The JSON ends too early — a bracket, brace or quote was never closed.';
  }
  return message.replace(/[.\s]*$/, '.');
}

export function detectFormat(text: string): Format {
  const trimmed = text.trim();
  if (!trimmed) return 'json';
  if (trimmed.startsWith('<')) return 'xml';
  return 'json';
}

export function isValidElementName(name: string): boolean {
  return /^[A-Za-z_][\w.-]*$/.test(name);
}

/**
 * Decide what the single root element should contain. XML allows exactly one
 * root, so an array or a multi-key object has to be wrapped; a document that
 * already has a single root key is built as it is.
 */
export function prepareRoot(value: unknown, rootName: string): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { [rootName]: { [ARRAY_ITEM_NAME]: value } };
  }
  if (value === null || typeof value !== 'object') {
    return { [rootName]: value };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1 && !Array.isArray(entries[0][1])) {
    return value as Record<string, unknown>;
  }
  return { [rootName]: value };
}

export function jsonToXml(text: string, options: XmlOptions): { output: string; rootName: string } {
  if (!isValidElementName(options.rootName)) {
    throw new Error(
      `“${options.rootName}” is not a usable element name. Start with a letter or underscore and use only letters, digits, dots, dashes and underscores.`,
    );
  }
  if (!options.attributePrefix) {
    throw new Error('The attribute prefix cannot be empty — without it, attributes and child elements are indistinguishable.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`That is not valid JSON. ${jsonErrorMessage(text, err)}`);
  }
  const document = prepareRoot(parsed, options.rootName);
  const builder = new XMLBuilder({
    format: true,
    indentBy: ' '.repeat(Math.min(8, Math.max(0, Math.round(options.indent)))),
    ignoreAttributes: false,
    attributeNamePrefix: options.attributePrefix,
    suppressEmptyNode: true,
    textNodeName: '#text',
  });
  let body: string;
  try {
    body = builder.build(document) as string;
  } catch (err) {
    throw new Error(`This JSON could not be written as XML. ${err instanceof Error ? err.message : String(err)}`);
  }
  const output = options.declaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${body}` : body;
  return { output: output.replace(/\n+$/, '\n'), rootName: Object.keys(document)[0] };
}

interface ValidationError {
  err?: { code?: string; msg?: string; line?: number; col?: number };
}

export function xmlToJson(text: string, options: JsonOptions): { output: string; rootName: string | null } {
  if (!options.attributePrefix) {
    throw new Error('The attribute prefix cannot be empty — attributes would collide with child elements.');
  }
  const validation = XMLValidator.validate(text, { allowBooleanAttributes: true }) as true | ValidationError;
  if (validation !== true) {
    const err = validation.err ?? {};
    if (/start tag expected/i.test(err.msg ?? '')) {
      throw new Error('There are no XML elements here — the text starts with something other than a tag.');
    }
    const where = typeof err.line === 'number' ? ` (line ${err.line}, column ${err.col ?? 1})` : '';
    throw new Error(`That is not well-formed XML${where}. ${err.msg ?? 'Check that every tag is closed.'}`);
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: options.attributePrefix,
    parseAttributeValue: options.parseValues,
    parseTagValue: options.parseValues,
    trimValues: true,
    allowBooleanAttributes: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
    textNodeName: '#text',
  });
  const parsed = parser.parse(text) as Record<string, unknown>;
  const keys = Object.keys(parsed);
  return {
    output: JSON.stringify(parsed, null, Math.min(8, Math.max(0, Math.round(options.indent)))),
    rootName: keys[0] ?? null,
  };
}
