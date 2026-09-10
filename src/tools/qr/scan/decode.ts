import jsQR from 'jsqr';

/**
 * Getting a code out of a picture someone took. One clean pass is usually
 * enough; the rest of the ladder is for the photographed-from-across-the-room
 * and white-on-black cases, which are common enough to be worth the milliseconds.
 */

/** Big photos are downscaled first — jsQR gets slower faster than it gets better. */
const MAX_EDGE = 2400;
/** Never allocate more than this many pixels for one attempt. */
const MAX_PIXELS = 30_000_000;

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('That image could not be opened. PNG, JPEG, WebP, GIF and HEIC-converted files all work.'));
    image.src = src;
  });
}

function imageDataAt(image: HTMLImageElement, scale: number): ImageData | null {
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  if (width * height > MAX_PIXELS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // Smoothing helps when shrinking and blurs the modules when growing.
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export async function decodeImageSource(src: string): Promise<string | null> {
  const image = await loadImageElement(src);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  if (!longestEdge) {
    throw new Error('That image has no pixels to read.');
  }
  const base = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1;

  // Straight read first, then bigger for a small or blurry code, then the same
  // two with the colours inverted — white-on-black codes are common on posters.
  //
  // 'invertFirst' rather than 'onlyInvert': jsQR 1.4.0 only prepares the
  // inverted bitmap for 'attemptBoth' and 'invertFirst', so 'onlyInvert' throws
  // a TypeError instead of decoding.
  // Enlarging only helps a code that was small to begin with; doubling a
  // 12-megapixel photo just costs a second per attempt and finds nothing new.
  const worthEnlarging = longestEdge * base < 1000;
  const attempts: Array<{ scale: number; inversion: 'dontInvert' | 'invertFirst' }> = [
    { scale: base, inversion: 'dontInvert' },
    ...(worthEnlarging ? [{ scale: base * 2, inversion: 'dontInvert' as const }] : []),
    { scale: base, inversion: 'invertFirst' },
    ...(worthEnlarging ? [{ scale: base * 2, inversion: 'invertFirst' as const }] : []),
  ];

  for (const attempt of attempts) {
    const data = imageDataAt(image, attempt.scale);
    if (!data) continue;
    try {
      const found = jsQR(data.data, data.width, data.height, { inversionAttempts: attempt.inversion });
      if (found?.data) return found.data;
    } catch {
      // The decoder itself can throw on pathological input; the next pass may
      // still succeed, and "no code found" is the honest answer if none does.
    }
  }
  return null;
}

/** Clipboard images arrive as raw RGBA, so they become a data URL first. */
export function rgbaToDataUrl(rgba: Uint8Array, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This Mac could not open a canvas to read the clipboard image.');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas.toDataURL('image/png');
}
