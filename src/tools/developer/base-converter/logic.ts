/**
 * Number base conversion on BigInt, so 512-bit hashes and 64-bit ids survive a
 * round trip that `parseInt` would quietly destroy.
 */

export const MIN_BASE = 2;
export const MAX_BASE = 36;

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** The digits a base accepts, e.g. "0-9, a-f" for base 16. */
export function allowedDigits(base: number): string {
  const last = DIGITS[base - 1];
  if (base <= 10) return `0-${last}`;
  return `0-9 and a-${last}`;
}

export function baseName(base: number): string {
  switch (base) {
    case 2:
      return 'binary';
    case 8:
      return 'octal';
    case 10:
      return 'decimal';
    case 16:
      return 'hexadecimal';
    default:
      return `base ${base}`;
  }
}

const PREFIXES: Record<string, number> = { '0x': 16, '0b': 2, '0o': 8 };

/**
 * A prefix only means "prefix" when its letter is not itself a digit of the
 * field's base. "0BEEF" in hexadecimal is the number 0xBEEF, not a binary
 * literal — and the same holds for "0o…" from base 25 and "0x…" from base 34.
 */
function prefixApplies(prefix: string, base: number): boolean {
  if (PREFIXES[prefix] === undefined) return false;
  const letter = DIGITS.indexOf(prefix[1]);
  return letter < 0 || letter >= base;
}

/**
 * Parse `text` as an integer written in `base`. Underscores, spaces and the
 * usual 0x/0b/0o prefixes are accepted; anything else throws a message that
 * names the offending character.
 */
export function parseInBase(text: string, base: number): bigint {
  if (base < MIN_BASE || base > MAX_BASE || !Number.isInteger(base)) {
    throw new Error(`The base must be a whole number between ${MIN_BASE} and ${MAX_BASE}.`);
  }
  let raw = text.trim().replace(/[_\s',]/g, '');
  if (!raw) throw new Error('Type a number to convert.');

  let negative = false;
  if (raw[0] === '-' || raw[0] === '+') {
    negative = raw[0] === '-';
    raw = raw.slice(1);
  }

  const prefix = raw.slice(0, 2).toLowerCase();
  if (prefixApplies(prefix, base)) {
    if (PREFIXES[prefix] !== base) {
      throw new Error(
        `The prefix "${prefix}" means ${baseName(PREFIXES[prefix])}, but this field is ${baseName(base)}. Remove the prefix or switch base.`,
      );
    }
    raw = raw.slice(2);
  }

  if (!raw) throw new Error('Type a number to convert.');

  let value = 0n;
  const big = BigInt(base);
  for (const char of raw.toLowerCase()) {
    const digit = DIGITS.indexOf(char);
    if (digit < 0 || digit >= base) {
      throw new Error(`"${char}" is not a digit in ${baseName(base)}. Use ${allowedDigits(base)}.`);
    }
    value = value * big + BigInt(digit);
  }
  return negative ? -value : value;
}

export function formatInBase(value: bigint, base: number): string {
  if (base < MIN_BASE || base > MAX_BASE || !Number.isInteger(base)) {
    throw new Error(`The base must be a whole number between ${MIN_BASE} and ${MAX_BASE}.`);
  }
  return value.toString(base);
}

/** Significant bits in the magnitude. 0 has none, 255 has eight. */
export function bitLength(value: bigint): number {
  const magnitude = value < 0n ? -value : value;
  if (magnitude === 0n) return 0;
  return magnitude.toString(2).length;
}

/** Bytes needed to store the magnitude, rounded up. */
export function byteLength(value: bigint): number {
  return Math.ceil(bitLength(value) / 8);
}

/**
 * "11111111" → "1111 1111". Pads the leading group so the columns line up the
 * way a nibble view should.
 */
export function groupBinary(bits: string, size = 4): string {
  const negative = bits.startsWith('-');
  const body = negative ? bits.slice(1) : bits;
  const padded = body.padStart(Math.max(size, Math.ceil(body.length / size) * size), '0');
  const groups: string[] = [];
  for (let i = 0; i < padded.length; i += size) groups.push(padded.slice(i, i + size));
  return (negative ? '-' : '') + groups.join(' ');
}

/** Does the value fit in a signed/unsigned integer of `bits` width? */
export function fitsIn(value: bigint, bits: number, signed: boolean): boolean {
  if (signed) {
    const limit = 1n << BigInt(bits - 1);
    return value >= -limit && value <= limit - 1n;
  }
  return value >= 0n && value < 1n << BigInt(bits);
}

export interface WidthNote {
  label: string;
  fits: boolean;
}

export function widthNotes(value: bigint): WidthNote[] {
  const widths = [8, 16, 32, 64];
  return widths.map((bits) => ({
    label: value < 0n ? `int${bits}` : `uint${bits}`,
    fits: fitsIn(value, bits, value < 0n),
  }));
}
