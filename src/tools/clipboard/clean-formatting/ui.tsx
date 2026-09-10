import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import type { ToolboxError } from '@/core/types';
import { ErrorDisplay, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Section,
  Switch,
  Textarea,
} from '@/components/ui';
import { DEFAULT_OPTIONS, type CleanOptions, cleanText } from './logic';

const OPTION_ROWS: Array<{ key: keyof CleanOptions; label: string; hint: string }> = [
  { key: 'straightQuotes', label: 'Straight quotes', hint: 'Curly quotes and primes become " and \'' },
  { key: 'plainPunctuation', label: 'Plain dashes', hint: 'Em and en dashes become -, ellipses become ...' },
  { key: 'normalSpaces', label: 'Ordinary spaces', hint: 'Non-breaking and narrow spaces become normal ones' },
  { key: 'removeInvisible', label: 'Remove invisible characters', hint: 'Zero-width marks and soft hyphens' },
  { key: 'trimTrailing', label: 'Trim line ends', hint: 'Spaces and tabs left at the end of a line' },
  { key: 'collapseBlankLines', label: 'Collapse blank lines', hint: 'Runs of empty lines become one' },
  { key: 'unwrapLines', label: 'Join wrapped lines', hint: 'Rejoin paragraphs broken into fixed-width lines' },
];

const NO_TEXT =
  'There is no text on the clipboard right now. Copy something — from a PDF, a web page or a document — then read it again.';

export default function PasteWithoutFormatting() {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<CleanOptions>(DEFAULT_OPTIONS);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<ToolboxError | null>(null);

  const readClipboard = useCallback(async () => {
    setReading(true);
    setStatus(null);
    setWriteError(null);
    try {
      const text = await readText();
      setInput(text ?? '');
      setProblem(text ? null : NO_TEXT);
    } catch {
      // readText rejects when the clipboard holds an image, a file or nothing.
      setProblem(NO_TEXT);
    } finally {
      setReading(false);
    }
  }, []);

  useEffect(() => {
    void readClipboard();
  }, [readClipboard]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2600);
    return () => clearTimeout(t);
  }, [status]);

  const result = useMemo(() => cleanText(input, options), [input, options]);

  const cleanAndCopy = async () => {
    try {
      await writeText(result.output);
    } catch (err) {
      // The clipboard can be refused: another app holds it, or access is denied.
      setStatus(null);
      setWriteError(asToolboxError(err));
      return;
    }
    // The clipboard now holds the cleaned text, so the panes agree again.
    setWriteError(null);
    setInput(result.output);
    setStatus('Cleaned text copied back — paste it anywhere.');
  };

  const set = (key: keyof CleanOptions, value: boolean) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const delta = result.output.length - input.length;

  return (
    <ToolShell
      main={
        <>
          <Section
            title="On the clipboard"
            description={`${input.length.toLocaleString()} characters`}
            actions={
              <Button size="sm" icon="RefreshCw" loading={reading} onClick={() => void readClipboard()}>
                Read clipboard
              </Button>
            }
          >
            <Textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setProblem(null);
              }}
              rows={10}
              aria-label="Text from the clipboard"
              placeholder="Copy some text, or paste it here directly…"
            />
            {problem && !input && (
              <Alert tone="info" className="mt-2">
                {problem}
              </Alert>
            )}
          </Section>

          <Section
            title="Cleaned"
            description={
              input
                ? result.total > 0
                  ? `${result.total.toLocaleString()} change${result.total === 1 ? '' : 's'} · ${result.output.length.toLocaleString()} characters${
                      delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta.toLocaleString()})` : ''
                    }`
                  : 'Already plain — nothing needed changing'
                : 'Waiting for text'
            }
            actions={
              <>
                <CopyButton value={() => result.output} label="Copy" disabled={!result.output} />
                <Button
                  size="sm"
                  variant="primary"
                  icon="ClipboardPaste"
                  disabled={!input}
                  onClick={() => void cleanAndCopy()}
                >
                  Clean and copy back
                </Button>
              </>
            }
          >
            <Textarea
              value={result.output}
              readOnly
              rows={10}
              aria-label="Cleaned text"
              placeholder="The cleaned text appears here."
            />
            {status && (
              <Alert tone="success" className="mt-2">
                {status}
              </Alert>
            )}
            {writeError && (
              <div className="mt-2">
                <ErrorDisplay
                  error={{
                    ...writeError,
                    message: `The cleaned text could not be put on the clipboard. ${writeError.message}`,
                  }}
                  onRetry={() => void cleanAndCopy()}
                />
              </div>
            )}
          </Section>
        </>
      }
      aside={
        <>
          <Section title="What changed">
            {!input ? (
              <p className="text-[12.5px] text-ink-faint">Read the clipboard to see what would be cleaned.</p>
            ) : result.changes.length === 0 ? (
              <p className="text-[12.5px] text-ink-soft">
                This text is already plain — no smart quotes, no hidden characters, no stray spacing.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {result.changes.map((change) => (
                  <li key={change.id} className="flex items-center justify-between gap-3 text-[12.5px] text-ink">
                    <span className="min-w-0 truncate">{change.label}</span>
                    <Badge tone="accent">{change.count.toLocaleString()}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="What to clean">
            <div className="space-y-0.5">
              {OPTION_ROWS.map((row) => (
                <Field key={row.key} inline label={row.label} hint={row.hint}>
                  <Switch
                    checked={options[row.key]}
                    onCheckedChange={(value) => set(row.key, value)}
                    label={row.label}
                  />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Windows line breaks are always turned into plain ones. Joining wrapped lines is off by
              default because it changes where paragraphs break; lists, headings, indented code and short
              lines are never joined.
            </p>
          </Section>
        </>
      }
    />
  );
}
