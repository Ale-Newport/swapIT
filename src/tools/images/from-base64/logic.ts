export interface DecodedImage {
  bytes: Uint8Array;
  mime: string;
  /** Extension without a dot, used for the suggested filename. */
  extension: string;
  /** How the format was worked out, so the UI can say so honestly. */
  detectedFrom: 'signature' | 'data-url';
  /** A canonical data URL for the preview. */
  dataUrl: string;
}

interface Signature {
  mime: string;
  extension: string;
  test: (bytes: Uint8Array) => boolean;
}

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.slice(start, start + length));

const startsWith = (bytes: Uint8Array, expected: number[]): boolean =>
  bytes.length >= expected.length && expected.every((byte, i) => bytes[i] === byte);

const HEIF_BRANDS: Record<string, { mime: string; extension: string }> = {
  avif: { mime: 'image/avif', extension: 'avif' },
  avis: { mime: 'image/avif', extension: 'avif' },
  heic: { mime: 'image/heic', extension: 'heic' },
  heix: { mime: 'image/heic', extension: 'heic' },
  hevc: { mime: 'image/heic', extension: 'heic' },
  mif1: { mime: 'image/heif', extension: 'heif' },
  msf1: { mime: 'image/heif', extension: 'heif' },
};

const SIGNATURES: Signature[] = [
  { mime: 'image/png', extension: 'png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', extension: 'jpg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { mime: 'image/gif', extension: 'gif', test: (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a' },
  { mime: 'image/webp', extension: 'webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  { mime: 'image/bmp', extension: 'bmp', test: (b) => ascii(b, 0, 2) === 'BM' },
  {
    mime: 'image/tiff',
    extension: 'tiff',
    test: (b) => startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]),
  },
  { mime: 'image/x-icon', extension: 'ico', test: (b) => startsWith(b, [0x00, 0x00, 0x01, 0x00]) },
  {
    mime: 'image/svg+xml',
    extension: 'svg',
    test: (b) => {
      const head = ascii(b, 0, 300).trimStart().toLowerCase();
      return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
    },
  },
];

/** PNG, JPEG, GIF … from the first bytes — never from a file name we do not have. */
export function detectFormat(bytes: Uint8Array): { mime: string; extension: string } | null {
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = HEIF_BRANDS[ascii(bytes, 8, 4).toLowerCase()];
    if (brand) return brand;
  }
  for (const signature of SIGNATURES) {
    if (signature.test(bytes)) return { mime: signature.mime, extension: signature.extension };
  }
  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(payload: string): Uint8Array {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whitespace, URL-safe alphabet and missing padding are all fair game in pasted text. */
export function normalizeBase64(raw: string): string {
  const clean = raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!clean) throw new Error('There is nothing to decode — paste a Base64 string or a data URL first.');
  if (!/^[A-Za-z0-9+/]+$/.test(clean)) {
    throw new Error(
      'That text is not valid Base64 — it contains characters Base64 never uses. Paste the encoded string on its own, or a complete data: URL.',
    );
  }
  if (clean.length % 4 === 1) {
    throw new Error('That Base64 string is cut short — the last character is missing its group. Copy the whole string and try again.');
  }
  return clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '=');
}

/**
 * Turn pasted text — a data URL or a bare Base64 blob — into image bytes plus the
 * format they actually are. Throws a sentence a person can act on.
 */
export function decodeImageData(input: string): DecodedImage {
  const text = input.trim();
  if (!text) throw new Error('There is nothing to decode — paste a Base64 string or a data URL first.');

  const dataUrl = /^data:([^;,]*)((?:;[^,]*)*),(.*)$/s.exec(text);
  let declaredMime: string | null = null;
  let bytes: Uint8Array;

  if (dataUrl) {
    declaredMime = dataUrl[1] || null;
    const isBase64 = /;\s*base64/i.test(dataUrl[2] ?? '');
    if (isBase64) {
      bytes = base64ToBytes(normalizeBase64(dataUrl[3]));
    } else {
      // `data:image/svg+xml,<svg …>` — percent-encoded text rather than Base64.
      try {
        bytes = new TextEncoder().encode(decodeURIComponent(dataUrl[3]));
      } catch {
        throw new Error('That data URL is not percent-encoded correctly, so it could not be decoded.');
      }
    }
  } else {
    bytes = base64ToBytes(normalizeBase64(text));
  }

  if (bytes.length === 0) throw new Error('That string decoded to zero bytes — there is no image in it.');

  const detected = detectFormat(bytes);
  if (!detected && !declaredMime?.startsWith('image/')) {
    throw new Error(
      'The text decoded, but the result is not an image Toolbox recognises. PNG, JPEG, GIF, WebP, BMP, TIFF, ICO, AVIF, HEIC and SVG are supported.',
    );
  }
  const mime = detected?.mime ?? declaredMime!;
  const extension = detected?.extension ?? mimeExtension(mime);

  return {
    bytes,
    mime,
    extension,
    detectedFrom: detected ? 'signature' : 'data-url',
    dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
  };
}

function mimeExtension(mime: string): string {
  const subtype = mime.split('/')[1] ?? 'bin';
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'svg+xml') return 'svg';
  if (subtype === 'x-icon' || subtype === 'vnd.microsoft.icon') return 'ico';
  return subtype.replace(/[^a-z0-9]/gi, '') || 'bin';
}

export function suggestedFilename(extension: string): string {
  return `image.${extension}`;
}
