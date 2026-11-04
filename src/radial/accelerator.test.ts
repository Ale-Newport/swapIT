import { describe, expect, it } from 'vitest';
import { acceleratorParts, captureAccelerator, formatAccelerator, isValidAccelerator, keyFromCode } from './accelerator';

const press = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) =>
  captureAccelerator({ code, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.meta });

describe('keyFromCode', () => {
  it('maps letters, digits and function keys', () => {
    expect(keyFromCode('KeyN')).toBe('N');
    expect(keyFromCode('Digit7')).toBe('7');
    expect(keyFromCode('F12')).toBe('F12');
    expect(keyFromCode('Space')).toBe('Space');
  });

  it('rejects keys that cannot be shortcuts', () => {
    expect(keyFromCode('ShiftLeft')).toBeNull();
    expect(keyFromCode('NumpadEnter')).toBeNull();
    expect(keyFromCode('F99')).toBeNull();
  });
});

describe('captureAccelerator', () => {
  it('waits while only modifiers are down', () => {
    expect(press('ControlLeft', { ctrl: true })).toEqual({ kind: 'incomplete' });
    expect(press('MetaRight', { meta: true })).toEqual({ kind: 'incomplete' });
  });

  it('builds the default shortcut', () => {
    expect(press('Space', { ctrl: true, alt: true })).toEqual({ kind: 'ok', accelerator: 'Control+Alt+Space' });
  });

  it('keeps modifiers in a stable order', () => {
    expect(press('KeyK', { meta: true, shift: true, ctrl: true })).toEqual({
      kind: 'ok',
      accelerator: 'Control+Shift+Command+K',
    });
  });

  it('refuses a bare key and a lone Shift', () => {
    expect(press('KeyA').kind).toBe('invalid');
    expect(press('KeyA', { shift: true }).kind).toBe('invalid');
  });

  it('refuses system-owned combinations', () => {
    expect(press('KeyC', { meta: true }).kind).toBe('invalid');
    expect(press('Space', { meta: true }).kind).toBe('invalid');
    expect(press('KeyC', { meta: true, alt: true }).kind).toBe('ok');
  });
});

describe('formatting', () => {
  it('uses Mac symbols', () => {
    expect(formatAccelerator('Control+Alt+Space')).toBe('⌃⌥Space');
    expect(formatAccelerator('Command+Shift+K')).toBe('⌘⇧K');
    expect(acceleratorParts('Control+Alt+N')).toEqual(['⌃', '⌥', 'N']);
    expect(formatAccelerator('')).toBe('');
  });
});

describe('isValidAccelerator', () => {
  it('accepts what it generates and nothing else', () => {
    expect(isValidAccelerator('Control+Alt+Space')).toBe(true);
    expect(isValidAccelerator('Control+Alt+N')).toBe(true);
    expect(isValidAccelerator('Space')).toBe(false);
    expect(isValidAccelerator('Hyper+K')).toBe(false);
    expect(isValidAccelerator('')).toBe(false);
  });
});
