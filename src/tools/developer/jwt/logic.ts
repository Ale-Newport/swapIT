/**
 * JWT decoding, entirely in the frontend. Nothing here reaches the network or
 * the filesystem: a token pasted into this tool is base64-decoded in memory and
 * thrown away with the component.
 */

export interface DecodedJwt {
  header: Record<string, unknown>;
  headerText: string;
  payload: unknown;
  payloadText: string;
  /** The third segment, untouched. Never verified — that needs the secret. */
  signature: string;
  algorithm: string | null;
  tokenType: string | null;
  keyId: string | null;
  unsigned: boolean;
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

const SEGMENT_LABEL = ['header', 'payload', 'signature'] as const;

/** Decode one base64url segment into text, explaining exactly what is wrong when it fails. */
export function base64UrlDecode(segment: string, label: string): string {
  if (!BASE64URL.test(segment)) {
    const index = segment.split('').findIndex((c) => !/[A-Za-z0-9_-]/.test(c));
    const char = segment[index];
    const printable = char === ' ' ? 'a space' : `“${char}”`;
    throw new Error(
      `The ${label} contains ${printable} at position ${index + 1}, which base64url does not allow. Only A–Z, a–z, 0–9, “-” and “_” are valid.`,
    );
  }
  if (segment.length % 4 === 1) {
    throw new Error(`The ${label} is ${segment.length} characters long, which is not a possible base64url length.`);
  }
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (segment.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error(`The ${label} could not be decoded as base64url.`);
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function parseSegment(segment: string, label: string): { value: unknown; text: string } {
  const text = base64UrlDecode(segment, label);
  try {
    return { value: JSON.parse(text) as unknown, text };
  } catch {
    const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    throw new Error(`The ${label} decoded, but it is not JSON. It reads: ${preview || '(nothing)'}`);
  }
}

export function decodeJwt(input: string): DecodedJwt {
  const token = input.trim().replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  if (!token) throw new Error('Paste a JWT to decode it.');

  const parts = token.split('.');
  if (parts.length === 5) {
    throw new Error(
      'This is a JWE — an encrypted token with five parts. Its contents cannot be read without the decryption key.',
    );
  }
  if (parts.length !== 3) {
    throw new Error(
      `A JWT has three parts separated by dots — header, payload and signature. This one has ${parts.length}. Check that nothing was cut off when copying.`,
    );
  }
  if (!parts[0]) throw new Error('The header segment is empty — the token starts with a dot.');
  if (!parts[1]) throw new Error('The payload segment is empty, so there are no claims to read.');

  const header = parseSegment(parts[0], SEGMENT_LABEL[0]);
  if (header.value === null || typeof header.value !== 'object' || Array.isArray(header.value)) {
    throw new Error('The header decoded to something other than a JSON object, so this is not a JWT.');
  }
  const payload = parseSegment(parts[1], SEGMENT_LABEL[1]);
  const headerObject = header.value as Record<string, unknown>;

  return {
    header: headerObject,
    headerText: JSON.stringify(headerObject, null, 2),
    payload: payload.value,
    payloadText: JSON.stringify(payload.value, null, 2),
    signature: parts[2],
    algorithm: typeof headerObject.alg === 'string' ? headerObject.alg : null,
    tokenType: typeof headerObject.typ === 'string' ? headerObject.typ : null,
    keyId: typeof headerObject.kid === 'string' ? headerObject.kid : null,
    unsigned: parts[2] === '',
  };
}

/** Numeric dates are seconds since the epoch; some issuers wrongly send milliseconds. */
export function toEpochSeconds(value: unknown): { seconds: number; wasMillis: boolean } | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return null;
  // Anything past the year 5138 in seconds is a millisecond timestamp.
  if (Math.abs(raw) >= 1e11) return { seconds: Math.floor(raw / 1000), wasMillis: true };
  return { seconds: Math.floor(raw), wasMillis: false };
}

const UNITS: Array<[string, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/** "in 12 minutes" / "3 hours ago", from a delta in seconds. */
export function formatRelativeSeconds(delta: number): string {
  const abs = Math.abs(Math.round(delta));
  if (abs < 5) return 'just now';
  for (const [name, size] of UNITS) {
    if (abs >= size) {
      const count = Math.floor(abs / size);
      const unit = `${count} ${name}${count === 1 ? '' : 's'}`;
      return delta >= 0 ? `in ${unit}` : `${unit} ago`;
    }
  }
  return 'just now';
}

export type TimeState = 'expired' | 'valid' | 'not-yet' | 'none';

export interface TimeClaim {
  key: string;
  label: string;
  seconds: number;
  /** Human phrasing relative to now, e.g. "expired 3 hours ago". */
  relative: string;
  wasMillis: boolean;
}

export interface TokenTiming {
  state: TimeState;
  /** One line for the badge: "Expired 3 hours ago", "Expires in 12 minutes". */
  summary: string;
  claims: TimeClaim[];
}

export function readTiming(payload: unknown, nowMs: number): TokenTiming {
  const now = Math.floor(nowMs / 1000);
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const claims: TimeClaim[] = [];
  const add = (key: string, label: string, phrase: (delta: number) => string) => {
    const parsed = toEpochSeconds(record[key]);
    if (!parsed) return null;
    const delta = parsed.seconds - now;
    claims.push({ key, label, seconds: parsed.seconds, relative: phrase(delta), wasMillis: parsed.wasMillis });
    return delta;
  };

  add('iat', 'Issued at', (d) => (d > 0 ? `dated ${formatRelativeSeconds(d)}` : `issued ${formatRelativeSeconds(d)}`));
  const nbfDelta = add('nbf', 'Not valid before', (d) =>
    d > 0 ? `usable ${formatRelativeSeconds(d)}` : `valid since ${formatRelativeSeconds(d)}`,
  );
  const expDelta = add('exp', 'Expires', (d) =>
    d <= 0 ? `expired ${formatRelativeSeconds(d)}` : `expires ${formatRelativeSeconds(d)}`,
  );

  // Order the rows the way a reader thinks about them.
  claims.sort((a, b) => ['iat', 'nbf', 'exp'].indexOf(a.key) - ['iat', 'nbf', 'exp'].indexOf(b.key));

  if (expDelta !== null && expDelta <= 0) {
    const claim = claims.find((c) => c.key === 'exp');
    return { state: 'expired', summary: capitalise(claim?.relative ?? 'Expired'), claims };
  }
  if (nbfDelta !== null && nbfDelta > 0) {
    const claim = claims.find((c) => c.key === 'nbf');
    return { state: 'not-yet', summary: capitalise(claim?.relative ?? 'Not valid yet'), claims };
  }
  if (expDelta !== null) {
    const claim = claims.find((c) => c.key === 'exp');
    return { state: 'valid', summary: capitalise(claim?.relative ?? 'Valid'), claims };
  }
  return { state: 'none', summary: 'No expiry claim — this token does not expire on its own', claims };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface RegisteredClaim {
  key: string;
  label: string;
  value: string;
}

const REGISTERED: Array<[string, string]> = [
  ['iss', 'Issuer'],
  ['sub', 'Subject'],
  ['aud', 'Audience'],
  ['jti', 'Token ID'],
  ['azp', 'Authorised party'],
  ['scope', 'Scope'],
];

/** The identity claims worth spelling out above the raw JSON. */
export function readRegisteredClaims(payload: unknown): RegisteredClaim[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  const out: RegisteredClaim[] = [];
  for (const [key, label] of REGISTERED) {
    const value = record[key];
    if (value === undefined || value === null || value === '') continue;
    out.push({
      key,
      label,
      value: Array.isArray(value) ? value.map(String).join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value),
    });
  }
  return out;
}

export interface AlgorithmNote {
  tone: 'neutral' | 'warn' | 'danger';
  text: string;
}

/** What the `alg` header means for whoever is holding this token. */
export function describeAlgorithm(algorithm: string | null, unsigned: boolean): AlgorithmNote {
  if (!algorithm) {
    return { tone: 'warn', text: 'The header has no “alg” field, so there is no way to tell how this token was signed.' };
  }
  if (algorithm.toLowerCase() === 'none') {
    return {
      tone: 'danger',
      text: 'The algorithm is “none”: this token carries no signature at all and anyone can change its contents. Never trust a token like this.',
    };
  }
  if (unsigned) {
    return {
      tone: 'warn',
      text: `The header claims ${algorithm}, but the signature segment is empty — the token was truncated or built incorrectly.`,
    };
  }
  const family = algorithm.startsWith('HS')
    ? 'a shared secret (HMAC)'
    : algorithm.startsWith('RS') || algorithm.startsWith('PS')
      ? 'an RSA key pair'
      : algorithm.startsWith('ES')
        ? 'an elliptic-curve key pair'
        : algorithm.startsWith('Ed')
          ? 'an EdDSA key pair'
          : 'a key';
  return { tone: 'neutral', text: `Signed with ${algorithm}, which uses ${family}.` };
}
