/**
 * Percent-encoding, and the three flavours people actually mean by "URL encode":
 * a single value (`encodeURIComponent`), a whole address (`encodeURI`) and a
 * form field (`application/x-www-form-urlencoded`, where a space is `+`).
 */

export type UrlMode = 'component' | 'uri' | 'decode';

const HEX = /^[0-9a-fA-F]$/;

/** Escape one character as upper-case percent escapes of its UTF-8 bytes. */
function percentEscape(char: string): string {
  return [...new TextEncoder().encode(char)]
    .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('');
}

/** One value inside a query string or a path segment. */
export function encodeComponent(text: string): string {
  return encodeURIComponent(text);
}

/**
 * A whole address: the structural characters (`: / ? # & = @ + $ , ;`) survive,
 * everything else that is not URL-safe is escaped.
 */
export function encodeFullUri(text: string): string {
  return encodeURI(text);
}

/**
 * `application/x-www-form-urlencoded`. The set kept unescaped is
 * `A-Z a-z 0-9 * - . _`, a space becomes `+`, and everything else is escaped —
 * which is exactly what `URLSearchParams` produces.
 */
export function encodeForm(text: string): string {
  return encodeURIComponent(text)
    .replace(/%20/g, '+')
    .replace(/[!'()~]/g, percentEscape);
}

const ENCODERS: Record<'component' | 'uri' | 'form', (text: string) => string> = {
  component: encodeComponent,
  uri: encodeFullUri,
  form: encodeForm,
};

/**
 * Encode, turning the platform's `URIError` on an unpaired surrogate into a
 * sentence. Unpaired surrogates arrive from files and broken exports, never
 * from typing, and no encoder can represent them.
 */
export function encodeUrl(text: string, variant: 'component' | 'uri' | 'form'): string {
  try {
    return ENCODERS[variant](text);
  } catch {
    throw new Error(
      'This text contains an unpaired surrogate (half of a character such as an emoji), which has no UTF-8 form and cannot be percent-encoded. Remove or repair that character and try again.',
    );
  }
}

export interface DecodeProblem {
  /** Character offset of the escape that fails. */
  index: number;
  /** The offending run, e.g. `%zz` or `%C3%28`. */
  snippet: string;
  reason: string;
}

/**
 * `decodeURIComponent` throws a bare "URI malformed" with no hint of where.
 * This finds the first escape it will choke on — either a `%` that is not
 * followed by two hex digits, or a run of escapes that does not spell valid
 * UTF-8 — so the message can point at it.
 */
export function findDecodeProblem(text: string): DecodeProblem | null {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '%') continue;
    const first = text[i + 1] ?? '';
    const second = text[i + 2] ?? '';
    if (!HEX.test(first) || !HEX.test(second)) {
      return {
        index: i,
        snippet: text.slice(i, i + 3),
        reason:
          'A “%” must be followed by two hexadecimal digits, like %20 for a space. Write a literal percent sign as %25.',
      };
    }
    const bytes: number[] = [];
    let j = i;
    while (text[j] === '%' && HEX.test(text[j + 1] ?? '') && HEX.test(text[j + 2] ?? '')) {
      bytes.push(parseInt(text.slice(j + 1, j + 3), 16));
      j += 3;
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      return {
        index: i,
        snippet: text.slice(i, j),
        reason:
          'These escapes do not spell valid UTF-8. A byte above %7F only means something as part of a multi-byte sequence — %C3%A9 is “é”, %C3 on its own is nothing.',
      };
    }
    i = j - 1;
  }
  return null;
}

/**
 * Decode percent-escapes. Throws an `Error` naming the exact sequence that is
 * wrong rather than the platform's opaque "URI malformed".
 */
export function decodeUrl(text: string, plusAsSpace: boolean): string {
  const prepared = plusAsSpace ? text.replace(/\+/g, ' ') : text;
  const problem = findDecodeProblem(prepared);
  if (problem) {
    throw new Error(
      `“${problem.snippet}” at character ${problem.index + 1} is not a valid escape. ${problem.reason}`,
    );
  }
  try {
    return decodeURIComponent(prepared);
  } catch {
    // Everything findDecodeProblem knows about is handled above; this is the
    // belt-and-braces branch for anything else the platform rejects.
    throw new Error(
      'This text contains a percent-escape that cannot be decoded. Check that every “%” is followed by two hexadecimal digits.',
    );
  }
}

/**
 * How many characters this encoder had to change — the useful "how much of my
 * text became escapes" number. Counts by code point, so an emoji counts once.
 */
export function escapedCount(original: string, encode: (text: string) => string): number {
  let count = 0;
  for (const char of original) {
    try {
      if (encode(char) !== char) count += 1;
    } catch {
      count += 1;
    }
  }
  return count;
}

/** True when the decoded text still holds escapes — the classic double-encoded paste. */
export function looksDoubleEncoded(decoded: string): boolean {
  return /%[0-9a-fA-F]{2}/.test(decoded);
}
