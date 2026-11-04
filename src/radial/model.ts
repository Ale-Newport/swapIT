import type { AppSettings } from '@/core/bridge';
import type { BatchResult, BinaryId, FileInfo, FileResult, OutputSpec } from '@/core/types';

// ------------------------------------------------------------------ native contract
// Mirrors docs/RADIAL.md — keep the two in sync.

export type Trigger =
  | 'hotkey'
  | 'drag'
  | 'open-with'
  | 'app'
  | 'tray'
  | 'service'
  | 'url'
  | 'note-hotkey'
  | 'record-hotkey';

export interface RadialOpenPayload {
  id: number;
  trigger: Trigger;
  intent: string;
  paths: string[];
  folder: string | null;
  frontApp: { name: string; bundleId: string } | null;
  holdKey: boolean;
  permission: 'automation_denied' | null;
  cursor: { x: number; y: number };
}

export type NativeShape =
  | { kind: 'ring'; outer: number; inner: number; core: number }
  | { kind: 'rrect'; radius: number; inset?: number }
  | { kind: 'none' };

export interface RadialLayout {
  width: number;
  height: number;
  anchor: 'cursor' | 'keep' | 'top' | 'center';
  shape: NativeShape;
  sticky: boolean;
  appearance?: 'auto' | 'light' | 'dark';
}

export interface ShortcutStatus {
  accelerator: string;
  registered: boolean;
  error: string | null;
}

export interface RadialStatus {
  shortcuts: Record<'radial' | 'note' | 'record', ShortcutStatus>;
  drag: { enabled: boolean; running: boolean; modifier: string };
  finderAction: { installed: boolean; path: string };
  automation: 'granted' | 'denied' | 'unknown';
  tray: boolean;
  version: string;
}

// ------------------------------------------------------------------ catalogue model

export interface HudAction {
  id: string;
  label: string;
  icon: string;
  primary?: boolean;
  run: () => void | Promise<void>;
}

/** What an action reports back for the progress pill. */
export interface ActionResult {
  title?: string;
  detail?: string;
  results?: FileResult[];
  actions?: HudAction[];
  /** Text copied to the clipboard, shown as a snippet. */
  snippet?: string;
}

export type CardSpec = { kind: 'new-file'; type: string } | { kind: 'recorder' };

export interface JobPlan {
  command: string;
  args: Record<string, unknown>;
  label: string;
  total?: number;
}

/** Everything an item needs to do its job. */
export interface ActionCtx {
  files: FileInfo[];
  paths: string[];
  folder: string | null;
  bins: Partial<Record<BinaryId, boolean>>;
  settings: AppSettings;
  /** The user's default output policy, optionally with a suffix. */
  output: (overrides?: Partial<OutputSpec>) => OutputSpec;
  /** Run one backend command as a tracked task (progress shows in the pill). */
  job: (plan: JobPlan) => Promise<BatchResult>;
  /** Run several in order and merge their results. */
  jobs: (plans: JobPlan[]) => Promise<BatchResult>;
  /** Run a command that returns data rather than files (OCR, hashes, palettes…). */
  data: <T>(plan: JobPlan) => Promise<T>;
  /** Replace the pill's headline while a long action works. */
  status: (message: string) => void;
  openCard: (card: CardSpec) => void;
  /**
   * Keep the ring on screen while a native dialog (folder picker…) has focus —
   * otherwise losing focus would dismiss it, and the result with it.
   */
  modal: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Hide the ring and open a route in the main window. */
  openMain: (route: string, files?: string[]) => Promise<void>;
  close: () => void;
}

export interface RadialItem {
  id: string;
  /** Short, on the petal (≤ 12 characters). */
  label: string;
  /** Longer, in the core while hovered. */
  title: string;
  /** Second line in the core. */
  hint?: string;
  icon: string;
  /** Short text drawn in place of the icon — a format badge such as "PNG". */
  glyph?: string;
  keywords?: string[];
  tone?: 'default' | 'danger' | 'accent';
  /** Why this cannot run right now (missing program…). Shown dimmed. */
  unavailable?: string;
  /** Programs this item needs; used to offer the install command on failure. */
  needs?: BinaryId[];
  /**
   * A petal that opens a smaller ring instead of doing something. Never more than six
   * children; anything beyond that goes one level further down.
   */
  children?: RadialItem[];
  /** `ui` items open a card or another window and skip the progress pill. */
  mode: 'task' | 'ui';
  run: (ctx: ActionCtx) => Promise<ActionResult | BatchResult | void>;
}
