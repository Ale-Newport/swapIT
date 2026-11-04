import { create } from 'zustand';
import { getSettings, updateSettings, type AppSettings } from './bridge';
import type { OutputSpec } from './types';

const DEFAULTS: AppSettings = {
  binaries: {},
  defaultOutputDir: null,
  outputMode: 'same_dir',
  collision: 'rename',
  preserveMetadata: true,
  jpegQuality: 85,
  webpQuality: 82,
  theme: 'light',
  recentHistory: true,
  clipboardHistory: false,
  notifications: true,
  rememberOutputDir: true,
  openLastTool: true,
  defaultVideoCodec: 'libx264',
  defaultVideoCrf: 23,
  radialEnabled: true,
  radialShortcuts: { radial: 'Control+Alt+Space', note: 'Control+Alt+N', record: 'Control+Alt+R' },
  radialHoldToSelect: true,
  radialDragEnabled: true,
  radialDragModifier: 'alt',
  radialCreateDir: null,
  keepRunning: true,
  menuBarIcon: true,
  showInDock: true,
  menuBarMode: false,
  radialLayouts: {},
  radialOpacity: 0.7,
  radialAccent: '#0a84ff',
  radialTheme: 'auto',
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings> & Record<string, unknown>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  load: async () => {
    try {
      const settings = await getSettings();
      set({ settings: { ...DEFAULTS, ...settings }, loaded: true });
      applyTheme(settings.theme);
    } catch {
      set({ loaded: true });
    }
  },
  update: async (patch) => {
    // Optimistic: the UI should never wait on disk for a toggle.
    set({ settings: { ...get().settings, ...patch } });
    if ('theme' in patch && patch.theme) applyTheme(patch.theme as AppSettings['theme']);
    try {
      const merged = await updateSettings(patch);
      set({ settings: { ...DEFAULTS, ...merged } });
    } catch {
      /* keep the optimistic value; the next load will reconcile */
    }
  },
}));

export function applyTheme(theme: AppSettings['theme']): void {
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.dataset.theme = dark ? 'dark' : 'light';
}

/** Build the OutputSpec a tool should send, seeded from global settings. */
export function defaultOutputSpec(overrides: Partial<OutputSpec> = {}): OutputSpec {
  const { settings } = useSettings.getState();
  return {
    mode: settings.outputMode,
    dir: settings.outputMode === 'custom' ? settings.defaultOutputDir : null,
    suffix: null,
    collision: settings.collision,
    filename: null,
    ...overrides,
  };
}
