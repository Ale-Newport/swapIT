export interface Point {
  x: number;
  y: number;
}

/**
 * Tauri labels drag-and-drop positions "physical", but on macOS wry hands over
 * AppKit *points* — already CSS pixels. Everywhere else they are real device
 * pixels. Dividing the macOS ones by the pixel ratio would halve every
 * coordinate on a Retina screen and aim at the wrong place.
 */
export function cssPointFromDrop(position: Point, pixelRatio: number, isMac: boolean): Point {
  const ratio = isMac || !pixelRatio ? 1 : pixelRatio;
  return { x: position.x / ratio, y: position.y / ratio };
}

export function isMacWebview(): boolean {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '');
}

/** The drop position in CSS pixels relative to the webview, whatever the platform. */
export function dropPoint(position: Point): Point {
  return cssPointFromDrop(position, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, isMacWebview());
}
