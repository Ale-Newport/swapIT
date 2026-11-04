import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { call } from '@/core/bridge';
import type { RadialLayout, RadialOpenPayload, RadialStatus, Trigger } from './model';
import type { WatchEvent } from './watch';

/** True inside the Tauri webview; false when the UI is opened in a plain browser. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** The label of the window this code runs in ('main' | 'radial'), synchronously. */
export function currentWindowLabel(): string {
  if (typeof window === 'undefined') return 'main';
  const meta = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
    .__TAURI_INTERNALS__?.metadata?.currentWindow;
  if (meta?.label) return meta.label;
  // Browser preview: `#/radial-demo` or `?radial` stands in for the overlay.
  if (/^#\/radial-demo/.test(window.location.hash) || /[?&]radial-demo/.test(window.location.search)) return 'radial';
  return 'main';
}

// ------------------------------------------------------------------ commands

export interface ShowArgs {
  paths?: string[];
  folder?: string | null;
  trigger?: Trigger;
  intent?: string;
  at?: { x: number; y: number } | null;
}

export const radialShow = (args: ShowArgs) => call<void>('radial_show', { args });
/** The overlay has painted this session; until now the native window is kept transparent. */
export const radialReady = (session: number) => call<void>('radial_ready', { session });
export const radialHide = (restoreFocus = true) => call<void>('radial_hide', { restoreFocus });
export const radialReleaseFocus = () => call<void>('radial_release_focus');
export const radialSetLayout = (layout: RadialLayout) => call<void>('radial_set_layout', { layout });
export const radialStatus = () => call<RadialStatus>('radial_status');
/** The ring that is currently up, for a webview that mounted after `radial://open` fired. */
export const radialLastOpen = () => call<RadialOpenPayload | null>('radial_last_open');
export const installFinderAction = () => call<string>('install_finder_action');
export const uninstallFinderAction = () => call<void>('uninstall_finder_action');
export const openInMain = (route: string, files?: string[]) => call<void>('open_in_main', { route, files });
export const openPrivacyPane = (pane: 'automation' | 'microphone' | 'accessibility' | 'files') =>
  call<void>('open_privacy_pane', { pane });
export const requestAutomationPermission = () => call<'granted' | 'denied'>('request_automation_permission');

// -------------------------------------------------------------------- events

export const onRadialOpen = (fn: (payload: RadialOpenPayload) => void): Promise<UnlistenFn> =>
  listen<RadialOpenPayload>('radial://open', (e) => fn(e.payload));
export const onRadialReleased = (fn: () => void): Promise<UnlistenFn> => listen('radial://released', () => fn());
export const onRadialHidden = (fn: () => void): Promise<UnlistenFn> => listen('radial://hidden', () => fn());
export const onRadialDragEnded = (fn: () => void): Promise<UnlistenFn> =>
  listen('radial://drag-ended', () => fn());

export const onRadialWatch = (fn: (payload: WatchEvent) => void): Promise<UnlistenFn> =>
  listen<WatchEvent>('radial://watch', (e) => fn(e.payload));

export interface NavigatePayload {
  route: string;
  files?: string[];
}
export const onAppNavigate = (fn: (payload: NavigatePayload) => void): Promise<UnlistenFn> =>
  listen<NavigatePayload>('app://navigate', (e) => fn(e.payload));

/** Used by the dev preview to drive the overlay without the native side. */
export const emitRadialOpen = (payload: RadialOpenPayload) => emit('radial://open', payload);
