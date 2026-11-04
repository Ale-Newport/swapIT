import type { FileInfo } from '@/core/types';
import { menu } from './catalog/util';
import { MAX_SLOTS } from './geometry';
import { flattenItems } from './menu';
import type { RadialItem } from './model';

/**
 * Your own ring, per kind of file.
 *
 * The standard rings are curated by hand. A layout replaces one of them with a plain list you
 * edit: switch actions on or off and put them in the order you like. The first five that are on
 * sit on the ring; the next ones are inside "More ›", and so on — never a page, never a scroll.
 * Whatever is switched off (or does not fit) is still one search away.
 */

export type LayoutKey = 'create' | 'image' | 'svg' | 'video' | 'audio' | 'pdf' | 'document' | 'text' | 'archive' | 'folder' | 'mixed';

/** What is saved: every action's place in the list, and which are switched off. */
export interface RingLayout {
  order: string[];
  off: string[];
}

export type RingLayouts = Partial<Record<LayoutKey, RingLayout>>;

export const LAYOUT_TYPES: Array<{ key: LayoutKey; label: string; hint: string; icon: string }> = [
  { key: 'create', label: 'Nothing selected', hint: 'Make something new', icon: 'Plus' },
  { key: 'image', label: 'Images', hint: 'PNG, JPG, HEIC, WebP…', icon: 'Image' },
  { key: 'video', label: 'Video', hint: 'MP4, MOV, MKV…', icon: 'Video' },
  { key: 'audio', label: 'Audio', hint: 'MP3, WAV, M4A…', icon: 'AudioLines' },
  { key: 'pdf', label: 'PDF', hint: 'One or several PDFs', icon: 'FileText' },
  { key: 'document', label: 'Documents', hint: 'Word, Pages, slides', icon: 'FileType' },
  { key: 'text', label: 'Text & data', hint: 'Markdown, JSON, CSV, code', icon: 'Braces' },
  { key: 'svg', label: 'SVG', hint: 'Vector graphics', icon: 'PenTool' },
  { key: 'archive', label: 'Archives', hint: 'ZIP and friends', icon: 'FileArchive' },
  { key: 'folder', label: 'Folders', hint: 'Anything about a folder', icon: 'Folder' },
  { key: 'mixed', label: 'Mixed or other', hint: 'Several kinds at once, or unknown', icon: 'Images' },
];

const KEYS = new Set<string>(LAYOUT_TYPES.map((t) => t.key));

/** Which layout a selection uses. Mirrors how the standard first ring is chosen. */
export function layoutKeyFor(files: FileInfo[]): LayoutKey {
  if (files.length === 0) return 'create';
  const kinds = new Set(files.map((f) => f.kind));
  if (kinds.size !== 1) return 'mixed';
  switch ([...kinds][0]) {
    case 'image':
    case 'svg':
    case 'video':
    case 'audio':
    case 'pdf':
    case 'document':
    case 'archive':
    case 'folder':
      return [...kinds][0] as LayoutKey;
    case 'text':
    case 'data':
    case 'code':
      return 'text';
    default:
      return 'mixed';
  }
}

/** Layouts come from a file people can edit by hand: keep only what makes sense. */
export function sanitizeLayouts(raw: unknown): RingLayouts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RingLayouts = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEYS.has(key) || !value || typeof value !== 'object') continue;
    const { order, off } = value as { order?: unknown; off?: unknown };
    const strings = (list: unknown): string[] =>
      Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];
    const cleanOrder = strings(order);
    if (cleanOrder.length === 0) continue;
    out[key as LayoutKey] = { order: cleanOrder, off: strings(off) };
  }
  return out;
}

// ------------------------------------------------------------------ the list

export interface ListedAction {
  item: RadialItem;
  on: boolean;
}

/** The actions with no sub-ring in them: the things that actually do something. */
export function leaves(items: RadialItem[]): RadialItem[] {
  return flattenItems(items).filter((i) => !i.children);
}

/**
 * Every action of one kind of file in the order the user sees them, each with its on/off state.
 *
 * `candidates` is everything this kind can do; `shipped` the ids the standard ring reaches.
 * With no saved layout the standard ring is the starting point: what it reaches is on, in the
 * order it reaches it (as many as the rings can hold), and the rest is off.
 */
export function listActions(candidates: RadialItem[], shipped: ReadonlySet<string>, layout?: RingLayout): ListedAction[] {
  if (!layout) {
    // The standard ring reaches more than the rings can hold in one list; the least used start off.
    let room = RING_CAPACITY;
    return candidates.map((item) => {
      const on = shipped.has(item.id) && room > 0;
      if (on) room -= 1;
      return { item, on };
    });
  }
  const byId = new Map(candidates.map((i) => [i.id, i]));
  const off = new Set(layout.off);
  const placed = new Set<string>();
  const out: ListedAction[] = [];
  for (const id of layout.order) {
    const item = byId.get(id);
    if (!item || placed.has(id)) continue;
    placed.add(id);
    out.push({ item, on: !off.has(id) });
  }
  // Actions the saved list has never seen (added by an update) go last, on only if the standard ring had them.
  for (const item of candidates) {
    if (!placed.has(item.id)) out.push({ item, on: !off.has(item.id) && shipped.has(item.id) });
  }
  return out;
}

/** The list a person edits: everything that is on first (in order), then everything that is off. */
export function splitByState(list: ListedAction[]): { on: RadialItem[]; off: RadialItem[] } {
  return {
    on: list.filter((a) => a.on).map((a) => a.item),
    off: list.filter((a) => !a.on).map((a) => a.item),
  };
}

export function toLayout(on: RadialItem[], off: RadialItem[]): RingLayout {
  return { order: [...on, ...off].map((i) => i.id), off: off.map((i) => i.id) };
}

/** Largest number of actions the rings can hold: 5 + 5 + 6 over three levels. */
export const RING_CAPACITY = (MAX_SLOTS - 1) * 2 + MAX_SLOTS;

export type Placement = 'ring' | 'more' | 'typing';

/** Where the `index`-th action that is on ends up, given how many are on in all. */
export function placement(index: number, total: number): Placement {
  if (total <= MAX_SLOTS) return 'ring';
  if (index < MAX_SLOTS - 1) return 'ring';
  return index < RING_CAPACITY ? 'more' : 'typing';
}

/**
 * Lay the actions out as rings: five and a "More ›" when there are more than six, and the same
 * again inside it, down to a third ring. What still does not fit is left to typing.
 */
export function arrange(items: RadialItem[]): RadialItem[] {
  const level = (rest: RadialItem[], depth: number): RadialItem[] => {
    if (rest.length <= MAX_SLOTS) return rest;
    if (depth >= 3) return rest.slice(0, MAX_SLOTS);
    const more = menu({
      id: depth === 1 ? 'menu:more' : `menu:more-${depth}`,
      label: 'More',
      title: 'More things to do',
      icon: 'Ellipsis',
      children: level(rest.slice(MAX_SLOTS - 1), depth + 1),
    });
    const head = rest.slice(0, MAX_SLOTS - 1);
    return more ? [...head, more] : head;
  };
  return level(items, 1);
}

/** The first ring for a selection: the user's layout if they made one, else the standard ring. */
export function applyLayout(standard: RadialItem[], candidates: RadialItem[], layout: RingLayout | undefined): RadialItem[] {
  if (!layout) return standard;
  const shipped = new Set(leaves(standard).map((i) => i.id));
  const on = listActions(candidates, shipped, layout)
    .filter((a) => a.on)
    .map((a) => a.item);
  // Everything switched off would leave an empty ring; fall back rather than strand anyone.
  return on.length > 0 ? arrange(on) : standard;
}
