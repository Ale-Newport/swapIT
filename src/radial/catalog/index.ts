import { toolsForFiles, visibleTools } from '@/core/registry';
import type { ClipboardSummary } from '@/core/quick';
import type { FileInfo } from '@/core/types';
import type { RadialItem } from '../model';
import { flattenItems } from '../menu';
import { clipboardItems, createItems, newFileItems } from './create';
import { convertItems } from './convert';
import { editItems } from './edit';
import { extraItems } from './extras';
import { textItems } from './text';
import { toolItems } from './tools';
import { compact, menu, preferAvailable, shortLabel, ui, type CatalogInput } from './util';

/**
 * The ring's design rules, in one place:
 *
 *  1. Six petals at most, ever. More than that is a list, and a list is what the
 *     right-click menu already is.
 *  2. The first ring is what you most likely want for *this* selection. Nothing else.
 *  3. Everything else is one petal away ("More") — never a page, never a scroll.
 *  4. Anything Finder already does well from the right-click menu (open, Quick Look,
 *     move, duplicate, compress, rename, new folder, Trash) is not on the ring.
 *  5. Typing finds anything, including what no ring shows.
 */

export interface BuildArgs extends CatalogInput {
  intent: string;
  clipboard: ClipboardSummary | null;
}

export interface MenuModel {
  /** The first ring. */
  root: RadialItem[];
  /** Everything typing can reach: the rings plus actions no ring shows. */
  pool: RadialItem[];
}

const byId = (items: RadialItem[]) => new Map(items.map((i) => [i.id, i]));

/** Tools of the full app that suit these files, as search-only "open in Toolbox" entries. */
function toolboxEntries(files: FileInfo[]): RadialItem[] {
  const suited = files.length > 0 ? toolsForFiles(files) : [];
  const rest = visibleTools().filter((t) => !suited.includes(t));
  return [...suited, ...rest].map((tool) =>
    ui({
      id: `toolbox:${tool.id}`,
      label: shortLabel(tool.name),
      title: tool.quickLabel ?? tool.name,
      hint: tool.description,
      icon: tool.icon,
      keywords: [...(tool.keywords ?? []), tool.category],
      run: (ctx) => ctx.openMain(`/t/${tool.id}`, tool.standalone ? undefined : ctx.paths),
    }),
  );
}

/** The format petals people reach for, in order, skipping the format the file already is. */
function direct(map: Map<string, RadialItem>, exts: string[], count: number): RadialItem[] {
  return preferAvailable(
    compact(exts.map((e) => map.get(`convert:${e}`))),
    count,
  );
}

// ------------------------------------------------------------------ per kind

function imageRoot(input: CatalogInput, all: Map<string, RadialItem>, convert: RadialItem[]): RadialItem[] {
  const formats = direct(all, ['jpg', 'png', 'webp', 'pdf'], 3);
  const shown = new Set(formats.map((i) => i.id));
  const otherFormats = menu({
    id: 'menu:formats',
    label: 'Other formats',
    title: 'More formats',
    icon: 'Repeat',
    keywords: ['format', 'convert', 'avif', 'tiff', 'bmp', 'gif', 'ico'],
    children: convert.filter((i) => !shown.has(i.id)).slice(0, 6),
  });
  const resize = menu({
    id: 'menu:resize',
    label: 'Resize',
    title: 'Make it smaller',
    hint: 'Half, a quarter, or a width in pixels',
    icon: 'Scaling',
    keywords: ['resize', 'scale', 'smaller', 'redimensionar'],
    children: ['edit:resize-50', 'edit:resize-25', 'edit:resize-1920', 'edit:resize-1280'].map((id) => all.get(id)),
  });
  const edit = menu({
    id: 'menu:edit',
    label: 'Edit',
    title: 'Rotate, mirror, black & white…',
    icon: 'Wand2',
    keywords: ['edit', 'rotate', 'flip', 'mirror', 'exif', 'metadata', 'grayscale'],
    children: ['edit:rotate-cw', 'edit:rotate-ccw', 'edit:flip', 'edit:grayscale', 'edit:strip'].map((id) => all.get(id)),
  });
  const extras = menu({
    id: 'menu:extras',
    label: 'Extras',
    title: 'Data URL, wallpaper, checksum',
    icon: 'Sparkles',
    children: ['tool:base64', 'tool:wallpaper', 'tool:hash'].map((id) => all.get(id)),
  });
  const more = menu({
    id: 'menu:more',
    label: 'More',
    title: 'More things to do with this image',
    icon: 'Ellipsis',
    children: [otherFormats, edit, all.get('tool:ocr'), all.get('tool:qr-scan'), all.get('tool:palette'), input.files.length === 1 ? extras : null],
  });
  return compact([...formats, all.get('edit:compress'), resize, more]);
}

function videoRoot(all: Map<string, RadialItem>, convert: RadialItem[]): RadialItem[] {
  const formats = direct(all, ['mp4', 'gif', 'mp3', 'webm'], 3);
  const shown = new Set(formats.map((i) => i.id));
  const otherFormats = menu({
    id: 'menu:formats',
    label: 'Other formats',
    title: 'More formats',
    icon: 'Repeat',
    children: convert.filter((i) => !shown.has(i.id)).slice(0, 6),
  });
  const edit = menu({
    id: 'menu:edit',
    label: 'Edit',
    title: 'Size, speed, direction',
    icon: 'Wand2',
    keywords: ['edit', 'speed', 'reverse', 'rotate', '720', '1080'],
    children: ['edit:video-720', 'edit:video-1080', 'edit:video-2x', 'edit:video-half', 'edit:video-reverse', 'edit:video-rotate'].map((id) => all.get(id)),
  });
  const more = menu({
    id: 'menu:more',
    label: 'More',
    title: 'More things to do with this video',
    icon: 'Ellipsis',
    children: [otherFormats, edit, all.get('edit:video-trim'), all.get('edit:video-thumb'), all.get('tool:info')],
  });
  return compact([...formats, all.get('edit:video-compress'), all.get('edit:mute'), more]);
}

function audioRoot(all: Map<string, RadialItem>, convert: RadialItem[]): RadialItem[] {
  const formats = direct(all, ['mp3', 'm4a', 'wav', 'flac'], 3);
  const shown = new Set(formats.map((i) => i.id));
  const otherFormats = menu({
    id: 'menu:formats',
    label: 'Other formats',
    title: 'More formats',
    icon: 'Repeat',
    children: convert.filter((i) => !shown.has(i.id)).slice(0, 6),
  });
  const edit = menu({
    id: 'menu:edit',
    label: 'Edit',
    title: 'Volume, speed, mono, voice',
    icon: 'Wand2',
    keywords: ['edit', 'volume', 'speed', 'mono', 'voice'],
    children: ['edit:audio-louder', 'edit:audio-quieter', 'edit:audio-fast', 'edit:audio-mono', 'edit:audio-voice'].map((id) => all.get(id)),
  });
  const more = menu({
    id: 'menu:more',
    label: 'More',
    title: 'More things to do with this audio',
    icon: 'Ellipsis',
    children: [otherFormats, edit, all.get('edit:audio-trim'), all.get('tool:info')],
  });
  return compact([...formats, all.get('edit:normalize'), all.get('edit:audio-small'), more]);
}

function pdfRoot(all: Map<string, RadialItem>): RadialItem[] {
  const lead = compact([all.get('pdf:merge'), all.get('pdf:compress'), all.get('convert:png'), all.get('convert:txt'), all.get('tool:ocr'), all.get('convert:docx')]).slice(0, 5);
  const shown = new Set(lead.map((i) => i.id));
  const more = menu({
    id: 'menu:more',
    label: 'More',
    title: 'More things to do with this PDF',
    icon: 'Ellipsis',
    children: ['pdf:compress-max', 'convert:jpg', 'convert:docx', 'tool:ocr', 'pdf:split', 'pdf:protect']
      .filter((id) => !shown.has(id))
      .map((id) => all.get(id))
      .slice(0, 6),
  });
  return compact([...lead, more]);
}

function documentRoot(convert: RadialItem[]): RadialItem[] {
  const order = ['pdf', 'docx', 'txt', 'md', 'html'];
  const sorted = [...convert].sort((a, b) => rank(order, a) - rank(order, b));
  const lead = preferAvailable(sorted, 5);
  const shown = new Set(lead.map((i) => i.id));
  const more = menu({
    id: 'menu:formats',
    label: 'Other formats',
    title: 'More formats',
    icon: 'Repeat',
    children: sorted.filter((i) => !shown.has(i.id)).slice(0, 6),
  });
  return compact([...lead, more]);
}

function rank(order: string[], item: RadialItem): number {
  const ext = item.id.replace(/^convert:/, '');
  const i = order.indexOf(ext);
  return i === -1 ? order.length : i;
}

function textRoot(files: FileInfo[], text: RadialItem[]): RadialItem[] {
  if (files.length === 0) return [];
  const quick = text.filter((i) => i.id === 'text:stats' || i.id === 'text:copy');
  const conversions = text.filter((i) => !quick.includes(i));
  const lead = conversions.slice(0, 5);
  const overflow = [...conversions.slice(5), ...quick];
  if (lead.length + overflow.length <= 6) return [...lead, ...overflow];
  const more = menu({
    id: 'menu:more',
    label: 'More',
    title: 'Count words, copy the text…',
    icon: 'Ellipsis',
    children: overflow.slice(0, 6),
  });
  return compact([...lead, more]);
}

/** Pick the right first ring for what is selected. */
function filesRoot(input: CatalogInput, parts: { all: Map<string, RadialItem>; convert: RadialItem[]; text: RadialItem[]; tools: RadialItem[] }): RadialItem[] {
  const { files } = input;
  const { all, convert, text, tools } = parts;
  const kinds = new Set(files.map((f) => f.kind));
  const only = kinds.size === 1 ? [...kinds][0] : null;

  switch (only) {
    case 'image':
      return imageRoot(input, all, convert);
    case 'svg':
      return preferAvailable(convert, 3);
    case 'video':
      return videoRoot(all, convert);
    case 'audio':
      return audioRoot(all, convert);
    case 'pdf':
      return pdfRoot(all);
    case 'document':
      return documentRoot(convert);
    case 'archive':
      return tools.slice(0, 6);
    case 'folder':
      return tools.slice(0, 6);
    case 'text':
    case 'data':
    case 'code':
      return textRoot(files, text);
    default:
      // A mix, or something with no converter of its own: the common conversions, then the checksum.
      return compact([...preferAvailable(convert, 4), all.get('tool:hash')]);
  }
}

// ------------------------------------------------------------------ create

function createRoot(input: CatalogInput, clipboard: ClipboardSummary | null): RadialItem[] {
  const create = new Map(createItems(input, clipboard).map((i) => [i.id, i]));
  const types = new Map(newFileItems().map((i) => [i.id, i]));
  const clip = clipboardItems();

  const web = menu({
    id: 'menu:new-web',
    label: 'Web',
    title: 'HTML, CSS, JavaScript, TypeScript',
    icon: 'Globe',
    children: ['new:html', 'new:css', 'new:js', 'new:ts'].map((id) => types.get(id)),
  });
  const data = menu({
    id: 'menu:new-data',
    label: 'Data',
    title: 'JSON, CSV, YAML, XML, SVG',
    icon: 'Braces',
    children: ['new:json', 'new:csv', 'new:yaml', 'new:xml', 'new:svg'].map((id) => types.get(id)),
  });
  const scripts = menu({
    id: 'menu:new-code',
    label: 'Scripts',
    title: 'Python, Shell, Swift',
    icon: 'Terminal',
    children: ['new:py', 'new:sh', 'new:swift'].map((id) => types.get(id)),
  });
  const newFile = menu({
    id: 'menu:new-file',
    label: 'Other file',
    title: 'A different kind of file',
    hint: 'Web, data or code',
    icon: 'FilePlus2',
    keywords: ['new file', 'create', 'html', 'json', 'python', 'nuevo archivo'],
    children: [web, data, scripts],
  });
  const clipboardMenu = menu({
    id: 'menu:clipboard',
    label: 'Clipboard',
    title: 'UUID, password, date, plain text',
    icon: 'Clipboard',
    children: clip.filter((i) => i.id !== 'clip:qr').slice(0, 6),
  });
  const more = menu({
    id: 'menu:more',
    label: 'More',
    title: 'More things to make',
    icon: 'Ellipsis',
    children: [create.get('create:daily'), create.get('create:ocr-screen'), clip.find((i) => i.id === 'clip:qr'), clipboardMenu, create.get('create:app')],
  });
  return compact([create.get('create:text'), create.get('create:markdown'), create.get('create:record'), newFile, create.get('create:paste'), more]);
}

/**
 * Build the menu for this context. With files selected the ring is about *those files*;
 * with nothing selected it is about making something new.
 */
export function buildMenu(args: BuildArgs): MenuModel {
  const { files, clipboard } = args;
  const input: CatalogInput = { files, folder: args.folder, bins: args.bins, settings: args.settings };

  const create = createItems(input, clipboard);
  const types = newFileItems();
  const clip = clipboardItems();
  const tools = toolboxEntries(files);

  if (files.length === 0) {
    const root = createRoot(input, clipboard);
    return { root, pool: dedupe([...flattenItems(root), ...create, ...types, ...clip, ...tools]) };
  }

  const convert = convertItems(input);
  const text = textItems(input);
  const edit = editItems(input);
  const toolSet = toolItems(input);
  const all = byId([...convert, ...text, ...edit, ...toolSet]);
  const root = filesRoot(input, { all, convert, text, tools: toolSet });

  // Everything the rings do not show is still one search away.
  const pool = dedupe([
    ...flattenItems(root),
    ...convert,
    ...text,
    ...edit,
    ...toolSet,
    ...extraItems(input),
    ...create,
    ...types,
    ...clip,
    ...tools,
  ]);
  return { root, pool };
}

function dedupe(items: RadialItem[]): RadialItem[] {
  return flattenItems(items);
}
