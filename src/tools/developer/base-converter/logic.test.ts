import { describe, it, expect } from 'vitest';
import {
  allowedDigits,
  bitLength,
  byteLength,
  fitsIn,
  formatInBase,
  groupBinary,
  parseInBase,
  widthNotes,
} from './logic';

describe('parseInBase', () => {
  it('reads the usual bases', () => {
    expect(parseInBase('ff', 16)).toBe(255n);
    expect(parseInBase('1010', 2)).toBe(10n);
    expect(parseInBase('777', 8)).toBe(511n);
    expect(parseInBase('42', 10)).toBe(42n);
    expect(parseInBase('zz', 36)).toBe(1295n);
  });

  it('is case insensitive and ignores grouping characters', () => {
    expect(parseInBase('DEAD_BEEF', 16)).toBe(0xdeadbeefn);
    expect(parseInBase('1111 0000', 2)).toBe(240n);
    expect(parseInBase(' 1,000 ', 10)).toBe(1000n);
  });

  it('handles negative numbers', () => {
    expect(parseInBase('-ff', 16)).toBe(-255n);
    expect(parseInBase('+ff', 16)).toBe(255n);
  });

  it('accepts a matching prefix and rejects a mismatched one', () => {
    expect(parseInBase('0x1f', 16)).toBe(31n);
    expect(parseInBase('0b1010', 2)).toBe(10n);
    expect(parseInBase('0o17', 8)).toBe(15n);
    expect(() => parseInBase('0x1f', 10)).toThrow(/hexadecimal/);
  });

  it('keeps precision far past Number.MAX_SAFE_INTEGER', () => {
    const huge = '9007199254740993123456789012345678901234567890';
    expect(parseInBase(huge, 10).toString()).toBe(huge);
  });

  it('names the offending digit', () => {
    expect(() => parseInBase('12g', 16)).toThrow('"g" is not a digit in hexadecimal. Use 0-9 and a-f.');
    expect(() => parseInBase('102', 2)).toThrow('"2" is not a digit in binary. Use 0-1.');
  });

  it('rejects empty input and impossible bases', () => {
    expect(() => parseInBase('   ', 10)).toThrow('Type a number to convert.');
    expect(() => parseInBase('-', 10)).toThrow('Type a number to convert.');
    expect(() => parseInBase('10', 37)).toThrow(/between 2 and 36/);
  });
});

describe('formatInBase round trips', () => {
  it('survives a 256-bit value through every base', () => {
    const value = (1n << 255n) + 12345678901234567890n;
    for (let base = 2; base <= 36; base++) {
      expect(parseInBase(formatInBase(value, base), base)).toBe(value);
    }
  });

  it('survives negative values', () => {
    const value = -987654321098765432109876543210n;
    for (const base of [2, 8, 10, 16, 36]) {
      expect(parseInBase(formatInBase(value, base), base)).toBe(value);
    }
  });

  it('formats zero in every base', () => {
    expect(formatInBase(0n, 2)).toBe('0');
    expect(formatInBase(0n, 36)).toBe('0');
  });
});

describe('bitLength / byteLength', () => {
  it('counts significant bits', () => {
    expect(bitLength(0n)).toBe(0);
    expect(bitLength(1n)).toBe(1);
    expect(bitLength(255n)).toBe(8);
    expect(bitLength(256n)).toBe(9);
    expect(bitLength(-255n)).toBe(8);
    expect(bitLength(1n << 127n)).toBe(128);
  });

  it('rounds bytes up', () => {
    expect(byteLength(0n)).toBe(0);
    expect(byteLength(255n)).toBe(1);
    expect(byteLength(256n)).toBe(2);
  });
});

describe('groupBinary', () => {
  it('splits into nibbles and pads the leading group', () => {
    expect(groupBinary('11111111')).toBe('1111 1111');
    expect(groupBinary('101')).toBe('0101');
    expect(groupBinary('1', 8)).toBe('00000001');
    expect(groupBinary('110000101')).toBe('0001 1000 0101');
  });

  it('keeps the sign outside the groups', () => {
    expect(groupBinary('-1010')).toBe('-1010');
  });
});

describe('fitsIn / widthNotes', () => {
  it('checks unsigned ranges', () => {
    expect(fitsIn(255n, 8, false)).toBe(true);
    expect(fitsIn(256n, 8, false)).toBe(false);
    expect(fitsIn(-1n, 8, false)).toBe(false);
  });

  it('checks signed ranges', () => {
    expect(fitsIn(-128n, 8, true)).toBe(true);
    expect(fitsIn(-129n, 8, true)).toBe(false);
    expect(fitsIn(127n, 8, true)).toBe(true);
  });

  it('reports signed widths for negative values', () => {
    expect(widthNotes(-5n)[0]).toEqual({ label: 'int8', fits: true });
    expect(widthNotes(70000n).map((w) => w.fits)).toEqual([false, false, true, true]);
  });
});

describe('allowedDigits', () => {
  it('describes the digit range', () => {
    expect(allowedDigits(2)).toBe('0-1');
    expect(allowedDigits(10)).toBe('0-9');
    expect(allowedDigits(16)).toBe('0-9 and a-f');
    expect(allowedDigits(36)).toBe('0-9 and a-z');
  });
});
