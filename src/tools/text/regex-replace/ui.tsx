import { useCallback, useEffect, useRef, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Badge, Checkbox, Field, Input, Textarea } from '@/components/ui';
import {
  LARGE_INPUT,
  applyReplace,
  buildRegex,
  hasNestedQuantifier,
  scanMatches,
  unescapeReplacement,
  type RegexMatch,
} from './logic';
import { MATCH_LIMIT, type RegexRequest, type RegexResponse } from './worker';

const FLAGS: Array<{ flag: string; label: string; hint: string }> = [
  { flag: 'g', label: 'g', hint: 'Global — replace every match, not just the first' },
  { flag: 'i', label: 'i', hint: 'Ignore case' },
  { flag: 'm', label: 'm', hint: 'Multiline — ^ and $ match at every line' },
  { flag: 's', label: 's', hint: 'Dot matches newlines too' },
  { flag: 'u', label: 'u', hint: 'Unicode — enables \\p{…} classes' },
];

/** Long enough for any reasonable pattern, short enough to stay honest. */
const TIMEOUT_MS = 3000;
/** Typing settles before the pattern runs, so a keystroke never queues work. */
const DEBOUNCE_MS = 120;

const TIMEOUT_MESSAGE =
  `This pattern was still running after ${TIMEOUT_MS / 1000} seconds, so it was stopped. ` +
  'A quantifier inside another quantifier — (a+)+ — makes the engine try every way of splitting the text, ' +
  'and that work doubles with each extra character. Rewrite it without the nested quantifier, or run it on a shorter excerpt.';

const NO_WORKER_MESSAGE =
  'This pattern nests one quantifier inside another — (a+)+ — which can run for hours on a long line, and this ' +
  'build cannot run it in the background where it could be stopped. Rewrite the pattern without the nested quantifier.';

interface Request {
  input: string;
  pattern: string;
  flags: string;
  replacement: string;
  expandEscapes: boolean;
}

interface Outcome {
  request: Request;
  output: string;
  matches: RegexMatch[];
  total: number;
  truncated: boolean;
  /** Set when the pattern could not be run to completion. */
  error?: string;
}

function sameRequest(a: Request, b: Request): boolean {
  return (
    a.pattern === b.pattern &&
    a.flags === b.flags &&
    a.replacement === b.replacement &&
    a.expandEscapes === b.expandEscapes &&
    a.input === b.input
  );
}

function blank(request: Request): Outcome {
  return { request, output: '', matches: [], total: 0, truncated: false };
}

/** Whitespace matches would look like empty rows in the table otherwise. */
function visible(text: string): string {
  return text.replace(/\n/g, '⏎').replace(/\t/g, '⇥');
}

export default function RegexReplace() {
  const [pattern, setPattern] = useState('');
  const [replacement, setReplacement] = useState('');
  const [flags, setFlags] = useState<string[]>(['g']);
  const [expandEscapes, setExpandEscapes] = useState(true);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const worker = useRef<Worker | null>(null);
  const noWorker = useRef(false);
  const job = useRef<{ id: number; request: Request; timer: number } | null>(null);
  const queued = useRef<{ request: Request; timer: number } | null>(null);
  const nextId = useRef(0);

  const flagString = FLAGS.filter((f) => flags.includes(f.flag))
    .map((f) => f.flag)
    .join('');

  const toggleFlag = (flag: string, on: boolean) =>
    setFlags((current) => (on ? [...current, flag] : current.filter((f) => f !== flag)));

  const stopWorker = useCallback(() => {
    if (job.current) {
      window.clearTimeout(job.current.timer);
      job.current = null;
    }
    worker.current?.terminate();
    worker.current = null;
  }, []);

  useEffect(
    () => () => {
      if (queued.current) window.clearTimeout(queued.current.timer);
      queued.current = null;
      stopWorker();
    },
    [stopWorker],
  );

  /** Last resort: with no worker, only patterns that cannot run away are run. */
  const runHere = useCallback((request: Request): Outcome => {
    if (hasNestedQuantifier(request.pattern)) return { ...blank(request), error: NO_WORKER_MESSAGE };
    try {
      const re = buildRegex(request.pattern, request.flags);
      const scan = scanMatches(re, request.input, MATCH_LIMIT);
      const replacement = request.expandEscapes ? unescapeReplacement(request.replacement) : request.replacement;
      return {
        request,
        output: applyReplace(re, request.input, replacement),
        matches: scan.matches,
        total: scan.total,
        truncated: scan.truncated,
      };
    } catch (err) {
      return { ...blank(request), error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  /** Hand the pattern to the worker; false when no worker could be started. */
  const runInWorker = useCallback(
    (request: Request): boolean => {
      // A worker runs one thing at a time, so a job still in flight is either
      // about to answer or is the runaway that has to be thrown away.
      if (job.current) stopWorker();
      if (!worker.current) {
        try {
          const instance = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
          instance.onmessage = (event: MessageEvent<RegexResponse>) => {
            const current = job.current;
            const data = event.data;
            if (!current || current.id !== data.id) return;
            window.clearTimeout(current.timer);
            job.current = null;
            setOutcome(
              data.ok
                ? {
                    request: current.request,
                    output: data.output,
                    matches: data.matches,
                    total: data.total,
                    truncated: data.truncated,
                  }
                : { ...blank(current.request), error: data.message },
            );
          };
          instance.onerror = () => {
            const pending = job.current?.request;
            stopWorker();
            noWorker.current = true;
            if (pending) setOutcome(runHere(pending));
          };
          worker.current = instance;
        } catch {
          noWorker.current = true;
          return false;
        }
      }

      const id = (nextId.current += 1);
      const timer = window.setTimeout(() => {
        stopWorker();
        setOutcome({ ...blank(request), error: TIMEOUT_MESSAGE });
      }, TIMEOUT_MS);
      job.current = { id, request, timer };
      const message: RegexRequest = { id, ...request };
      worker.current.postMessage(message);
      return true;
    },
    [runHere, stopWorker],
  );

  /**
   * Queue a run for text the panes are showing but have no answer for.
   *
   * The input lives inside TextTool, so this is driven from the render that
   * discovers the new text rather than from an effect of this component, which
   * a keystroke does not re-run. All that happens here is arming a timer, and
   * the next keystroke disarms it again.
   */
  const requestRun = useCallback(
    (next: Request) => {
      if (queued.current && sameRequest(queued.current.request, next)) return;
      if (job.current && sameRequest(job.current.request, next)) return;
      if (queued.current) window.clearTimeout(queued.current.timer);
      const timer = window.setTimeout(() => {
        queued.current = null;
        if (noWorker.current || !runInWorker(next)) setOutcome(runHere(next));
      }, DEBOUNCE_MS);
      queued.current = { request: next, timer };
    },
    [runHere, runInWorker],
  );

  const answerFor = useCallback(
    (next: Request): Outcome | null => (outcome && sameRequest(outcome.request, next) ? outcome : null),
    [outcome],
  );

  const transform = useCallback(
    (input: string): TextTransformResult => {
      if (!pattern) return { output: input, stats: [{ label: 'Matches', value: '0' }] };
      // Compiling the pattern reports a syntax error without running anything.
      buildRegex(pattern, flagString);
      const next: Request = { input, pattern, flags: flagString, replacement, expandEscapes };

      const done = answerFor(next);
      if (!done) {
        requestRun(next);
        return { output: '', stats: [{ label: 'Matches', value: '…' }] };
      }
      if (done.error) throw new Error(done.error);

      const warnings: string[] = [];
      if (input.length > LARGE_INPUT) {
        warnings.push(
          `This text is ${input.length.toLocaleString()} characters. A pattern with nested quantifiers such as (a+)+ can take a very long time on input this size — keep it simple or work on a smaller excerpt.`,
        );
      }
      if (done.truncated) warnings.push('Only the first 100,000 matches were counted.');
      if (done.total > 0 && !flagString.includes('g')) {
        warnings.push('Without the g flag only the first match is replaced.');
      }
      return {
        output: done.output,
        warning: warnings.length ? warnings.join(' ') : undefined,
        stats: [
          { label: 'Matches', value: done.total.toLocaleString() },
          { label: 'Characters', value: done.output.length.toLocaleString() },
        ],
      };
    },
    [pattern, flagString, replacement, expandEscapes, answerFor, requestRun],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Text"
      outputLabel="Result"
      placeholder="Paste the text to search…"
      sampleText={'2024-01-15 ERROR disk full\n2024-02-03 WARN retrying\n2024-02-04 ERROR timeout'}
      options={
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pattern" hint="JavaScript regular expression, without the slashes">
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="(\d{4})-(\d{2})-(\d{2})"
                className="font-mono"
                spellCheck={false}
              />
            </Field>
            <Field label="Replacement" hint="$1, $2… insert capture groups; $& the whole match">
              <Input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="$3/$2/$1"
                className="font-mono"
                spellCheck={false}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-[12px] font-medium text-ink-soft">Flags</span>
            {FLAGS.map((f) => (
              <span key={f.flag} title={f.hint}>
                <Checkbox
                  checked={flags.includes(f.flag)}
                  onCheckedChange={(on) => toggleFlag(f.flag, on)}
                  label={<span className="font-mono">{f.label}</span>}
                />
              </span>
            ))}
            <Checkbox
              checked={expandEscapes}
              onCheckedChange={setExpandEscapes}
              label={
                <span>
                  Read <span className="font-mono">\n</span> and <span className="font-mono">\t</span> in the
                  replacement
                </span>
              }
            />
          </div>
        </div>
      }
      renderOutput={(_output, input) => {
        if (!input) return <p className="text-[12.5px] text-ink-faint">Paste some text to run the pattern over it.</p>;
        if (!pattern) {
          return (
            <div className="space-y-3">
              <Textarea value={input} readOnly rows={10} className="w-full bg-canvas" />
              <p className="text-[11.5px] text-ink-faint">Enter a pattern to see the matches it finds.</p>
            </div>
          );
        }
        const scan = answerFor({ input, pattern, flags: flagString, replacement, expandEscapes });
        return (
          <div className="space-y-3">
            <Textarea value={scan?.output ?? ''} readOnly rows={10} className="w-full bg-canvas" />
            {!scan ? (
              <p className="text-[11.5px] text-ink-faint">Running the pattern…</p>
            ) : scan.total > 0 ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-ink-soft">
                    {scan.total > scan.matches.length
                      ? `First ${scan.matches.length} of ${scan.total.toLocaleString()} matches`
                      : `${scan.total} match${scan.total === 1 ? '' : 'es'}`}
                  </p>
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border border-line">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line bg-canvas">
                        <th className="px-2 py-1 text-[11px] font-medium text-ink-faint">Line</th>
                        <th className="px-2 py-1 text-[11px] font-medium text-ink-faint">Match</th>
                        <th className="px-2 py-1 text-[11px] font-medium text-ink-faint">Groups</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scan.matches.map((match) => (
                        <tr key={`${match.index}-${match.text}`} className="border-b border-line last:border-b-0">
                          <td className="px-2 py-1 align-top font-mono text-[11.5px] text-ink-faint">{match.line}</td>
                          <td className="px-2 py-1 align-top font-mono text-[11.5px] text-ink selectable">
                            {match.text === '' ? (
                              <span className="text-ink-faint">(empty match)</span>
                            ) : (
                              visible(match.text)
                            )}
                          </td>
                          <td className="px-2 py-1 align-top">
                            {match.groups.length === 0 ? (
                              <span className="text-[11.5px] text-ink-faint">—</span>
                            ) : (
                              <span className="flex flex-wrap gap-1">
                                {match.groups.map((group, i) => (
                                  <Badge key={i}>
                                    <span className="text-ink-faint">${i + 1}</span>
                                    <span className="font-mono">{group === '' ? '∅' : visible(group)}</span>
                                  </Badge>
                                ))}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] text-ink-faint">No match yet.</p>
            )}
          </div>
        );
      }}
    />
  );
}
