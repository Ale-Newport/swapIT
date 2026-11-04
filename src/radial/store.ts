import { create } from 'zustand';
import type { FileInfo, ToolboxError } from '@/core/types';
import type { ActionResult, CardSpec, RadialItem, RadialOpenPayload } from './model';

export type Phase = 'idle' | 'loading' | 'ring' | 'card' | 'hud';

export interface HudState {
  status: 'working' | 'done' | 'error';
  title: string;
  detail?: string;
  /** Task id in the task store, for live progress and cancel. */
  taskId?: string;
  result?: ActionResult;
  error?: ToolboxError;
  /** Programs that would fix the error, with the command to install them. */
  fix?: { label: string; command: string };
}

interface RadialState {
  phase: Phase;
  closing: boolean;
  session: RadialOpenPayload | null;
  files: FileInfo[];
  folder: string | null;
  /** The first ring: what you most likely want for this selection. */
  root: RadialItem[];
  /** Everything reachable by typing, including actions no ring shows. */
  pool: RadialItem[];
  /** The sub-rings opened so far, outermost first. Empty means the first ring. */
  stack: RadialItem[];
  hover: number | null;
  pressed: boolean;
  dragging: boolean;
  query: string;
  card: CardSpec | null;
  hud: HudState | null;
  openedAt: number;
  /** Shown when macOS has not let Toolbox talk to Finder. */
  permissionNote: string | null;

  patch: (patch: Partial<RadialState>) => void;
  reset: () => void;
}

const INITIAL = {
  phase: 'idle' as Phase,
  closing: false,
  session: null,
  files: [] as FileInfo[],
  folder: null,
  root: [] as RadialItem[],
  pool: [] as RadialItem[],
  stack: [] as RadialItem[],
  hover: null,
  pressed: false,
  dragging: false,
  query: '',
  card: null,
  hud: null,
  openedAt: 0,
  permissionNote: null,
};

export const useRadial = create<RadialState>((set) => ({
  ...INITIAL,
  patch: (patch) => set(patch),
  reset: () => set({ ...INITIAL }),
}));

export const radial = {
  get: () => useRadial.getState(),
  patch: (patch: Partial<RadialState>) => useRadial.getState().patch(patch),
};
