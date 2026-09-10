/** Mirrors `FileHashes` in `src-tauri/src/cmd/hashing.rs`. */
export interface FileHashes {
  path: string;
  name: string;
  size: number;
  md5?: string | null;
  sha1?: string | null;
  sha256?: string | null;
  sha512?: string | null;
}

export type Algorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

export interface AlgorithmSpec {
  value: Algorithm;
  label: string;
  /** Hex characters a digest of this algorithm has. */
  length: number;
  note: string;
}

export const ALGORITHMS: AlgorithmSpec[] = [
  { value: 'sha256', label: 'SHA-256', length: 64, note: 'The default for downloads and releases' },
  { value: 'sha512', label: 'SHA-512', length: 128, note: 'Longer digest, same guarantee' },
  { value: 'sha1', label: 'SHA-1', length: 40, note: 'Still common in Git and older projects' },
  { value: 'md5', label: 'MD5', length: 32, note: 'Fine for typo checks, not for security' },
];

const BY_LENGTH = new Map<number, Algorithm>(ALGORITHMS.map((a) => [a.length, a.value]));

export function digestOf(hashes: FileHashes, algorithm: Algorithm): string | null {
  return hashes[algorithm] ?? null;
}

export function algorithmLabel(algorithm: Algorithm): string {
  return ALGORITHMS.find((a) => a.value === algorithm)?.label ?? algorithm.toUpperCase();
}

/**
 * Pull a digest out of whatever the user pasted. Publishers write checksums in
 * a dozen shapes — `sha256sum` output, BSD `SHA256 (file) = …`, a bare digest,
 * or one broken into readable groups — and all of them should just work.
 */
export function extractDigest(raw: string): string | null {
  if (!raw) return null;
  for (const match of raw.matchAll(/[0-9a-fA-F]{16,128}/g)) {
    const candidate = match[0];
    if (BY_LENGTH.has(candidate.length)) return candidate.toLowerCase();
  }
  // Nothing contiguous matched: the digest may be printed in spaced groups.
  const compact = raw.replace(/[^0-9a-fA-F]/g, '');
  if (BY_LENGTH.has(compact.length)) return compact.toLowerCase();
  return null;
}

/** Which algorithm produced a digest, judged by its length. */
export function algorithmForDigest(digest: string | null): Algorithm | null {
  if (!digest) return null;
  return BY_LENGTH.get(digest.length) ?? null;
}

export type Verdict = 'match' | 'mismatch' | 'unknown';

/** Compare one file's digest against the expected one. */
export function verdictFor(hashes: FileHashes, algorithm: Algorithm, expected: string | null): Verdict {
  if (!expected) return 'unknown';
  const actual = digestOf(hashes, algorithm);
  if (!actual) return 'unknown';
  return actual.toLowerCase() === expected.toLowerCase() ? 'match' : 'mismatch';
}

export function matchingFile(results: FileHashes[], algorithm: Algorithm, expected: string | null): FileHashes | null {
  if (!expected) return null;
  return results.find((r) => verdictFor(r, algorithm, expected) === 'match') ?? null;
}

/** `sha256sum` output — the format people paste back into a terminal. */
export function checksumFileText(results: FileHashes[], algorithm: Algorithm): string {
  return results
    .map((r) => ({ digest: digestOf(r, algorithm), name: r.name }))
    .filter((r): r is { digest: string; name: string } => Boolean(r.digest))
    .map((r) => `${r.digest}  ${r.name}`)
    .join('\n');
}

/** Digest split into readable groups, for the side-by-side comparison. */
export function groupDigest(digest: string, size = 8): string {
  return digest.replace(new RegExp(`.{1,${size}}`, 'g'), '$& ').trim();
}

/** Index of the first character where two digests diverge, or -1 when equal. */
export function firstDifference(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    if (left[i] !== right[i]) return i;
  }
  return left.length === right.length ? -1 : len;
}
