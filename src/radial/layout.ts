import { RING_SHAPE, WINDOW_SIZE } from './geometry';
import type { RadialLayout } from './model';
import { radialSetLayout } from './native';

/** Margin around cards and the pill: room for the drop shadow, outside the blur mask. */
export const PANEL_INSET = 18;

export function ringLayout(appearance: RadialLayout['appearance'] = 'auto'): RadialLayout {
  return {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    anchor: 'keep',
    shape: RING_SHAPE,
    sticky: false,
    appearance,
  };
}

/** A glass card of the given content size, centred where the ring was. */
export function cardLayout(width: number, height: number, appearance: RadialLayout['appearance'] = 'auto'): RadialLayout {
  return {
    width: width + PANEL_INSET * 2,
    height: height + PANEL_INSET * 2,
    anchor: 'keep',
    shape: { kind: 'rrect', radius: 28, inset: PANEL_INSET },
    sticky: true,
    appearance,
  };
}

/** The progress pill, parked under the menu bar. */
export function hudLayout(height: number, appearance: RadialLayout['appearance'] = 'auto'): RadialLayout {
  return {
    width: 400 + PANEL_INSET * 2,
    height: height + PANEL_INSET * 2,
    anchor: 'top',
    shape: { kind: 'rrect', radius: height > 100 ? 26 : 32, inset: PANEL_INSET },
    sticky: true,
    appearance,
  };
}

let current: RadialLayout | null = null;

function same(a: RadialLayout, b: RadialLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Send a layout to the native side unless it is already in force. */
export async function applyLayout(next: RadialLayout): Promise<void> {
  if (current && same(current, next)) return;
  current = next;
  try {
    await radialSetLayout(next);
  } catch (err) {
    current = null;
    throw err;
  }
}

/** Record a layout as already in force, so the first `applyLayout` of the same one costs no round trip. */
export function assumeLayout(layout: RadialLayout): void {
  current = layout;
}

/** The native side resets to the ring on every show; forget what we last sent. */
export function forgetLayout(): void {
  current = null;
}

export function currentLayout(): RadialLayout | null {
  return current;
}
