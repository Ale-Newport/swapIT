/**
 * The arithmetic and naming behind saving a clipboard image, kept out of the
 * canvas code so both can be reasoned about separately.
 */

export interface Size {
  width: number;
  height: number;
}

export const MIN_WIDTH = 16;
export const MAX_WIDTH = 10_000;

/** The size an image becomes when its width is set to `targetWidth`, aspect kept. */
export function scaledSize(size: Size, targetWidth: number | null): Size {
  if (!targetWidth || size.width <= 0 || size.height <= 0) return size;
  const width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, targetWidth)));
  const height = Math.max(1, Math.round((size.height * width) / size.width));
  return { width, height };
}

/** Roughly how many pixels are being written, for the "this is a big one" hint. */
export function megapixels(size: Size): number {
  return (size.width * size.height) / 1_000_000;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** "Clipboard 2026-09-10 at 14.05.09.png" — the shape macOS uses for screenshots. */
export function suggestImageName(at: Date, extension: 'png' | 'jpg'): string {
  const date = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  const time = `${two(at.getHours())}.${two(at.getMinutes())}.${two(at.getSeconds())}`;
  return `Clipboard ${date} at ${time}.${extension}`;
}
