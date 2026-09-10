export type AlgorithmId = 'md5' | 'sha1' | 'sha256' | 'sha512';
export type LineEndings = 'as-is' | 'lf' | 'crlf';

export interface Algorithm {
  id: AlgorithmId;
  label: string;
  /** Hex characters a digest of this algorithm always has. */
  digits: number;
  bits: number;
  note: string;
  secure: boolean;
}

export const ALGORITHMS: Algorithm[] = [
  {
    id: 'md5',
    label: 'MD5',
    digits: 32,
    bits: 128,
    note: 'Broken for security — collisions are cheap. Fine as a checksum, never for passwords or signatures.',
    secure: false,
  },
  {
    id: 'sha1',
    label: 'SHA-1',
    digits: 40,
    bits: 160,
    note: 'Retired for security since 2017. Still seen in Git object ids and old checksums.',
    secure: false,
  },
  {
    id: 'sha256',
    label: 'SHA-256',
    digits: 64,
    bits: 256,
    note: 'The usual choice for checksums, signatures and content addressing.',
    secure: true,
  },
  {
    id: 'sha512',
    label: 'SHA-512',
    digits: 128,
    bits: 512,
    note: 'Same family as SHA-256 with a wider digest; faster than SHA-256 on 64-bit machines.',
    secure: true,
  },
];

export interface TextOptions {
  lineEndings: LineEndings;
  trailingNewline: boolean;
}

/**
 * Two invisible details decide whether a hash matches the one someone else got:
 * how the lines end, and whether the text finishes with a newline. `echo hello |
 * shasum` hashes six bytes, not five.
 */
export function prepareText(text: string, options: TextOptions): string {
  let out = text;
  if (options.lineEndings === 'lf') out = out.replace(/\r\n/g, '\n');
  if (options.lineEndings === 'crlf') out = out.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  if (options.trailingNewline) {
    const ending = options.lineEndings === 'crlf' ? '\r\n' : '\n';
    if (!out.endsWith(ending)) out += ending;
  }
  return out;
}

/** Bytes on the wire, which is what a hash actually consumes. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatDigest(hex: string, uppercase: boolean): string {
  return uppercase ? hex.toUpperCase() : hex.toLowerCase();
}

/** One line summarising every digest, for the "copy all" button. */
export function digestReport(
  digests: Partial<Record<AlgorithmId, string>>,
  uppercase: boolean,
): string {
  return ALGORITHMS.filter((a) => digests[a.id])
    .map((a) => `${a.label.padEnd(8)} ${formatDigest(digests[a.id] as string, uppercase)}`)
    .join('\n');
}
