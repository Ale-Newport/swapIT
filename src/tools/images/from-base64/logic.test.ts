import { describe, it, expect } from 'vitest';
import { bytesToBase64, decodeImageData, detectFormat, normalizeBase64, suggestedFilename } from './logic';

const bytesOf = (...values: number[]) => new Uint8Array(values);
const PNG_HEADER = bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG_HEADER = bytesOf(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46);
const b64 = (bytes: Uint8Array) => bytesToBase64(bytes);

describe('detectFormat', () => {
  it('recognises the common raster signatures', () => {
    expect(detectFormat(PNG_HEADER)).toEqual({ mime: 'image/png', extension: 'png' });
    expect(detectFormat(JPEG_HEADER)).toEqual({ mime: 'image/jpeg', extension: 'jpg' });
    expect(detectFormat(new TextEncoder().encode('GIF89a...'))).toEqual({ mime: 'image/gif', extension: 'gif' });
    expect(detectFormat(new TextEncoder().encode('RIFF????WEBPVP8 '))).toEqual({
      mime: 'image/webp',
      extension: 'webp',
    });
    expect(detectFormat(bytesOf(0x49, 0x49, 0x2a, 0x00, 8))).toEqual({ mime: 'image/tiff', extension: 'tiff' });
  });

  it('reads the brand out of an ISO base-media container', () => {
    const heic = new TextEncoder().encode('\0\0\0\x18ftypheic\0\0\0\0');
    expect(detectFormat(heic)).toEqual({ mime: 'image/heic', extension: 'heic' });
    const avif = new TextEncoder().encode('\0\0\0\x18ftypavif\0\0\0\0');
    expect(detectFormat(avif)).toEqual({ mime: 'image/avif', extension: 'avif' });
  });

  it('recognises SVG markup with or without an XML prolog', () => {
    expect(detectFormat(new TextEncoder().encode('<svg xmlns="…"></svg>'))?.extension).toBe('svg');
    expect(detectFormat(new TextEncoder().encode('<?xml version="1.0"?><svg></svg>'))?.extension).toBe('svg');
  });

  it('returns null for bytes that are not an image', () => {
    expect(detectFormat(new TextEncoder().encode('hello world'))).toBeNull();
    expect(detectFormat(new Uint8Array())).toBeNull();
  });
});

describe('normalizeBase64', () => {
  it('strips whitespace and restores padding', () => {
    expect(normalizeBase64('QUJ\nD RUZ')).toBe('QUJDRUZ=');
  });

  it('accepts the URL-safe alphabet', () => {
    expect(normalizeBase64('a-b_c1')).toBe('a+b/c1==');
  });

  it('rejects text that is not Base64 at all', () => {
    expect(() => normalizeBase64('not base64!')).toThrow(/not valid Base64/);
    expect(() => normalizeBase64('   ')).toThrow(/nothing to decode/);
  });

  it('rejects a string whose length can never be valid', () => {
    expect(() => normalizeBase64('QUJDR')).toThrow(/cut short/);
  });
});

describe('decodeImageData', () => {
  it('decodes a data URL and trusts the signature over the declared type', () => {
    const result = decodeImageData(`data:application/octet-stream;base64,${b64(PNG_HEADER)}`);
    expect(result.mime).toBe('image/png');
    expect(result.extension).toBe('png');
    expect(result.detectedFrom).toBe('signature');
    expect(result.bytes).toEqual(PNG_HEADER);
  });

  it('decodes a bare Base64 payload with line breaks', () => {
    const wrapped = b64(JPEG_HEADER).replace(/(.{4})/g, '$1\n');
    const result = decodeImageData(wrapped);
    expect(result.extension).toBe('jpg');
    expect(result.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('decodes a percent-encoded SVG data URL', () => {
    const result = decodeImageData('data:image/svg+xml,%3Csvg%20xmlns%3D%22x%22%3E%3C%2Fsvg%3E');
    expect(result.mime).toBe('image/svg+xml');
    expect(result.extension).toBe('svg');
    expect(new TextDecoder().decode(result.bytes)).toBe('<svg xmlns="x"></svg>');
  });

  it('falls back to the declared image type when the bytes are unfamiliar', () => {
    const result = decodeImageData(`data:image/jp2;base64,${b64(bytesOf(1, 2, 3, 4, 5, 6, 7, 8))}`);
    expect(result.mime).toBe('image/jp2');
    expect(result.extension).toBe('jp2');
    expect(result.detectedFrom).toBe('data-url');
  });

  it('refuses text that decodes to something that is not an image', () => {
    expect(() => decodeImageData(b64(new TextEncoder().encode('just some words here')))).toThrow(
      /not an image Toolbox recognises/,
    );
  });

  it('explains bad input instead of throwing a decoder error', () => {
    expect(() => decodeImageData('')).toThrow(/nothing to decode/);
    expect(() => decodeImageData('<<<>>>')).toThrow(/not valid Base64/);
  });
});

describe('suggestedFilename', () => {
  it('names the download after the detected format', () => {
    expect(suggestedFilename('png')).toBe('image.png');
    expect(suggestedFilename('jpg')).toBe('image.jpg');
  });
});
