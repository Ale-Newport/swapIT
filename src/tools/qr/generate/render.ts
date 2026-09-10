import jsQR from 'jsqr';
import { EYE_SIZE, eyeOrigins, gradientVector, isEyeModule, type QrStyle } from './logic';

/**
 * The canvas half of the renderer. It works in module units — one unit is one
 * module, set up by a single transform — so every shape here has the same
 * geometry as the SVG exporter in logic.ts.
 */

export interface LoadedLogo {
  element: CanvasImageSource;
  /** Logo width as a fraction of the code width. */
  ratio: number;
}

export interface DrawParams {
  bits: boolean[][];
  style: QrStyle;
  /** Pixels per module. */
  cell: number;
  /** Force an exact canvas size; the code is centred inside it. */
  canvasSize?: number;
  logo?: LoadedLogo | null;
}

/** `roundRect` is missing on older WebKit, and a QR code is not worth a crash. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * The intrinsic pixel size of whatever the logo was loaded as. `<img>` reports
 * it as `naturalWidth`, a canvas or bitmap as plain `width`, and an SVG element
 * as an `SVGAnimatedLength` we deliberately ignore — an unsized source falls
 * back to filling the square, which is what the old code always did.
 */
function intrinsicSize(source: CanvasImageSource): { width: number; height: number } | null {
  const candidate = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width?: unknown;
    height?: unknown;
  };
  const width =
    candidate.naturalWidth ??
    candidate.videoWidth ??
    (typeof candidate.width === 'number' ? candidate.width : 0);
  const height =
    candidate.naturalHeight ??
    candidate.videoHeight ??
    (typeof candidate.height === 'number' ? candidate.height : 0);
  return width > 0 && height > 0 ? { width, height } : null;
}

function paintStyle(
  ctx: CanvasRenderingContext2D,
  style: QrStyle,
  span: number,
  offset: number,
): string | CanvasGradient {
  if (!style.gradientTo) return style.foreground;
  const v = gradientVector(style.gradientDirection, span);
  const gradient = ctx.createLinearGradient(v.x1 + offset, v.y1 + offset, v.x2 + offset, v.y2 + offset);
  gradient.addColorStop(0, style.foreground);
  gradient.addColorStop(1, style.gradientTo);
  return gradient;
}

/** Draw the code. Returns the canvas edge length in pixels. */
export function drawQr(canvas: HTMLCanvasElement, params: DrawParams): number {
  const { bits, style, cell } = params;
  const size = bits.length;
  const total = size + style.margin * 2;
  const codePx = Math.round(cell * total);
  const dimension = params.canvasSize ?? codePx;

  canvas.width = dimension;
  canvas.height = dimension;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This Mac could not open a drawing canvas for the QR code.');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, dimension, dimension);
  if (!style.transparentBackground) {
    ctx.fillStyle = style.background;
    ctx.fillRect(0, 0, dimension, dimension);
  }

  // One module becomes one unit, so shapes and line widths are written in
  // modules rather than pixels — the same numbers the SVG exporter uses.
  const inset = Math.round((dimension - codePx) / 2);
  ctx.setTransform(cell, 0, 0, cell, inset, inset);

  const paint = paintStyle(ctx, style, size, style.margin);
  ctx.fillStyle = paint;
  ctx.strokeStyle = paint;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';

  const m = style.margin;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!bits[row][col] || isEyeModule(size, row, col)) continue;
      const x = col + m;
      const y = row + m;
      if (style.moduleShape === 'dots') {
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else if (style.moduleShape === 'rounded') {
        roundRectPath(ctx, x, y, 1, 1, 0.32);
        ctx.fill();
      } else {
        // The cell size is always a whole number of pixels, so a plain unit
        // square lands exactly on the pixel grid with no seams and no blur.
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  for (const [row, col] of eyeOrigins(size)) {
    const x = col + m;
    const y = row + m;
    if (style.eyeShape === 'circle') {
      ctx.beginPath();
      ctx.arc(x + 3.5, y + 3.5, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 3.5, y + 3.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (style.eyeShape === 'rounded') {
      roundRectPath(ctx, x + 0.5, y + 0.5, EYE_SIZE - 1, EYE_SIZE - 1, 1.75);
      ctx.stroke();
      roundRectPath(ctx, x + 2, y + 2, 3, 3, 0.75);
      ctx.fill();
    } else {
      ctx.strokeRect(x + 0.5, y + 0.5, EYE_SIZE - 1, EYE_SIZE - 1);
      ctx.fillRect(x + 2, y + 2, 3, 3);
    }
  }

  if (params.logo) {
    const logoSpan = size * params.logo.ratio;
    const pad = Math.max(0.5, logoSpan * 0.08);
    const boxSpan = logoSpan + pad * 2;
    const boxOrigin = m + (size - boxSpan) / 2;
    ctx.fillStyle = style.transparentBackground ? '#ffffff' : style.background;
    roundRectPath(ctx, boxOrigin, boxOrigin, boxSpan, boxSpan, Math.min(1.5, boxSpan / 6));
    ctx.fill();
    // Fit the logo inside the square without distorting it — the same
    // `xMidYMid meet` letterboxing the SVG exporter asks for, so a wide or tall
    // image looks identical in the preview, the PNG, the PDF and the SVG.
    const natural = intrinsicSize(params.logo.element);
    const scale = natural ? Math.min(logoSpan / natural.width, logoSpan / natural.height) : 0;
    const drawWidth = natural ? natural.width * scale : logoSpan;
    const drawHeight = natural ? natural.height * scale : logoSpan;
    const centre = m + size / 2;
    ctx.drawImage(
      params.logo.element,
      centre - drawWidth / 2,
      centre - drawHeight / 2,
      drawWidth,
      drawHeight,
    );
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return dimension;
}

export interface VerifyResult {
  ok: boolean;
  /** What a scanner actually read out of the rendered image. */
  decoded: string | null;
}

/**
 * Read the rendered code back with a real decoder. A logo that is too large, a
 * quiet zone that is too small or two colours that are too close all produce a
 * beautiful image that no phone can read — this is the only honest check.
 */
export function verifyCanvas(canvas: HTMLCanvasElement, background: string): VerifyResult {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return { ok: false, decoded: null };

  // Flatten onto an opaque surface first: a transparent PNG decodes as black on
  // black otherwise, which would fail a code that is perfectly fine in use.
  const flat = document.createElement('canvas');
  flat.width = width;
  flat.height = height;
  const ctx = flat.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ok: false, decoded: null };
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(canvas, 0, 0);

  const image = ctx.getImageData(0, 0, width, height);
  const found = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' });
  return { ok: Boolean(found), decoded: found?.data ?? null };
}

/** Load bytes read from disk into an image element usable by canvas and SVG. */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

export function mimeForExtension(extension: string): string {
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? 'image/png';
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That image could not be read — try a PNG, JPEG or SVG file.'));
    image.src = src;
  });
}
