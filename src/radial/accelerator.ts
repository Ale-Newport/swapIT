/**
 * Global-shortcut accelerators in the syntax Tauri's global-shortcut plugin
 * parses ("Control+Alt+Space"), built from DOM keyboard events and shown with
 * the symbols a Mac user expects (⌃⌥Space).
 */

export const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Command'] as const;

const SYMBOL: Record<string, string> = {
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Command: '⌘',
  Space: 'Space',
  Enter: '↩',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '−',
  Equal: '=',
  PageUp: '⇞',
  PageDown: '⇟',
  Home: '↖',
  End: '↘',
};

/** The key part of an accelerator for a DOM `code`, or null for keys that cannot be a shortcut. */
export function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const named = [
    'Space', 'Enter', 'Tab', 'Backspace', 'Delete', 'Escape',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'Backquote',
    'BracketLeft', 'BracketRight', 'Backslash', 'Minus', 'Equal',
    'PageUp', 'PageDown', 'Home', 'End', 'Insert',
  ];
  if (named.includes(code)) return code;
  return null;
}

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type Captured =
  | { kind: 'incomplete' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'ok'; accelerator: string };

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)$/;

/** Turn a key press into an accelerator, explaining why it cannot be one. */
export function captureAccelerator(e: KeyLike): Captured {
  if (MODIFIER_CODES.test(e.code)) return { kind: 'incomplete' };
  const key = keyFromCode(e.code);
  if (!key) return { kind: 'invalid', reason: 'That key cannot be used in a shortcut.' };
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Command');
  if (mods.length === 0) return { kind: 'invalid', reason: 'Hold ⌃, ⌥ or ⌘ as well — a bare key would break typing everywhere.' };
  if (mods.length === 1 && mods[0] === 'Shift') {
    return { kind: 'invalid', reason: 'Shift alone is not enough — add ⌃, ⌥ or ⌘.' };
  }
  if (e.metaKey && !e.ctrlKey && !e.altKey && ['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyA', 'KeyS', 'KeyQ', 'KeyW', 'Space', 'Tab'].includes(e.code)) {
    return { kind: 'invalid', reason: 'macOS already uses that one. Try adding ⌃ or ⌥.' };
  }
  return { kind: 'ok', accelerator: [...mods, key].join('+') };
}

/** `Control+Alt+Space` → `⌃⌥Space`. */
export function formatAccelerator(accelerator: string): string {
  if (!accelerator) return '';
  return accelerator
    .split('+')
    .map((part) => SYMBOL[part] ?? part.toUpperCase())
    .join('');
}

/** The pieces of an accelerator, one per key cap, for drawing `<kbd>` badges. */
export function acceleratorParts(accelerator: string): string[] {
  if (!accelerator) return [];
  return accelerator.split('+').map((part) => SYMBOL[part] ?? part.toUpperCase());
}

export function isValidAccelerator(accelerator: string): boolean {
  if (!accelerator) return false;
  const parts = accelerator.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (mods.length === 0) return false;
  if (!mods.every((m) => (MODIFIER_ORDER as readonly string[]).includes(m))) return false;
  return keyFromCode(/^[A-Z]$/.test(key) ? `Key${key}` : /^[0-9]$/.test(key) ? `Digit${key}` : key) !== null;
}

export const DEFAULT_SHORTCUTS = {
  radial: 'Control+Alt+Space',
  note: 'Control+Alt+N',
  record: 'Control+Alt+R',
} as const;

export type ShortcutId = keyof typeof DEFAULT_SHORTCUTS;
