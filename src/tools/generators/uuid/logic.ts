/**
 * UUID generation. v4 is pure randomness; v7 is time-ordered, which is what you
 * want for database keys — rows written together stay together on disk.
 */

export type UuidVersion = 'v4' | 'v7' | 'nil';

export interface UuidFormat {
  hyphens: boolean;
  uppercase: boolean;
  braces: boolean;
  quotes: 'none' | 'double' | 'single';
}

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const MAX_COUNT = 10000;

export type RandomBytes = (length: number) => Uint8Array;

const cryptoBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
};

function bytesToUuid(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < 16; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Random v4, from the platform CSPRNG. */
export function uuidV4(randomBytes: RandomBytes = cryptoBytes): string {
  if (randomBytes === cryptoBytes && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * A v7 generator with its own counter state.
 *
 * Layout (RFC 9562): 48-bit big-endian Unix millisecond timestamp, 4-bit version
 * `7`, 12 bits of `rand_a`, the 2-bit variant `10`, then 62 bits of `rand_b`.
 * `rand_a` is used as a monotonic counter so that ids minted inside the same
 * millisecond still sort in creation order.
 */
export function createV7Generator(
  clock: () => number = Date.now,
  randomBytes: RandomBytes = cryptoBytes,
): () => string {
  let lastMs = -1;
  let counter = 0;

  return function nextV7(): string {
    const seed = randomBytes(10);
    let ms = clock();
    if (ms > lastMs) {
      lastMs = ms;
      // Seed the counter low in its range so it has room to climb this millisecond.
      counter = ((seed[0] << 8) | seed[1]) & 0x07ff;
    } else {
      // Same millisecond, or a clock that stepped backwards: keep the ordering by
      // climbing the counter, borrowing a millisecond when the 12 bits run out.
      counter += 1;
      if (counter > 0x0fff) {
        lastMs += 1;
        counter = 0;
      }
      ms = lastMs;
    }

    const bytes = new Uint8Array(16);
    for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
    bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | (seed[2] & 0x3f);
    for (let i = 9; i < 16; i += 1) bytes[i] = seed[i - 6];
    return bytesToUuid(bytes);
  };
}

/** Millisecond timestamp encoded in a v7 uuid, for verifying ordering. */
export function v7Timestamp(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16);
}

export function generate(version: UuidVersion, count: number): string[] {
  const total = Math.max(1, Math.min(MAX_COUNT, Math.floor(count)));
  if (version === 'nil') return Array.from({ length: total }, () => NIL_UUID);
  if (version === 'v7') {
    const next = createV7Generator();
    return Array.from({ length: total }, next);
  }
  return Array.from({ length: total }, () => uuidV4());
}

export function formatUuid(uuid: string, format: UuidFormat): string {
  let out = format.hyphens ? uuid : uuid.replace(/-/g, '');
  if (format.uppercase) out = out.toUpperCase();
  if (format.braces) out = `{${out}}`;
  return out;
}

/** The whole batch as text, optionally quoted so it can be pasted into code. */
export function formatUuidList(uuids: string[], format: UuidFormat): string {
  const lines = uuids.map((u) => formatUuid(u, format));
  if (format.quotes === 'none') return lines.join('\n');
  const q = format.quotes === 'single' ? "'" : '"';
  return lines.map((line, i) => `${q}${line}${q}${i < lines.length - 1 ? ',' : ''}`).join('\n');
}
