import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  decodeJwt,
  describeAlgorithm,
  formatRelativeSeconds,
  readRegisteredClaims,
  readTiming,
  toEpochSeconds,
} from './logic';

/** Build a token the way an issuer would, so the tests exercise real input. */
function makeToken(header: unknown, payload: unknown, signature = 'c2lnbmF0dXJl'): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode(header)}.${encode(payload)}.${signature}`;
}

const NOW = Date.parse('2024-06-01T12:00:00Z');

describe('base64UrlDecode', () => {
  it('decodes url-safe base64 without padding', () => {
    expect(base64UrlDecode('eyJhIjoxfQ', 'payload')).toBe('{"a":1}');
  });

  it('decodes multi-byte UTF-8', () => {
    const encoded = Buffer.from('{"name":"Ålesund 東京"}', 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(base64UrlDecode(encoded, 'payload')).toBe('{"name":"Ålesund 東京"}');
  });

  it('names the offending character and its position', () => {
    expect(() => base64UrlDecode('abc$def', 'payload')).toThrow(/“\$” at position 4/);
  });

  it('rejects an impossible length', () => {
    expect(() => base64UrlDecode('abcde', 'header')).toThrow(/not a possible base64url length/);
  });
});

describe('decodeJwt', () => {
  it('splits a well-formed token into header and payload', () => {
    const token = makeToken({ alg: 'HS256', typ: 'JWT', kid: 'k1' }, { sub: '123', name: 'Ada' });
    const decoded = decodeJwt(token);
    expect(decoded.algorithm).toBe('HS256');
    expect(decoded.tokenType).toBe('JWT');
    expect(decoded.keyId).toBe('k1');
    expect(decoded.payload).toEqual({ sub: '123', name: 'Ada' });
    expect(decoded.headerText).toContain('"alg": "HS256"');
    expect(decoded.unsigned).toBe(false);
  });

  it('tolerates a Bearer prefix and stray whitespace', () => {
    const token = makeToken({ alg: 'HS256' }, { a: 1 });
    expect(decodeJwt(`  Bearer ${token}\n`).payload).toEqual({ a: 1 });
  });

  it('marks a token with an empty signature as unsigned', () => {
    expect(decodeJwt(makeToken({ alg: 'none' }, { a: 1 }, '')).unsigned).toBe(true);
  });

  it('counts the segments in the error when there are not three', () => {
    expect(() => decodeJwt('abc.def')).toThrow(/This one has 2/);
    expect(() => decodeJwt('a.b.c.d')).toThrow(/This one has 4/);
  });

  it('recognises an encrypted JWE instead of guessing', () => {
    expect(() => decodeJwt('a.b.c.d.e')).toThrow(/JWE/);
  });

  it('asks for input when nothing is pasted', () => {
    expect(() => decodeJwt('   ')).toThrow(/Paste a JWT/);
  });

  it('reports a payload that is not JSON', () => {
    const notJson = Buffer.from('hello there', 'utf8').toString('base64url');
    expect(() => decodeJwt(`eyJhbGciOiJIUzI1NiJ9.${notJson}.sig`)).toThrow(/not JSON/);
  });

  it('reports a header that is not a JSON object', () => {
    const arrayHeader = Buffer.from('[1,2]', 'utf8').toString('base64url');
    expect(() => decodeJwt(`${arrayHeader}.eyJhIjoxfQ.sig`)).toThrow(/not a JWT/);
  });

  it('reports invalid base64 in the payload', () => {
    expect(() => decodeJwt('eyJhbGciOiJIUzI1NiJ9.not*valid.sig')).toThrow(/base64url does not allow/);
  });
});

describe('toEpochSeconds', () => {
  it('reads a numeric or string claim', () => {
    expect(toEpochSeconds(1516239022)).toEqual({ seconds: 1516239022, wasMillis: false });
    expect(toEpochSeconds('1516239022')).toEqual({ seconds: 1516239022, wasMillis: false });
  });

  it('recognises a millisecond timestamp sent by mistake', () => {
    expect(toEpochSeconds(1516239022000)).toEqual({ seconds: 1516239022, wasMillis: true });
  });

  it('ignores values that are not times', () => {
    expect(toEpochSeconds('soon')).toBeNull();
    expect(toEpochSeconds(undefined)).toBeNull();
    expect(toEpochSeconds('')).toBeNull();
  });
});

describe('formatRelativeSeconds', () => {
  it('phrases the future and the past differently', () => {
    expect(formatRelativeSeconds(720)).toBe('in 12 minutes');
    expect(formatRelativeSeconds(-10_800)).toBe('3 hours ago');
  });

  it('uses singular units where they belong', () => {
    expect(formatRelativeSeconds(3600)).toBe('in 1 hour');
    expect(formatRelativeSeconds(-86_400)).toBe('1 day ago');
  });

  it('collapses tiny differences', () => {
    expect(formatRelativeSeconds(2)).toBe('just now');
    expect(formatRelativeSeconds(-1)).toBe('just now');
  });

  it('scales up to months and years', () => {
    expect(formatRelativeSeconds(-2_592_000 * 2)).toBe('2 months ago');
    expect(formatRelativeSeconds(31_536_000 * 3)).toBe('in 3 years');
  });
});

describe('readTiming', () => {
  it('calls a past exp expired and says how long ago', () => {
    const timing = readTiming({ exp: NOW / 1000 - 10_800 }, NOW);
    expect(timing.state).toBe('expired');
    expect(timing.summary).toBe('Expired 3 hours ago');
  });

  it('calls a future exp valid and says how long is left', () => {
    const timing = readTiming({ exp: NOW / 1000 + 720 }, NOW);
    expect(timing.state).toBe('valid');
    expect(timing.summary).toBe('Expires in 12 minutes');
  });

  it('flags a token that is not usable yet', () => {
    const timing = readTiming({ nbf: NOW / 1000 + 600, exp: NOW / 1000 + 3600 }, NOW);
    expect(timing.state).toBe('not-yet');
    expect(timing.summary).toBe('Usable in 10 minutes');
  });

  it('says plainly when there is no expiry claim', () => {
    const timing = readTiming({ sub: 'x' }, NOW);
    expect(timing.state).toBe('none');
    expect(timing.claims).toHaveLength(0);
  });

  it('lists the time claims in reading order', () => {
    const seconds = NOW / 1000;
    const timing = readTiming({ exp: seconds + 60, iat: seconds - 60, nbf: seconds - 30 }, NOW);
    expect(timing.claims.map((c) => c.key)).toEqual(['iat', 'nbf', 'exp']);
  });

  it('notes a claim that was sent in milliseconds', () => {
    const timing = readTiming({ exp: (NOW + 60_000) * 1 }, NOW);
    expect(timing.claims[0].wasMillis).toBe(true);
    expect(timing.state).toBe('valid');
  });

  it('ignores a payload that is not an object', () => {
    expect(readTiming('a string', NOW).state).toBe('none');
  });
});

describe('readRegisteredClaims', () => {
  it('spells out the identity claims that are present', () => {
    const claims = readRegisteredClaims({ iss: 'https://auth.example', sub: 'user-1', jti: 'abc', other: 1 });
    expect(claims.map((c) => c.key)).toEqual(['iss', 'sub', 'jti']);
    expect(claims[0].label).toBe('Issuer');
  });

  it('joins a list audience into one line', () => {
    expect(readRegisteredClaims({ aud: ['api', 'web'] })[0].value).toBe('api, web');
  });

  it('skips empty values and non-objects', () => {
    expect(readRegisteredClaims({ iss: '', sub: null })).toEqual([]);
    expect(readRegisteredClaims([1, 2])).toEqual([]);
  });
});

describe('describeAlgorithm', () => {
  it('warns loudly about alg none', () => {
    const note = describeAlgorithm('none', true);
    expect(note.tone).toBe('danger');
    expect(note.text).toMatch(/no signature at all/);
  });

  it('names the key type behind a normal algorithm', () => {
    expect(describeAlgorithm('HS256', false).text).toMatch(/shared secret/);
    expect(describeAlgorithm('RS512', false).text).toMatch(/RSA/);
    expect(describeAlgorithm('ES256', false).text).toMatch(/elliptic-curve/);
    expect(describeAlgorithm('EdDSA', false).text).toMatch(/EdDSA/);
  });

  it('flags a missing signature that the header did not expect', () => {
    expect(describeAlgorithm('HS256', true).tone).toBe('warn');
  });

  it('flags a header with no algorithm', () => {
    expect(describeAlgorithm(null, false).tone).toBe('warn');
  });
});
