import { describe, expect, it } from 'vitest';
import {
  NIL_UUID,
  createV7Generator,
  formatUuid,
  formatUuidList,
  generate,
  uuidV4,
  v7Timestamp,
  type RandomBytes,
} from './logic';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A deterministic byte source, so the structural bits can be asserted exactly. */
const fixedBytes =
  (fill: number): RandomBytes =>
  (length) =>
    new Uint8Array(length).fill(fill);

describe('uuidV4', () => {
  it('has the canonical shape, version 4 and the RFC variant', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = uuidV4();
      expect(id).toMatch(UUID_SHAPE);
      expect(id[14]).toBe('4');
      expect('89ab').toContain(id[19]);
    }
  });

  it('sets the version and variant bits even when the platform helper is unused', () => {
    const id = uuidV4(fixedBytes(0xff));
    expect(id[14]).toBe('4');
    expect(id[19]).toBe('b'); // 0xff masked to the variant becomes 0b10111111
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uuidV4()));
    expect(ids.size).toBe(500);
  });
});

describe('createV7Generator', () => {
  it('marks the version nibble and the variant bits', () => {
    const next = createV7Generator();
    for (let i = 0; i < 50; i += 1) {
      const id = next();
      expect(id).toMatch(UUID_SHAPE);
      expect(id[14]).toBe('7');
      expect('89ab').toContain(id[19]);
    }
  });

  it('writes the millisecond timestamp big-endian in the first 48 bits', () => {
    const ms = 0x018f1a2b3c4d; // a plausible Unix millisecond value
    const next = createV7Generator(() => ms, fixedBytes(0));
    const id = next();
    expect(id.replace(/-/g, '').slice(0, 12)).toBe('018f1a2b3c4d');
    expect(v7Timestamp(id)).toBe(ms);
  });

  it('sorts in creation order even when the clock never moves', () => {
    const next = createV7Generator(() => 1_700_000_000_000, fixedBytes(0x00));
    const ids = Array.from({ length: 5000 }, next);
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i] > ids[i - 1], `${ids[i]} should sort after ${ids[i - 1]}`).toBe(true);
    }
  });

  it('borrows a millisecond when the 12-bit counter overflows', () => {
    const ms = 1_700_000_000_000;
    // A seed of 0x07ff puts the counter at the top of its range immediately.
    const seed: RandomBytes = (length) => {
      const out = new Uint8Array(length);
      out[0] = 0x0f;
      out[1] = 0xff;
      return out;
    };
    const next = createV7Generator(() => ms, seed);
    const first = next();
    expect(v7Timestamp(first)).toBe(ms);
    // 0x07ff + 2048 increments exhausts the counter.
    let last = first;
    for (let i = 0; i < 2049; i += 1) last = next();
    expect(v7Timestamp(last)).toBe(ms + 1);
    expect(last > first).toBe(true);
  });

  it('never emits a smaller timestamp when the clock steps backwards', () => {
    let now = 1_700_000_000_000;
    const next = createV7Generator(() => now, fixedBytes(0x01));
    const before = next();
    now -= 5000;
    const after = next();
    expect(after > before).toBe(true);
    expect(v7Timestamp(after)).toBe(v7Timestamp(before));
  });
});

describe('generate', () => {
  it('caps the count and always produces at least one', () => {
    expect(generate('v4', 0)).toHaveLength(1);
    expect(generate('v4', 25)).toHaveLength(25);
    expect(generate('v7', 99999)).toHaveLength(10000);
  });

  it('returns the nil uuid for every row in nil mode', () => {
    expect(generate('nil', 3)).toEqual([NIL_UUID, NIL_UUID, NIL_UUID]);
  });

  it('keeps a v7 batch ordered', () => {
    const ids = generate('v7', 400);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('formatting', () => {
  const id = '018f1a2b-3c4d-7e6f-8a9b-0c1d2e3f4a5b';

  it('strips hyphens, uppercases and wraps in braces', () => {
    expect(formatUuid(id, { hyphens: false, uppercase: false, braces: false, quotes: 'none' })).toBe(
      '018f1a2b3c4d7e6f8a9b0c1d2e3f4a5b',
    );
    expect(formatUuid(id, { hyphens: true, uppercase: true, braces: true, quotes: 'none' })).toBe(
      '{018F1A2B-3C4D-7E6F-8A9B-0C1D2E3F4A5B}',
    );
  });

  it('quotes a list with a comma on every line but the last', () => {
    const out = formatUuidList([id, id], { hyphens: true, uppercase: false, braces: false, quotes: 'double' });
    expect(out).toBe(`"${id}",\n"${id}"`);
  });

  it('uses single quotes when asked', () => {
    const out = formatUuidList([id], { hyphens: true, uppercase: false, braces: false, quotes: 'single' });
    expect(out).toBe(`'${id}'`);
  });
});
