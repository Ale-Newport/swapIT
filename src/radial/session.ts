import { inspectPaths } from '@/core/bridge';
import { clipboardSummary, defaultFolders, type ClipboardSummary } from '@/core/quick';
import { useSettings } from '@/core/settings';
import type { FileInfo } from '@/core/types';
import { buildMenu } from './catalog';
import { hitSlot, type Point } from './geometry';
import { assumeLayout, forgetLayout, ringLayout } from './layout';
import { searchItems, visibleItems } from './menu';
import type { RadialItem, RadialOpenPayload } from './model';
import { radialReady } from './native';
import { slotCount } from './Ring';
import { appearance, binsNow, clearHudTimer, closeRadial, loadBins, resetAfterHide, runItem, showCard, showRing } from './runner';
import { radial } from './store';

/** The petals on screen right now: search results while typing, else the open sub-ring, else the first ring. */
export function currentItems(): RadialItem[] {
  const { root, stack, pool, query } = radial.get();
  const results = query.trim() ? searchItems(pool, query) : null;
  return visibleItems(root, stack, results);
}

export function hoveredItem(): RadialItem | null {
  const { hover } = radial.get();
  return hover === null ? null : (currentItems()[hover] ?? null);
}

async function resolveFolder(payload: RadialOpenPayload): Promise<string> {
  if (payload.folder) return payload.folder;
  const settings = useSettings.getState().settings;
  const configured = typeof settings.radialCreateDir === 'string' ? settings.radialCreateDir : '';
  if (configured) return configured;
  return (await defaultFolders()).desktop;
}

let sequence = 0;
let lastClipboard: ClipboardSummary | null = null;

/** Never let a slow side-query hold the ring back: take its answer if it is quick, else move on. */
function soon<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function findById(items: RadialItem[], id: string): RadialItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const inner = item.children ? findById(item.children, id) : undefined;
    if (inner) return inner;
  }
  return undefined;
}

/** Rebuild the menu for the current files — used when late information (helper programs) arrives. */
function rebuild(): void {
  const s = radial.get();
  if (s.phase === 'idle' || s.phase === 'loading') return;
  const { root, pool } = buildMenu({
    files: s.files,
    folder: s.folder,
    bins: binsNow() ?? {},
    settings: useSettings.getState().settings,
    intent: s.session?.intent ?? 'ring',
    clipboard: lastClipboard,
  });
  // Keep the user where they are: re-find the open sub-rings in the rebuilt tree by id.
  const stack: RadialItem[] = [];
  let level = root;
  for (const open of s.stack) {
    const next = findById(level, open.id);
    if (!next?.children) break;
    stack.push(next);
    level = next.children;
  }
  radial.patch({ root, pool, stack });
}

/** Start (or restart) a session from the native `radial://open` event. */
export async function openSession(payload: RadialOpenPayload): Promise<void> {
  const mine = ++sequence;
  clearHudTimer();
  resetAfterHide();
  forgetLayout();
  radial.patch({
    phase: 'loading',
    session: payload,
    openedAt: performance.now(),
    dragging: payload.trigger === 'drag',
    permissionNote:
      payload.permission === 'automation_denied'
        ? 'Toolbox cannot see your Finder selection yet. Allow it in System Settings › Privacy › Automation.'
        : null,
  });

  // Everything the ring needs, fetched side by side: the slowest of these is the ring's latency.
  const settingsReady = useSettings.getState().load();
  const [files, folder, clipboard] = await Promise.all([
    payload.paths.length > 0 ? inspectPaths(payload.paths).catch(() => [] as FileInfo[]) : Promise.resolve([] as FileInfo[]),
    settingsReady.then(() => resolveFolder(payload)),
    soon(clipboardSummary().catch(() => null), 220, null),
  ]);
  if (mine !== sequence) return;
  lastClipboard = clipboard;

  const settings = useSettings.getState().settings;
  const known = binsNow();
  const { root, pool } = buildMenu({ files, folder, bins: known ?? {}, settings, intent: payload.intent, clipboard });
  radial.patch({ files, folder, root, pool, stack: [], hover: null, query: '' });
  // First ever open: dim what cannot run as soon as the probe finishes, without having waited for it.
  if (!known) void loadBins().then(() => mine === sequence && rebuild());

  // The native side already put the ring layout in place when it showed the window.
  assumeLayout(ringLayout(appearance()));

  switch (payload.intent) {
    case 'create:text':
      await showCard({ kind: 'new-file', type: 'txt' });
      break;
    case 'create:markdown':
      await showCard({ kind: 'new-file', type: 'md' });
      break;
    case 'record':
      await showCard({ kind: 'recorder' });
      break;
    default:
      await showRing();
  }
  if (mine !== sequence) return;
  // Two frames: React has committed and the browser has painted. Only then let the window be seen.
  requestAnimationFrame(() => requestAnimationFrame(() => void radialReady(payload.id).catch(() => undefined)));
}

/** Replace the files the ring acts on (a drop onto an open ring). */
export async function replaceFiles(paths: string[]): Promise<void> {
  const state = radial.get();
  const files = await inspectPaths(paths).catch(() => [] as FileInfo[]);
  if (files.length === 0) return;
  const folder = state.folder ?? (await defaultFolders()).desktop;
  const settings = useSettings.getState().settings;
  const { root, pool } = buildMenu({ files, folder, bins: binsNow() ?? {}, settings, intent: 'ring', clipboard: lastClipboard });
  radial.patch({ files, root, pool, stack: [], hover: null, query: '' });
}

export function setHoverFromPoint(point: Point | null): void {
  const items = currentItems();
  if (!point || items.length === 0) {
    if (radial.get().hover !== null) radial.patch({ hover: null });
    return;
  }
  const slot = hitSlot(point, slotCount(items.length), items.length);
  if (slot !== radial.get().hover) radial.patch({ hover: slot });
}

export function setQuery(query: string): void {
  radial.patch({ query, hover: null });
}

/** Move the highlight one petal clockwise (1) or back (-1), wrapping around the ring. */
export function step(direction: 1 | -1): void {
  const items = currentItems();
  if (items.length === 0) return;
  const { hover } = radial.get();
  const n = items.length;
  radial.patch({ hover: hover === null ? (direction === 1 ? 0 : n - 1) : (hover + direction + n) % n });
}

/** Open a petal's sub-ring. */
export function openMenu(item: RadialItem): void {
  if (!item.children?.length) return;
  radial.patch({ stack: [...radial.get().stack, item], hover: null, query: '' });
}

/** One level up: out of search, then out of a sub-ring. Returns false when there is nowhere to go. */
export function back(): boolean {
  const { query, stack } = radial.get();
  if (query) {
    setQuery('');
    return true;
  }
  if (stack.length > 0) {
    radial.patch({ stack: stack.slice(0, -1), hover: null });
    return true;
  }
  return false;
}

/** Run the petal at `index`, or — with none given — the highlighted one, or the first search hit. */
export function activate(index: number | null): void {
  const items = currentItems();
  const slot = index ?? radial.get().hover ?? (radial.get().query ? 0 : null);
  if (slot === null) return;
  const item = items[slot];
  if (!item) return;
  if (item.children) openMenu(item);
  else void runItem(item);
}

/** A file dropped on the ring: act on the dropped files, not the ones it opened with. */
export async function dropOnRing(paths: string[], point: Point | null): Promise<void> {
  const state = radial.get();
  if (state.phase !== 'ring' || paths.length === 0) return;
  const items = currentItems();
  const slot = point ? hitSlot(point, slotCount(items.length), items.length) : null;
  const target = slot !== null ? items[slot] : undefined;

  const sameFiles = paths.length === state.files.length && paths.every((p) => state.files.some((f) => f.path === p || f.path.endsWith(p)));
  if (!sameFiles) await replaceFiles(paths);

  if (!target) return;
  // The same action, looked up again in the (possibly rebuilt) menu for the dropped files.
  const rebuilt = findById(radial.get().pool, target.id);
  if (!rebuilt) {
    radial.patch({ hover: null });
    return;
  }
  if (rebuilt.children) openMenu(rebuilt);
  else void runItem(rebuilt);
}

export { closeRadial };
