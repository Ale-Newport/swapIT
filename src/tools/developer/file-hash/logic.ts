export type AlgorithmId = 'md5' | 'sha1' | 'sha256' | 'sha512';

/** Shape returned by the Rust `hash_files` command. */
export interface FileHashes {
  path: string;
  name: string;
  size: number;
  md5?: string | null;
  sha1?: string | null;
  sha256?: string | null;
  sha512?: string | null;
}

export interface Algorithm {
  id: AlgorithmId;
  label: string;
  digits: number;
  secure: boolean;
}

export const ALGORITHMS: Algorithm[] = [
  { id: 'md5', label: 'MD5', digits: 32, secure: false },
  { id: 'sha1', label: 'SHA-1', digits: 40, secure: false },
  { id: 'sha256', label: 'SHA-256', digits: 64, secure: true },
  { id: 'sha512', label: 'SHA-512', digits: 128, secure: true },
];

const BY_DIGITS = new Map<number, AlgorithmId>(ALGORITHMS.map((a) => [a.digits, a.id]));

/** A digest's length gives its algorithm away. */
export function algorithmForDigest(digest: string): AlgorithmId | null {
  return BY_DIGITS.get(digest.trim().length) ?? null;
}

export function digestOf(file: FileHashes, algorithm: AlgorithmId): string | null {
  const value = file[algorithm];
  return typeof value === 'string' && value ? value : null;
}

export interface ExpectedEntry {
  digest: string;
  /** File name from the checksum line, when it carried one. */
  name: string | null;
  algorithm: AlgorithmId | null;
}

export interface ParsedExpected {
  entries: ExpectedEntry[];
  /** Lines that held no recognisable digest, kept so the UI can say so. */
  unreadable: string[];
}

const HEX = /^[0-9a-fA-F]+$/;
// `SHA256 (file.zip) = ab12…`, the format BSD's shasum -t prints.
const BSD = /^([A-Za-z0-9-]+)\s*\(([^)]*)\)\s*=\s*([0-9a-fA-F]+)$/;

function normaliseName(raw: string): string | null {
  const name = raw.trim().replace(/^\*/, '').replace(/^\\/, '').trim();
  return name === '' ? null : name;
}

/**
 * Read whatever the user pasted: a bare digest, a `shasum` line
 * (`<digest>  file`), the binary-mode variant (`<digest> *file`), a BSD
 * `SHA256 (file) = <digest>` line, or several of those at once.
 */
export function parseExpected(text: string): ParsedExpected {
  const entries: ExpectedEntry[] = [];
  const unreadable: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const bsd = BSD.exec(trimmed);
    if (bsd) {
      const named = bsd[1].toLowerCase().replace(/-/g, '');
      const algorithm = ALGORITHMS.find((a) => a.id === named)?.id ?? algorithmForDigest(bsd[3]);
      entries.push({ digest: bsd[3].toLowerCase(), name: normaliseName(bsd[2]), algorithm });
      continue;
    }

    const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
    const index = tokens.findIndex((token) => HEX.test(token) && BY_DIGITS.has(token.length));
    if (index === -1) {
      unreadable.push(trimmed);
      continue;
    }
    const digest = tokens[index].toLowerCase();
    const rest = [...tokens.slice(0, index), ...tokens.slice(index + 1)].join(' ');
    entries.push({ digest, name: normaliseName(rest), algorithm: algorithmForDigest(digest) });
  }

  return { entries, unreadable };
}

/** Compare only the file name, so a pasted line from another machine still matches. */
export function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

export type Verdict = 'match' | 'mismatch' | 'unchecked';

export interface VerifyRow {
  file: FileHashes;
  verdict: Verdict;
  expected: string | null;
  actual: string | null;
  algorithm: AlgorithmId | null;
  /** Why a row could not be checked, in plain words. */
  note?: string;
}

export interface VerifySummary {
  matched: number;
  mismatched: number;
  unchecked: number;
}

/**
 * Line up each hashed file with the expected digests. A single digest with no
 * file name is checked against every file; named lines are matched by file name.
 */
export function verifyFiles(files: FileHashes[], expectedText: string): VerifyRow[] {
  const { entries } = parseExpected(expectedText);
  const loose = entries.length === 1 && entries[0].name === null ? entries[0] : null;
  const byName = new Map<string, ExpectedEntry>();
  for (const entry of entries) {
    if (entry.name) byName.set(baseName(entry.name).toLowerCase(), entry);
  }

  return files.map((file) => {
    const entry = byName.get(file.name.toLowerCase()) ?? loose ?? null;
    if (!entry) {
      return {
        file,
        verdict: 'unchecked',
        expected: null,
        actual: null,
        algorithm: null,
        note: 'No expected hash mentions this file.',
      };
    }
    const algorithm = entry.algorithm;
    if (!algorithm) {
      return {
        file,
        verdict: 'unchecked',
        expected: entry.digest,
        actual: null,
        algorithm: null,
        note: `A ${entry.digest.length}-character value is not an MD5, SHA-1, SHA-256 or SHA-512 digest.`,
      };
    }
    const actual = digestOf(file, algorithm);
    if (!actual) {
      const label = ALGORITHMS.find((a) => a.id === algorithm)?.label ?? algorithm;
      return {
        file,
        verdict: 'unchecked',
        expected: entry.digest,
        actual: null,
        algorithm,
        note: `That looks like a ${label} hash. Turn ${label} on and run again to check it.`,
      };
    }
    return {
      file,
      verdict: actual.toLowerCase() === entry.digest ? 'match' : 'mismatch',
      expected: entry.digest,
      actual,
      algorithm,
    };
  });
}

export function summarise(rows: VerifyRow[]): VerifySummary {
  return {
    matched: rows.filter((r) => r.verdict === 'match').length,
    mismatched: rows.filter((r) => r.verdict === 'mismatch').length,
    unchecked: rows.filter((r) => r.verdict === 'unchecked').length,
  };
}

/** `shasum`-compatible text: two spaces between the digest and the file name. */
export function checksumFile(files: FileHashes[], algorithm: AlgorithmId): string {
  return files
    .map((file) => {
      const digest = digestOf(file, algorithm);
      return digest ? `${digest}  ${file.name}` : null;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** Everything computed, for the clipboard. */
export function fullReport(files: FileHashes[], algorithms: AlgorithmId[]): string {
  return files
    .map((file) => {
      const lines = algorithms
        .map((id) => {
          const digest = digestOf(file, id);
          const label = ALGORITHMS.find((a) => a.id === id)?.label ?? id;
          return digest ? `  ${label.padEnd(8)} ${digest}` : null;
        })
        .filter((line): line is string => line !== null);
      return [file.name, ...lines].join('\n');
    })
    .join('\n\n');
}
