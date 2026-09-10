import { describe, it, expect } from 'vitest';
import {
  bytesToBase64,
  decodeInput,
  decodeToBytes,
  encodeText,
  normalizeBase64,
  sniffBytes,
  suggestedFilename,
  toUrlSafe,
  wrapLines,
} from './logic';

const decodeText = (input: string) => decodeInput(input).text;

describe('encodeText', () => {
  it('matches the classic ASCII example', () => {
    expect(encodeText('Man')).toBe('TWFu');
    expect(encodeText('Ma')).toBe('TWE=');
    expect(encodeText('M')).toBe('TQ==');
    expect(encodeText('')).toBe('');
  });

  it('handles text plain btoa gets wrong or refuses outright', () => {
    // btoa speaks Latin-1: it throws above U+00FF and silently produces
    // non-UTF-8 output below it. Both are why this tool exists.
    expect(() => btoa('日本')).toThrow();
    expect(btoa('café')).not.toBe(encodeText('café'));
    expect(encodeText('café')).toBe('Y2Fmw6k=');
    expect(decodeText('Y2Fmw6k=')).toBe('café');
    expect(decodeText(encodeText('日本'))).toBe('日本');
  });

  it('round-trips emoji, CJK and combining marks', () => {
    for (const sample of ['\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} family', '\u65E5\u672C\u8A9E', 'e\u0301gal', '\u{1F4A9}'.repeat(50)]) {
      expect(decodeText(encodeText(sample))).toBe(sample);
    }
  });

  it('produces the URL-safe alphabet without padding', () => {
    const raw = new Uint8Array([0xfb, 0xff, 0xbf]);
    expect(bytesToBase64(raw)).toBe('+/+/');
    expect(toUrlSafe(bytesToBase64(raw))).toBe('-_-_');
    const encoded = encodeText('subjects?_d=1', { urlSafe: true });
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeText(encoded)).toBe('subjects?_d=1');
  });

  it('wraps at 76 characters only when asked', () => {
    const long = encodeText('x'.repeat(300), { wrap: true });
    const lines = long.split('\n');
    expect(lines[0]).toHaveLength(76);
    expect(lines.every((l) => l.length <= 76)).toBe(true);
    expect(encodeText('x'.repeat(300))).not.toContain('\n');
    expect(wrapLines('abcdef', 2)).toBe('ab\ncd\nef');
  });
});

describe('decoding tolerance', () => {
  it('ignores whitespace, wrapping and a data: prefix', () => {
    expect(decodeText('SGVsbG8s\nIHdvcmxk')).toBe('Hello, world');
    expect(decodeText('  SGVs bG8=  ')).toBe('Hello');
    expect(normalizeBase64('data:text/plain;base64,SGVsbG8=')).toBe('SGVsbG8=');
    expect(decodeText('data:text/plain;charset=utf-8;base64,SGVsbG8=')).toBe('Hello');
  });

  it('accepts the URL-safe alphabet and missing padding', () => {
    expect(decodeText('SGVsbG8')).toBe('Hello');
    expect(decodeText('-_-_')).toBe(null); // valid base64, but not UTF-8 text
    expect(decodeToBytes('-_-_')).toEqual(new Uint8Array([0xfb, 0xff, 0xbf]));
  });

  it('returns bytes and a null text for binary payloads', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const result = decodeInput(bytesToBase64(png));
    expect(result.text).toBeNull();
    expect([...result.bytes]).toEqual([...png]);
    expect(result.sniffed?.ext).toBe('png');
    expect(suggestedFilename(result)).toBe('decoded.png');
  });

  it('suggests .txt for text and .bin for unknown binary', () => {
    expect(suggestedFilename(decodeInput(encodeText('hello')))).toBe('decoded.txt');
    expect(suggestedFilename(decodeInput(bytesToBase64(new Uint8Array([0x01, 0x02, 0x9f]))))).toBe('decoded.bin');
  });
});

describe('decoding errors', () => {
  it('names the character that is not base64', () => {
    expect(() => decodeToBytes('SGVsbG8$Zm8=')).toThrow(/“\$”/);
    expect(() => decodeToBytes('SGVsbG8$Zm8=')).toThrow(/character 8/);
  });

  it('explains padding in the middle', () => {
    expect(() => decodeToBytes('SG=sbG8=')).toThrow(/padding in the middle/);
  });

  it('rejects more padding than base64 ever produces', () => {
    expect(() => decodeToBytes('QQ===')).toThrow(/more than two/);
  });

  it('explains a truncated string rather than silently dropping a byte', () => {
    expect(() => decodeToBytes('SGVsbG8sIHdvcmxkI')).toThrow(/leftover block of 1 character/);
  });

  it('treats an empty input as empty output', () => {
    expect(decodeToBytes('')).toEqual(new Uint8Array(0));
    expect(decodeToBytes('   \n ')).toEqual(new Uint8Array(0));
  });
});

describe('sniffBytes', () => {
  it('recognises common containers by magic number', () => {
    expect(sniffBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))?.ext).toBe('pdf');
    expect(sniffBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(sniffBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))?.ext).toBe('zip');
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffBytes(webp)?.ext).toBe('webp');
    expect(sniffBytes(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]))).toBeNull();
  });

  it('does not read past the end of a short buffer', () => {
    expect(sniffBytes(new Uint8Array([0x52, 0x49]))).toBeNull();
    expect(sniffBytes(new Uint8Array(0))).toBeNull();
  });
});
