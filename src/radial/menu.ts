import Fuse from 'fuse.js';
import { MAX_SLOTS } from './geometry';
import type { RadialItem } from './model';

/** The items the ring shows right now: search results, else the open sub-ring, else the first ring. */
export function visibleItems(root: RadialItem[], stack: RadialItem[], results: RadialItem[] | null): RadialItem[] {
  if (results) return results;
  const top = stack[stack.length - 1];
  return top?.children ?? root;
}

/** Every distinct leaf (and menu) under `items`, first occurrence wins. Menus themselves are searchable too. */
export function flattenItems(items: RadialItem[]): RadialItem[] {
  const seen = new Set<string>();
  const out: RadialItem[] = [];
  const visit = (list: RadialItem[]) => {
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
      if (item.children) visit(item.children);
    }
  };
  visit(items);
  return out;
}

/** 0 = starts with the query, 1 = a word starts with it, 2 = contains it, Infinity = no match. */
function directScore(item: RadialItem, q: string): number {
  let best = Infinity;
  const fields = [item.label, item.title, item.glyph ?? '', ...(item.keywords ?? [])];
  for (const field of fields) {
    const f = field.toLowerCase();
    if (!f) continue;
    if (f.startsWith(q)) best = Math.min(best, 0);
    else if (f.includes(` ${q}`) || f.includes(`-${q}`)) best = Math.min(best, 1);
    else if (f.includes(q)) best = Math.min(best, 2);
  }
  return best;
}

/**
 * Search the whole pool. Typing on the ring is how you reach the long tail — the ring itself
 * stays small. Literal matches (prefix, word start, substring) come first; fuzzy matching only
 * fills in when the literal ones are few. Menus are skipped: you want the action, not the folder it is in.
 */
export function searchItems(pool: RadialItem[], query: string, limit = MAX_SLOTS): RadialItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const docs = pool.filter((i) => !i.children);

  const direct = docs
    .map((item, order) => ({ item, score: directScore(item, q), order }))
    .filter((d) => Number.isFinite(d.score))
    .sort((a, b) => a.score - b.score || a.item.label.length - b.item.label.length || a.order - b.order)
    .map((d) => d.item);
  if (direct.length >= limit || q.length <= 2) return direct.slice(0, limit);

  const fuse = new Fuse(docs, {
    keys: [
      { name: 'label', weight: 3 },
      { name: 'title', weight: 2.5 },
      { name: 'keywords', weight: 2 },
      { name: 'hint', weight: 0.6 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  const have = new Set(direct.map((i) => i.id));
  const fuzzy = fuse
    .search(q, { limit })
    .map((r) => r.item)
    .filter((i) => !have.has(i.id));
  return [...direct, ...fuzzy].slice(0, limit);
}

/** The trail shown in the middle of a sub-ring: "Image › Resize". */
export function trail(stack: RadialItem[]): string {
  return stack.map((i) => i.label).join(' › ');
}
