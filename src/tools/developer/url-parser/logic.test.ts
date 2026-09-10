import { describe, it, expect } from 'vitest';
import {
  buildParams,
  buildUrl,
  decodeSafe,
  defaultPort,
  host,
  isIpHost,
  origin,
  parseParams,
  parseUrl,
  segments,
} from './logic';

const FULL = 'https://user:s3cret@api.example.com:8443/v2/orders%20list/42?status=open&tag=a#details';

describe('parseUrl', () => {
  it('breaks a full URL into every part', () => {
    expect(parseUrl(FULL)).toEqual({
      protocol: 'https',
      username: 'user',
      password: 's3cret',
      hostname: 'api.example.com',
      port: '8443',
      pathname: '/v2/orders%20list/42',
      search: 'status=open&tag=a',
      hash: 'details',
      slashes: true,
    });
  });

  it('handles a scheme written without slashes', () => {
    const parts = parseUrl('mailto:hi@example.com');
    expect(parts.protocol).toBe('mailto');
    expect(parts.slashes).toBe(false);
    expect(parts.pathname).toBe('hi@example.com');
  });

  it('leaves empty parts empty', () => {
    const parts = parseUrl('https://example.com');
    expect(parts.port).toBe('');
    expect(parts.search).toBe('');
    expect(parts.hash).toBe('');
    expect(parts.pathname).toBe('/');
  });

  it('says a scheme is required', () => {
    expect(() => parseUrl('example.com/page')).toThrow('"example.com/page" has no scheme. A URL needs one — try https://example.com/page');
    expect(() => parseUrl('   ')).toThrow('Paste a URL to take it apart.');
    expect(() => parseUrl('https://exa mple.com')).toThrow(/could not be parsed/);
  });
});

describe('buildUrl', () => {
  it('round trips a full URL', () => {
    expect(buildUrl(parseUrl(FULL))).toBe(FULL);
  });

  it('round trips the simple cases', () => {
    for (const url of [
      'https://example.com/',
      'http://localhost:3000/api?x=1',
      'ftp://files.example.org/pub/readme.txt',
      'mailto:hi@example.com',
      'https://example.com/#top',
    ]) {
      expect(buildUrl(parseUrl(url))).toBe(url);
    }
  });

  it('reflects an edited part', () => {
    const parts = parseUrl('https://example.com/a?x=1');
    expect(buildUrl({ ...parts, hostname: 'other.test', port: '8080' })).toBe('https://other.test:8080/a?x=1');
    expect(buildUrl({ ...parts, search: '' })).toBe('https://example.com/a');
    expect(buildUrl({ ...parts, protocol: 'http' })).toBe('http://example.com/a?x=1');
  });

  it('keeps a path slash-separated from the host', () => {
    const parts = { ...parseUrl('https://example.com/'), pathname: 'docs/intro' };
    expect(buildUrl(parts)).toBe('https://example.com/docs/intro');
  });

  it('writes credentials only when present', () => {
    const parts = parseUrl('https://example.com/');
    expect(buildUrl({ ...parts, username: 'bob' })).toBe('https://bob@example.com/');
    expect(buildUrl({ ...parts, username: 'bob', password: 'pw' })).toBe('https://bob:pw@example.com/');
  });
});

describe('query parameters', () => {
  it('decodes keys and values', () => {
    expect(parseParams('?q=hello+world&city=S%C3%A3o%20Paulo&flag')).toEqual([
      { key: 'q', value: 'hello world' },
      { key: 'city', value: 'São Paulo' },
      { key: 'flag', value: '', valueless: true },
    ]);
    expect(parseParams('')).toEqual([]);
  });

  it('tells a bare key apart from one with an empty value', () => {
    expect(parseParams('flag')).toEqual([{ key: 'flag', value: '', valueless: true }]);
    expect(parseParams('flag=')).toEqual([{ key: 'flag', value: '' }]);
  });

  it('re-encodes on the way out', () => {
    expect(buildParams([{ key: 'q', value: 'hello world' }])).toBe('q=hello%20world');
    expect(buildParams([{ key: '', value: '' }])).toBe('');
    expect(parseParams(buildParams(parseParams('a=1&a=2&b=x%26y')))).toEqual([
      { key: 'a', value: '1' },
      { key: 'a', value: '2' },
      { key: 'b', value: 'x&y' },
    ]);
  });

  it('rebuilds a bare key without adding an equals sign', () => {
    expect(buildParams(parseParams('flag&b=1'))).toBe('flag&b=1');
    expect(buildParams(parseParams('flag=&b=1'))).toBe('flag=&b=1');
    // A value typed into a bare key makes it an ordinary pair again.
    expect(buildParams([{ key: 'flag', value: 'on', valueless: true }])).toBe('flag=on');
  });

  it('leaves an untouched query alone when another part is edited', () => {
    const parts = parseUrl('https://x.com/a?flag&b=1');
    expect(buildUrl({ ...parts, port: '8080' })).toBe('https://x.com:8080/a?flag&b=1');
  });
});

describe('helpers', () => {
  it('decodes path segments', () => {
    expect(segments('/v2/orders%20list/42')).toEqual(['v2', 'orders list', '42']);
    expect(segments('/')).toEqual([]);
    expect(decodeSafe('100%')).toBe('100%');
  });

  it('composes origin and host', () => {
    const parts = parseUrl(FULL);
    expect(origin(parts)).toBe('https://api.example.com:8443');
    expect(host(parts)).toBe('api.example.com:8443');
    expect(origin({ ...parts, hostname: '' })).toBe('');
  });

  it('knows the default ports', () => {
    expect(defaultPort('https')).toBe('443');
    expect(defaultPort('HTTP')).toBe('80');
    expect(defaultPort('gopher')).toBeNull();
  });

  it('spots IP hosts', () => {
    expect(isIpHost('192.168.1.1')).toBe(true);
    expect(isIpHost('999.1.1.1')).toBe(false);
    expect(isIpHost('[::1]')).toBe(true);
    expect(isIpHost('example.com')).toBe(false);
  });
});
