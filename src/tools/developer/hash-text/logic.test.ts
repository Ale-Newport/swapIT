import { describe, expect, it } from 'vitest';
import { ALGORITHMS, digestReport, formatDigest, prepareText, utf8ByteLength } from './logic';

const AS_IS = { lineEndings: 'as-is' as const, trailingNewline: false };

describe('prepareText', () => {
  it('leaves the text untouched by default', () => {
    expect(prepareText('a\r\nb', AS_IS)).toBe('a\r\nb');
  });

  it('normalises to LF', () => {
    expect(prepareText('a\r\nb\r\n', { ...AS_IS, lineEndings: 'lf' })).toBe('a\nb\n');
  });

  it('normalises to CRLF without doubling existing carriage returns', () => {
    expect(prepareText('a\r\nb\nc', { ...AS_IS, lineEndings: 'crlf' })).toBe('a\r\nb\r\nc');
  });

  it('adds a trailing newline the way echo does', () => {
    expect(prepareText('hello', { ...AS_IS, trailingNewline: true })).toBe('hello\n');
  });

  it('does not add a second trailing newline', () => {
    expect(prepareText('hello\n', { ...AS_IS, trailingNewline: true })).toBe('hello\n');
  });

  it('uses CRLF for the trailing newline when the text is CRLF', () => {
    expect(prepareText('hello', { lineEndings: 'crlf', trailingNewline: true })).toBe('hello\r\n');
  });

  it('leaves empty input empty unless a newline was asked for', () => {
    expect(prepareText('', AS_IS)).toBe('');
    expect(prepareText('', { ...AS_IS, trailingNewline: true })).toBe('\n');
  });
});

describe('utf8ByteLength', () => {
  it('counts ASCII one byte per character', () => {
    expect(utf8ByteLength('abc')).toBe(3);
  });

  it('counts multi-byte characters by their encoding', () => {
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('東')).toBe(3);
    expect(utf8ByteLength('🙂')).toBe(4);
  });

  it('counts a newline', () => {
    expect(utf8ByteLength('a\n')).toBe(2);
  });
});

describe('formatDigest', () => {
  it('switches case without touching the digits', () => {
    expect(formatDigest('a1b2', true)).toBe('A1B2');
    expect(formatDigest('A1B2', false)).toBe('a1b2');
  });
});

describe('digestReport', () => {
  it('lists only the digests it was given, in algorithm order', () => {
    const report = digestReport({ sha256: 'ff', md5: 'aa' }, false);
    expect(report.split('\n')).toEqual(['MD5      aa', 'SHA-256  ff']);
  });

  it('follows the uppercase setting', () => {
    expect(digestReport({ md5: 'aa' }, true)).toContain('AA');
  });

  it('is empty when nothing has been computed', () => {
    expect(digestReport({}, false)).toBe('');
  });
});

describe('ALGORITHMS', () => {
  it('marks MD5 and SHA-1 as unsuitable for security', () => {
    const insecure = ALGORITHMS.filter((a) => !a.secure).map((a) => a.id);
    expect(insecure).toEqual(['md5', 'sha1']);
  });

  it('states the right digest length for each algorithm', () => {
    expect(ALGORITHMS.map((a) => a.digits)).toEqual([32, 40, 64, 128]);
  });
});
