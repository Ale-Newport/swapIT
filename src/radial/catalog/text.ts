import { readTextFile } from '@tauri-apps/plugin-fs';
import TurndownService from 'turndown';
import { saveText } from '@/core/save';
import type { BatchResult, FileInfo } from '@/core/types';
import { csvToJson, jsonToCsv } from '@/tools/developer/json-csv/logic';
import { jsonToXml, xmlToJson } from '@/tools/developer/json-xml/logic';
import { jsonToYaml, yamlToJson } from '@/tools/developer/json-yaml/logic';
import { countText } from '@/tools/text/character-counter/logic';
import { DEFAULT_MD_OPTIONS, markdownToHtml, wrapDocument } from '@/tools/text/markdown-to-html/logic';
import type { ActionCtx, ActionResult, RadialItem } from '../model';
import { copyText } from '../system';
import { missing, pluralize, stemOf, task, type CatalogInput } from './util';

/** Read each file, transform its text, write the result beside it. */
function textTransform(spec: {
  id: string;
  label: string;
  glyph?: string;
  icon: string;
  title: string;
  hint: string;
  keywords: string[];
  ext: string;
  suffix?: string;
  transform: (text: string, file: FileInfo) => string;
}): RadialItem {
  return task({
    id: spec.id,
    label: spec.label,
    glyph: spec.glyph,
    icon: spec.icon,
    title: spec.title,
    hint: spec.hint,
    keywords: spec.keywords,
    run: async (ctx: ActionCtx): Promise<BatchResult> => {
      const started = Date.now();
      const batch: BatchResult = { results: [], failures: [], cancelled: false, elapsedMs: 0 };
      for (const file of ctx.files) {
        try {
          const text = await readTextFile(file.path);
          const out = spec.transform(text, file);
          batch.results.push(
            await saveText(out, { source: file.path, output: ctx.output({ suffix: spec.suffix ?? null }), ext: spec.ext }),
          );
        } catch (err) {
          batch.failures.push({
            path: file.path,
            name: file.name,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (batch.results.length === 0 && batch.failures.length > 0) throw new Error(batch.failures[0].message);
      batch.elapsedMs = Date.now() - started;
      return batch;
    },
  });
}

const YAML_OPTS = { indent: 2, sortKeys: false, flowLevel: -1 };

function jsonItems(): RadialItem[] {
  return [
    textTransform({
      id: 'text:json-yaml',
      label: 'YAML',
      glyph: 'YAML',
      icon: 'FileCode2',
      title: 'JSON → YAML',
      hint: 'Readable, comment-friendly config',
      keywords: ['yaml', 'yml', 'json to yaml'],
      ext: 'yaml',
      transform: (t) => jsonToYaml(t, YAML_OPTS),
    }),
    textTransform({
      id: 'text:json-csv',
      label: 'Spreadsheet',
      glyph: 'CSV',
      icon: 'Table',
      title: 'JSON → CSV',
      hint: 'Rows and columns for Excel or Numbers',
      keywords: ['csv', 'excel', 'table', 'json to csv', 'hoja de cálculo'],
      ext: 'csv',
      transform: (t) => jsonToCsv(t, { delimiter: ',' }).output,
    }),
    textTransform({
      id: 'text:json-xml',
      label: 'XML',
      glyph: 'XML',
      icon: 'CodeXml',
      title: 'JSON → XML',
      hint: 'Attributes use the “@_” prefix',
      keywords: ['xml', 'json to xml'],
      ext: 'xml',
      transform: (t) => jsonToXml(t, { rootName: 'root', indent: 2, attributePrefix: '@_', declaration: true }).output,
    }),
    textTransform({
      id: 'text:json-pretty',
      label: 'Prettify',
      icon: 'AlignLeft',
      title: 'Format JSON',
      hint: 'Two-space indentation',
      keywords: ['format', 'beautify', 'pretty', 'indent', 'formatear'],
      ext: 'json',
      suffix: '-formatted',
      transform: (t) => JSON.stringify(JSON.parse(t), null, 2) + '\n',
    }),
    textTransform({
      id: 'text:json-min',
      label: 'Minify',
      icon: 'Minimize2',
      title: 'Minify JSON',
      hint: 'One line, no spaces',
      keywords: ['minify', 'compact', 'compress', 'minificar'],
      ext: 'json',
      suffix: '-min',
      transform: (t) => JSON.stringify(JSON.parse(t)),
    }),
  ];
}

const MARKDOWN_PANDOC: Array<{ ext: string; label: string; to: string; blurb: string }> = [
  { ext: 'docx', label: 'Word', to: 'docx', blurb: 'Word' },
  { ext: 'odt', label: 'OpenDocument', to: 'odt', blurb: 'OpenDoc' },
  { ext: 'epub', label: 'E-book', to: 'epub', blurb: 'E-book' },
  { ext: 'rtf', label: 'Rich text', to: 'rtf', blurb: 'Rich text' },
];

function markdownItems(input: CatalogInput): RadialItem[] {
  const pandoc = missing(input.bins, 'pandoc');
  return [
    textTransform({
      id: 'convert:md-html',
      label: 'Web page',
      glyph: 'HTML',
      icon: 'Globe',
      title: 'Markdown → HTML page',
      hint: 'A complete, styled page',
      keywords: ['html', 'web', 'page', 'markdown to html'],
      ext: 'html',
      transform: (t, f) => wrapDocument(markdownToHtml(t, DEFAULT_MD_OPTIONS), stemOf(f.name)),
    }),
    ...MARKDOWN_PANDOC.map((target) =>
      task({
        id: `convert:md-${target.ext}`,
        label: target.blurb,
        glyph: target.ext.toUpperCase(),
        icon: 'FileType',
        title: `Markdown → ${target.label}`,
        hint: 'Pandoc',
        keywords: [target.ext, target.label.toLowerCase(), 'pandoc', 'markdown'],
        unavailable: pandoc,
        needs: ['pandoc'],
        run: (ctx: ActionCtx) =>
          ctx.job({
            command: 'pandoc_convert',
            label: `Markdown to ${target.label} · ${pluralize(ctx.files.length, 'file')}`,
            total: ctx.files.length,
            args: { inputs: ctx.paths, toFormat: target.to, fromFormat: 'gfm', output: ctx.output() },
          }),
      }),
    ),
  ];
}

function htmlToMarkdownItem(): RadialItem {
  return textTransform({
    id: 'convert:html-md',
    label: 'Markdown',
    glyph: 'MD',
    icon: 'FileCode2',
    title: 'HTML → Markdown',
    hint: 'Clean, readable text',
    keywords: ['markdown', 'md', 'html to markdown'],
    ext: 'md',
    transform: (t) =>
      new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' }).turndown(t) + '\n',
  });
}

function statsItem(): RadialItem {
  return task({
    id: 'text:stats',
    label: 'Count',
    title: 'Words, characters and lines',
    hint: 'Copied to the clipboard',
    icon: 'Hash',
    keywords: ['words', 'characters', 'count', 'palabras', 'caracteres', 'contar'],
    run: async (ctx): Promise<ActionResult> => {
      const text = (await Promise.all(ctx.files.map((f) => readTextFile(f.path)))).join('\n');
      const s = countText(text);
      const summary = `${s.words.toLocaleString('en-US')} words · ${s.characters.toLocaleString('en-US')} characters · ${s.lines.toLocaleString('en-US')} lines · ${s.readingLabel}`;
      await copyText(summary);
      return { title: 'Counted', detail: summary, snippet: summary };
    },
  });
}

function copyContentsItem(): RadialItem {
  return task({
    id: 'text:copy',
    label: 'Copy text',
    title: 'Copy the contents',
    hint: 'The whole file, as text',
    icon: 'ClipboardCopy',
    keywords: ['copy', 'contents', 'clipboard', 'copiar', 'contenido'],
    run: async (ctx): Promise<ActionResult> => {
      const text = (await Promise.all(ctx.files.map((f) => readTextFile(f.path)))).join('\n');
      await copyText(text);
      return {
        title: 'Copied',
        detail: `${text.length.toLocaleString('en-US')} characters on the clipboard`,
        snippet: text.slice(0, 220),
      };
    },
  });
}

/** Text-format conversions and quick text actions. */
export function textItems(input: CatalogInput): RadialItem[] {
  const { files } = input;
  if (files.length === 0 || files.some((f) => f.isDir)) return [];
  const exts = new Set(files.map((f) => f.extension.toLowerCase()));
  const only = (...wanted: string[]) => files.every((f) => wanted.includes(f.extension.toLowerCase()));
  const textual = files.every((f) => ['text', 'data', 'code'].includes(f.kind));
  const items: RadialItem[] = [];

  if (only('json')) items.push(...jsonItems());
  if (only('yaml', 'yml')) {
    items.push(
      textTransform({
        id: 'text:yaml-json',
        label: 'JSON',
        glyph: 'JSON',
        icon: 'Braces',
        title: 'YAML → JSON',
        hint: 'Strict, machine-friendly',
        keywords: ['json', 'yaml to json'],
        ext: 'json',
        transform: (t) => yamlToJson(t, YAML_OPTS).output + '\n',
      }),
    );
  }
  if (only('csv')) {
    items.push(
      textTransform({
        id: 'text:csv-json',
        label: 'JSON',
        glyph: 'JSON',
        icon: 'Braces',
        title: 'CSV → JSON',
        hint: 'An array of objects, first row as keys',
        keywords: ['json', 'csv to json'],
        ext: 'json',
        transform: (t) =>
          csvToJson(t, { header: true, inferTypes: true, empty: 'null', indent: 2, delimiter: '' }).output + '\n',
      }),
    );
  }
  if (only('xml')) {
    items.push(
      textTransform({
        id: 'text:xml-json',
        label: 'JSON',
        glyph: 'JSON',
        icon: 'Braces',
        title: 'XML → JSON',
        hint: 'Attributes keep the “@_” prefix',
        keywords: ['json', 'xml to json'],
        ext: 'json',
        transform: (t) => xmlToJson(t, { indent: 2, attributePrefix: '@_', parseValues: true }).output + '\n',
      }),
    );
  }
  if (only('md', 'markdown')) items.push(...markdownItems(input));
  if (only('html', 'htm')) items.push(htmlToMarkdownItem());

  if (textual || exts.has('txt') || exts.has('md')) items.push(statsItem(), copyContentsItem());
  return items;
}
