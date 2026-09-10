/**
 * The clipboard list itself: what gets recorded, what gets dropped, and how it
 * survives a restart. Kept away from React so the trimming rules can be tested.
 *
 * Everything here is local. The list lives in this app's own localStorage on
 * this Mac and is never sent anywhere.
 */

export interface ClipEntry {
  id: string;
  text: string;
  /** When this text was last seen on the clipboard. */
  at: number;
  pinned: boolean;
}

export const STORAGE_KEY = 'toolbox.clipboardHistory';

/** How many copies are remembered. */
export const MAX_ENTRIES = 100;

/**
 * A ceiling on the characters kept in total, so a few enormous copies cannot
 * fill the browser storage quota and lose the whole list.
 */
export const MAX_TOTAL_CHARS = 400_000;

/**
 * Fold a clipboard reading into the list.
 *
 * Blank readings are ignored, an unchanged clipboard records nothing, and text
 * that is already in the list moves back to the top keeping its pin.
 */
export function recordEntry(entries: ClipEntry[], text: string, now: number, id: string): ClipEntry[] {
  if (!text.trim()) return entries;
  if (entries[0]?.text === text) return entries;
  const existing = entries.find((e) => e.text === text);
  const rest = entries.filter((e) => e.text !== text);
  const entry: ClipEntry = existing
    ? { ...existing, at: now }
    : { id, text, at: now, pinned: false };
  return trimEntries([entry, ...rest]);
}

/** Enforce the count and size ceilings, dropping the oldest unpinned entries first. */
export function trimEntries(entries: ClipEntry[]): ClipEntry[] {
  const list = [...entries];
  const total = () => list.reduce((sum, e) => sum + e.text.length, 0);
  while (list.length > MAX_ENTRIES || (list.length > 1 && total() > MAX_TOTAL_CHARS)) {
    let index = -1;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (!list[i].pinned) {
        index = i;
        break;
      }
    }
    // Only pinned entries left: honour the pins and stop trimming.
    if (index === -1) break;
    list.splice(index, 1);
  }
  return list;
}

/** Pinned entries first, then most recent — the order the list is displayed in. */
export function sortForDisplay(entries: ClipEntry[]): ClipEntry[] {
  return [...entries].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at);
}

export function filterEntries(entries: ClipEntry[], query: string): ClipEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.text.toLowerCase().includes(q));
}

export interface TextFacts {
  characters: number;
  words: number;
  lines: number;
}

export function describeText(text: string): TextFacts {
  return {
    characters: text.length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    lines: text.split('\n').length,
  };
}

/** A few lines at most, so one giant copy cannot push everything off the screen. */
export function previewOf(text: string, maxLines = 4, maxChars = 320): { preview: string; truncated: boolean } {
  const lines = text.split('\n');
  let preview = lines.slice(0, maxLines).join('\n');
  let truncated = lines.length > maxLines;
  if (preview.length > maxChars) {
    preview = preview.slice(0, maxChars);
    truncated = true;
  }
  return { preview: preview.replace(/\s+$/, ''), truncated };
}

/** Read the stored list defensively — a corrupt value must never break the tool. */
export function parseStored(raw: string | null): ClipEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: ClipEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      if (typeof record.text !== 'string' || !record.text) continue;
      entries.push({
        id: typeof record.id === 'string' && record.id ? record.id : `clip_${entries.length}_${String(record.at ?? 0)}`,
        text: record.text,
        at: typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now(),
        pinned: record.pinned === true,
      });
    }
    return trimEntries(entries);
  } catch {
    return [];
  }
}
