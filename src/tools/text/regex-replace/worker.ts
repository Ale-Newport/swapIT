import { applyReplace, buildRegex, scanMatches, unescapeReplacement, type RegexMatch } from './logic';

/**
 * Runs the user's pattern off the UI thread.
 *
 * A JavaScript regular expression cannot be interrupted once `exec` starts, and
 * a pattern with a nested quantifier — `(a+)+$` — takes exponential time: about
 * three seconds on thirty characters, minutes on forty. Run on the main thread
 * that is a frozen window with no way to cancel or even clear the input. Here
 * the page stays responsive and can terminate the worker instead.
 */

export interface RegexRequest {
  id: number;
  input: string;
  pattern: string;
  flags: string;
  replacement: string;
  expandEscapes: boolean;
}

export type RegexResponse =
  | { id: number; ok: true; output: string; matches: RegexMatch[]; total: number; truncated: boolean }
  | { id: number; ok: false; message: string };

/** How many matches the table shows; the rest are only counted. */
export const MATCH_LIMIT = 20;

/** The worker globals this file uses; the project's lib list is DOM-only. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<RegexRequest>) => void) | null;
  postMessage(message: RegexResponse): void;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = (event: MessageEvent<RegexRequest>) => {
  const { id, input, pattern, flags, replacement, expandEscapes } = event.data;
  let response: RegexResponse;
  try {
    const re = buildRegex(pattern, flags);
    const scan = scanMatches(re, input, MATCH_LIMIT);
    const output = applyReplace(re, input, expandEscapes ? unescapeReplacement(replacement) : replacement);
    response = { id, ok: true, output, matches: scan.matches, total: scan.total, truncated: scan.truncated };
  } catch (err) {
    response = { id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  ctx.postMessage(response);
};
