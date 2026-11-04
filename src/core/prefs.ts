import { create } from 'zustand';

const FAVORITES_KEY = 'toolbox.favorites';
const RECENT_KEY = 'toolbox.recent';
const USAGE_KEY = 'toolbox.usage';
const HISTORY_KEY = 'toolbox.history';
const ONBOARDED_KEY = 'toolbox.onboarded';
const OUTPUT_DIR_KEY = 'toolbox.lastOutputDir';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — preferences are a convenience, not a requirement */
  }
}

export interface HistoryEntry {
  id: string;
  toolId: string;
  toolName: string;
  at: number;
  /** File *names* only — never contents. */
  inputs: string[];
  outputDir: string | null;
  outputCount: number;
}

interface PrefsState {
  favorites: string[];
  recent: string[];
  usage: Record<string, number>;
  history: HistoryEntry[];
  onboarded: boolean;
  lastOutputDir: string | null;
  toggleFavorite: (toolId: string) => void;
  isFavorite: (toolId: string) => boolean;
  markUsed: (toolId: string) => void;
  addHistory: (entry: Omit<HistoryEntry, 'id' | 'at'>) => void;
  clearHistory: () => void;
  clearRecent: () => void;
  setOnboarded: (v: boolean) => void;
  setLastOutputDir: (dir: string | null) => void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  favorites: read<string[]>(FAVORITES_KEY, []),
  recent: read<string[]>(RECENT_KEY, []),
  usage: read<Record<string, number>>(USAGE_KEY, {}),
  history: read<HistoryEntry[]>(HISTORY_KEY, []),
  onboarded: read<boolean>(ONBOARDED_KEY, false),
  lastOutputDir: read<string | null>(OUTPUT_DIR_KEY, null),

  toggleFavorite: (toolId) => {
    const next = get().favorites.includes(toolId)
      ? get().favorites.filter((id) => id !== toolId)
      : [...get().favorites, toolId];
    write(FAVORITES_KEY, next);
    set({ favorites: next });
  },
  isFavorite: (toolId) => get().favorites.includes(toolId),

  markUsed: (toolId) => {
    const recent = [toolId, ...get().recent.filter((id) => id !== toolId)].slice(0, 24);
    const usage = { ...get().usage, [toolId]: (get().usage[toolId] ?? 0) + 1 };
    write(RECENT_KEY, recent);
    write(USAGE_KEY, usage);
    set({ recent, usage });
  },

  addHistory: (entry) => {
    const item: HistoryEntry = {
      ...entry,
      id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
    };
    const history = [item, ...get().history].slice(0, 300);
    write(HISTORY_KEY, history);
    set({ history });
  },
  clearHistory: () => {
    write(HISTORY_KEY, []);
    set({ history: [] });
  },
  clearRecent: () => {
    write(RECENT_KEY, []);
    write(USAGE_KEY, {});
    set({ recent: [], usage: {} });
  },
  setOnboarded: (v) => {
    write(ONBOARDED_KEY, v);
    set({ onboarded: v });
  },
  setLastOutputDir: (dir) => {
    write(OUTPUT_DIR_KEY, dir);
    set({ lastOutputDir: dir });
  },
}));

export function popularToolIds(usage: Record<string, number>, limit = 8): string[] {
  return Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

// The radial overlay is a second webview on the same origin. When it records a
// job or a recent tool, the main window learns about it through the storage event.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('toolbox.')) return;
    usePrefs.setState({
      favorites: read<string[]>(FAVORITES_KEY, []),
      recent: read<string[]>(RECENT_KEY, []),
      usage: read<Record<string, number>>(USAGE_KEY, {}),
      history: read<HistoryEntry[]>(HISTORY_KEY, []),
      onboarded: read<boolean>(ONBOARDED_KEY, false),
      lastOutputDir: read<string | null>(OUTPUT_DIR_KEY, null),
    });
  });
}
