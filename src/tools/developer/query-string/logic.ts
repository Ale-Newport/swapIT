/**
 * Query-string parsing and rebuilding. Handles the three shapes people actually
 * hit in the wild: repeated keys, `a[]=1` arrays and `a[b]=1` nesting.
 */

export interface QueryPair {
  key: string;
  value: string;
  /**
   * True when the key was written with no "=" at all, as in `?debug`. `debug`
   * and `debug=` are different strings, so rebuilding keeps them apart.
   */
  valueless?: boolean;
}

/**
 * Pull the query part out of whatever was pasted: a bare query string, one with
 * a leading `?`, a path with a query, or a whole URL. The fragment is dropped.
 */
export function extractQuery(input: string): string {
  let text = input.trim();
  if (!text) return '';

  // A URL or path with no "?" simply has no query — it is not itself one.
  const isLocation = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith('/') || text.startsWith('#');
  const questionMark = text.indexOf('?');
  if (questionMark >= 0) text = text.slice(questionMark + 1);
  else if (isLocation) return '';

  const hash = text.indexOf('#');
  if (hash >= 0) text = text.slice(0, hash);

  return text.replace(/^&+/, '');
}

/** Percent-decoding that never throws — malformed escapes survive as typed. */
export function safeDecode(text: string): string {
  const plussed = text.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plussed);
  } catch {
    return plussed;
  }
}

/** Split a query string into decoded key/value pairs, order preserved. */
export function parsePairs(query: string): QueryPair[] {
  const body = extractQuery(query);
  if (!body) return [];
  return body
    .split('&')
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const eq = chunk.indexOf('=');
      if (eq < 0) return { key: safeDecode(chunk), value: '', valueless: true };
      return { key: safeDecode(chunk.slice(0, eq)), value: safeDecode(chunk.slice(eq + 1)) };
    });
}

export interface BuildOptions {
  sortKeys?: boolean;
  /** Percent-encode keys and values. Off produces a readable, non-URL-safe string. */
  encode?: boolean;
  /** Prefix the result with "?". */
  leadingQuestionMark?: boolean;
}

export function buildQuery(pairs: QueryPair[], options: BuildOptions = {}): string {
  const { sortKeys = false, encode = true, leadingQuestionMark = false } = options;
  const usable = pairs.filter((p) => p.key.trim() !== '' || p.value !== '');
  const ordered = sortKeys
    ? [...usable].sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value))
    : usable;
  const encodePart = (s: string): string => (encode ? encodeURIComponent(s) : s);
  const body = ordered
    .map((p) => (p.valueless && p.value === '' ? encodePart(p.key) : `${encodePart(p.key)}=${encodePart(p.value)}`))
    .join('&');
  return body && leadingQuestionMark ? `?${body}` : body;
}

/** `a[b][]` → ["a", "b", ""] — an empty segment means "append to the array". */
export function keyPath(key: string): string[] {
  const match = /^([^[\]]*)((?:\[[^[\]]*\])+)$/.exec(key);
  if (!match) return [key];
  const path = [match[1]];
  const bracket = /\[([^[\]]*)\]/g;
  let found: RegExpExecArray | null;
  while ((found = bracket.exec(match[2])) !== null) path.push(found[1]);
  return path;
}

export type QueryValue = string | QueryValue[] | { [key: string]: QueryValue };

function isPlainObject(value: unknown): value is Record<string, QueryValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assign(container: Record<string, QueryValue>, path: string[], value: string): void {
  const [head, ...rest] = path;

  if (rest.length === 0) {
    const existing = container[head];
    if (existing === undefined) container[head] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else container[head] = [existing, value];
    return;
  }

  const next = rest[0];

  if (next === '') {
    const tail = rest.slice(1);
    const existing = container[head];
    const list: QueryValue[] = Array.isArray(existing) ? existing : existing === undefined ? [] : [existing];
    container[head] = list;
    if (tail.length === 0) {
      list.push(value);
    } else {
      // a[][b]=1 — each empty segment starts a fresh object in the list.
      const slot: Record<string, QueryValue> = {};
      assign(slot, tail, value);
      list.push(slot);
    }
    return;
  }

  const existing = container[head];
  const child: Record<string, QueryValue> = isPlainObject(existing) ? existing : {};
  container[head] = child;
  assign(child, rest, value);
}

/**
 * Fold flat pairs into the structure they describe: repeated keys become
 * arrays, `a[]` becomes an array and `a[b]` becomes a nested object.
 */
export function groupPairs(pairs: QueryPair[]): Record<string, QueryValue> {
  const out: Record<string, QueryValue> = {};
  for (const pair of pairs) assign(out, keyPath(pair.key), pair.value);
  return out;
}

/** Keys that appear more than once, in first-seen order. */
export function duplicateKeys(pairs: QueryPair[]): string[] {
  const seen = new Map<string, number>();
  for (const p of pairs) seen.set(p.key, (seen.get(p.key) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key);
}
