/**
 * URL parsing and rebuilding. `new URL()` does the parsing; rebuilding is done
 * by hand so that editing one part never rewrites the others (setting
 * `url.protocol` on a special scheme, for instance, silently refuses).
 */

export interface UrlParts {
  /** Scheme without the colon, e.g. "https". */
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  /** Query without the leading "?". */
  search: string;
  /** Fragment without the leading "#". */
  hash: string;
  /** False for schemes written without "//", such as mailto: */
  slashes: boolean;
}

export const EMPTY_PARTS: UrlParts = {
  protocol: 'https',
  username: '',
  password: '',
  hostname: '',
  port: '',
  pathname: '',
  search: '',
  hash: '',
  slashes: true,
};

/** Percent-decoding that leaves malformed escapes visible instead of throwing. */
export function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function parseUrl(input: string): UrlParts {
  const text = input.trim();
  if (!text) throw new Error('Paste a URL to take it apart.');

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      throw new Error(`"${text}" has no scheme. A URL needs one — try https://${text.replace(/^\/+/, '')}`);
    }
    throw new Error(`"${text}" could not be parsed. Check for stray spaces, quotes or a missing "//" after the scheme.`);
  }

  const afterScheme = text.slice(text.indexOf(':') + 1);

  return {
    protocol: url.protocol.replace(/:$/, ''),
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search.replace(/^\?/, ''),
    hash: url.hash.replace(/^#/, ''),
    slashes: afterScheme.startsWith('//'),
  };
}

export function buildUrl(parts: UrlParts): string {
  const scheme = parts.protocol.replace(/:+$/, '').trim();
  let out = scheme ? `${scheme}:` : '';
  if (parts.slashes) out += '//';

  if (parts.username || parts.password) {
    out += parts.username;
    if (parts.password) out += `:${parts.password}`;
    out += '@';
  }

  out += parts.hostname;
  if (parts.port) out += `:${parts.port}`;

  if (parts.pathname) out += parts.hostname && !parts.pathname.startsWith('/') ? `/${parts.pathname}` : parts.pathname;
  if (parts.search) out += `?${parts.search.replace(/^\?/, '')}`;
  if (parts.hash) out += `#${parts.hash.replace(/^#/, '')}`;

  return out;
}

/** Non-empty path segments, decoded for display. */
export function segments(pathname: string): string[] {
  return pathname
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(decodeSafe);
}

export interface Param {
  key: string;
  value: string;
  /**
   * True when the query wrote the key with no "=" at all, as in `?flag`.
   * `?flag` and `?flag=` are different strings, and rebuilding must not turn
   * one into the other behind the user's back.
   */
  valueless?: boolean;
}

/** Decoded query parameters, order preserved, duplicates kept. */
export function parseParams(search: string): Param[] {
  const body = search.replace(/^\?/, '');
  if (!body) return [];
  return body
    .split('&')
    .filter(Boolean)
    .map((chunk) => {
      const eq = chunk.indexOf('=');
      const key = eq < 0 ? chunk : chunk.slice(0, eq);
      const value = eq < 0 ? '' : chunk.slice(eq + 1);
      const param: Param = {
        key: decodeSafe(key.replace(/\+/g, ' ')),
        value: decodeSafe(value.replace(/\+/g, ' ')),
      };
      if (eq < 0) param.valueless = true;
      return param;
    });
}

export function buildParams(params: Param[]): string {
  return params
    .filter((p) => p.key.trim() !== '' || p.value !== '')
    .map((p) =>
      p.valueless && p.value === ''
        ? encodeURIComponent(p.key)
        : `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`,
    )
    .join('&');
}

export function origin(parts: UrlParts): string {
  if (!parts.hostname) return '';
  return `${parts.protocol}://${parts.hostname}${parts.port ? `:${parts.port}` : ''}`;
}

export function host(parts: UrlParts): string {
  return parts.port ? `${parts.hostname}:${parts.port}` : parts.hostname;
}

const DEFAULT_PORTS: Record<string, string> = {
  http: '80',
  https: '443',
  ws: '80',
  wss: '443',
  ftp: '21',
};

/** The port a client would use when none is written, or null when unknown. */
export function defaultPort(protocol: string): string | null {
  return DEFAULT_PORTS[protocol.toLowerCase()] ?? null;
}

export function isIpHost(hostname: string): boolean {
  if (/^\[[0-9a-f:]+\]$/i.test(hostname)) return true;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && hostname.split('.').every((n) => Number(n) <= 255);
}

/** "docs.example.co.uk" → "example.co.uk" is out of scope; this is the plain label split. */
export function hostLabels(hostname: string): string[] {
  return hostname ? hostname.split('.').filter(Boolean) : [];
}
