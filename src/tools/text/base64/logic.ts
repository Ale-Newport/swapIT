/**
 * Base64 that survives real text. `btoa` only speaks Latin-1 and throws on
 * anything above U+00FF, so every conversion here goes through UTF-8 bytes:
 * text → TextEncoder → bytes → base64, and back.
 */

export const WRAP_WIDTH = 76;

const STANDARD_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;

/** Bytes → base64, chunked so a multi-megabyte buffer does not blow the stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Base64 (already normalised and validated) → bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Standard base64 → the URL-safe alphabet, with padding dropped. */
export function toUrlSafe(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function wrapLines(text: string, width = WRAP_WIDTH): string {
  if (width <= 0 || text.length <= width) return text;
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join('\n');
}

export interface EncodeOptions {
  urlSafe?: boolean;
  wrap?: boolean;
  width?: number;
}

export function encodeText(text: string, options: EncodeOptions = {}): string {
  const bytes = new TextEncoder().encode(text);
  const base = bytesToBase64(bytes);
  const alphabet = options.urlSafe ? toUrlSafe(base) : base;
  return options.wrap ? wrapLines(alphabet, options.width ?? WRAP_WIDTH) : alphabet;
}

/**
 * Everything a pasted blob might carry: a `data:` prefix, hard line breaks, the
 * URL-safe alphabet, and missing padding. All of it is accepted — being strict
 * here only makes the tool annoying.
 */
export function normalizeBase64(input: string): string {
  const withoutPrefix = input.replace(/^\s*data:[^;,]*(;[^;,]*)*;base64,/i, '');
  return withoutPrefix.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
}

/**
 * Decode to raw bytes, explaining exactly what is wrong when it fails rather
 * than letting `atob` throw "InvalidCharacterError".
 */
export function decodeToBytes(input: string): Uint8Array {
  const cleaned = normalizeBase64(input);
  if (!cleaned) return new Uint8Array(0);

  const body = cleaned.replace(/=+$/, '');
  const badIndex = body.search(/[^A-Za-z0-9+/]/);
  if (badIndex !== -1) {
    const char = body[badIndex];
    const label = char === '=' ? '“=” padding in the middle' : `“${char}”`;
    throw new Error(
      `${label} at character ${badIndex + 1} is not valid base64. Base64 uses A–Z, a–z, 0–9, + and / — or - and _ in the URL-safe variant — with = padding only at the very end.`,
    );
  }
  if (!STANDARD_ALPHABET.test(cleaned)) {
    throw new Error('This text has more than two “=” padding characters at the end, which base64 never produces.');
  }
  if (body.length % 4 === 1) {
    throw new Error(
      `This is ${body.length.toLocaleString()} characters long. Base64 turns every 3 bytes into 4 characters, so a leftover block of 1 character cannot exist — the text is probably truncated or a character is missing.`,
    );
  }

  const padded = body + '='.repeat((4 - (body.length % 4)) % 4);
  try {
    return base64ToBytes(padded);
  } catch {
    throw new Error('This text is not valid base64 and could not be decoded.');
  }
}

/** Bytes → text, refusing to hand back mojibake when the bytes are not UTF-8. */
export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export interface DecodeResult {
  bytes: Uint8Array;
  /** Null when the bytes are not valid UTF-8 text — binary, in other words. */
  text: string | null;
  sniffed: Sniffed | null;
}

export function decodeInput(input: string): DecodeResult {
  const bytes = decodeToBytes(input);
  let text: string | null = null;
  try {
    text = bytesToText(bytes);
  } catch {
    text = null;
  }
  return { bytes, text, sniffed: sniffBytes(bytes) };
}

export interface Sniffed {
  ext: string;
  label: string;
}

const MAGIC: Array<{ ext: string; label: string; test: (b: Uint8Array) => boolean }> = [
  { ext: 'png', label: 'PNG image', test: (b) => match(b, [0x89, 0x50, 0x4e, 0x47]) },
  { ext: 'jpg', label: 'JPEG image', test: (b) => match(b, [0xff, 0xd8, 0xff]) },
  { ext: 'gif', label: 'GIF image', test: (b) => match(b, [0x47, 0x49, 0x46, 0x38]) },
  { ext: 'bmp', label: 'BMP image', test: (b) => match(b, [0x42, 0x4d]) },
  { ext: 'webp', label: 'WebP image', test: (b) => match(b, [0x52, 0x49, 0x46, 0x46]) && match(b, [0x57, 0x45, 0x42, 0x50], 8) },
  { ext: 'wav', label: 'WAV audio', test: (b) => match(b, [0x52, 0x49, 0x46, 0x46]) && match(b, [0x57, 0x41, 0x56, 0x45], 8) },
  { ext: 'tiff', label: 'TIFF image', test: (b) => match(b, [0x49, 0x49, 0x2a, 0x00]) || match(b, [0x4d, 0x4d, 0x00, 0x2a]) },
  { ext: 'pdf', label: 'PDF document', test: (b) => match(b, [0x25, 0x50, 0x44, 0x46]) },
  { ext: 'zip', label: 'ZIP archive (also .docx, .xlsx, .pptx)', test: (b) => match(b, [0x50, 0x4b, 0x03, 0x04]) },
  { ext: 'gz', label: 'gzip archive', test: (b) => match(b, [0x1f, 0x8b]) },
  { ext: 'mp3', label: 'MP3 audio', test: (b) => match(b, [0x49, 0x44, 0x33]) || match(b, [0xff, 0xfb]) },
  { ext: 'ogg', label: 'Ogg audio', test: (b) => match(b, [0x4f, 0x67, 0x67, 0x53]) },
  { ext: 'flac', label: 'FLAC audio', test: (b) => match(b, [0x66, 0x4c, 0x61, 0x43]) },
  { ext: 'mp4', label: 'MP4 video', test: (b) => match(b, [0x66, 0x74, 0x79, 0x70], 4) },
  { ext: 'woff2', label: 'WOFF2 font', test: (b) => match(b, [0x77, 0x4f, 0x46, 0x32]) },
  { ext: 'woff', label: 'WOFF font', test: (b) => match(b, [0x77, 0x4f, 0x46, 0x46]) },
  { ext: 'ttf', label: 'TrueType font', test: (b) => match(b, [0x00, 0x01, 0x00, 0x00, 0x00]) },
  { ext: 'otf', label: 'OpenType font', test: (b) => match(b, [0x4f, 0x54, 0x54, 0x4f]) },
];

function match(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** What these bytes look like, so "decode to file" can suggest a sensible name. */
export function sniffBytes(bytes: Uint8Array): Sniffed | null {
  for (const entry of MAGIC) {
    if (entry.test(bytes)) return { ext: entry.ext, label: entry.label };
  }
  return null;
}

/** Default filename for a decoded blob. */
export function suggestedFilename(result: DecodeResult): string {
  if (result.sniffed) return `decoded.${result.sniffed.ext}`;
  if (result.text !== null) return 'decoded.txt';
  return 'decoded.bin';
}
