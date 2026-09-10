import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, call } from '@/core/bridge';
import type { ToolboxError } from '@/core/types';
import { ErrorDisplay, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  IconButton,
  Section,
  Segmented,
  Select,
  Spinner,
  Stat,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  ALGORITHMS,
  digestReport,
  formatDigest,
  prepareText,
  utf8ByteLength,
  type AlgorithmId,
  type LineEndings,
} from './logic';

type Digests = Partial<Record<AlgorithmId, string>>;

export default function HashText() {
  const [text, setText] = useState('');
  const [uppercase, setUppercase] = useState(false);
  const [lineEndings, setLineEndings] = useState<LineEndings>('as-is');
  const [trailingNewline, setTrailingNewline] = useState(false);
  const [digests, setDigests] = useState<Digests>({});
  const [error, setError] = useState<ToolboxError | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<AlgorithmId | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyDigest = async (id: AlgorithmId, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
    } catch {
      /* clipboard blocked */
    }
  };

  const payload = useMemo(
    () => prepareText(text, { lineEndings, trailingNewline }),
    [text, lineEndings, trailingNewline],
  );

  // Hashing is a backend round trip, so wait for a pause in the typing.
  useEffect(() => {
    if (!payload) {
      setDigests({});
      setError(null);
      setBusy(false);
      return;
    }
    let stale = false;
    setBusy(true);
    const timer = setTimeout(() => {
      void Promise.all(
        ALGORITHMS.map(async (algorithm) => [
          algorithm.id,
          await call<string>('hash_text', { text: payload, algorithm: algorithm.id }),
        ] as const),
      )
        .then((pairs) => {
          if (stale) return;
          setDigests(Object.fromEntries(pairs) as Digests);
          setError(null);
        })
        .catch((err) => {
          if (stale) return;
          setDigests({});
          setError(asToolboxError(err));
        })
        .finally(() => {
          if (!stale) setBusy(false);
        });
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [payload]);

  const bytes = utf8ByteLength(payload);
  const hasResults = Object.keys(digests).length > 0;

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Text"
            description="Hashed by Toolbox itself — nothing is sent anywhere"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="ClipboardPaste"
                  onClick={async () => {
                    try {
                      setText(await navigator.clipboard.readText());
                    } catch {
                      /* clipboard unavailable */
                    }
                  }}
                >
                  Paste
                </Button>
                <IconButton icon="X" label="Clear the text" size="sm" onClick={() => setText('')} />
              </>
            }
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Type or paste anything — the four digests update as you go."
              className="w-full"
            />
            <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
              {text.length.toLocaleString()} characters · {bytes.toLocaleString()} bytes hashed
              {busy && (
                <span className="flex items-center gap-1">
                  <Spinner size={11} /> hashing
                </span>
              )}
            </p>
          </Section>

          {error && <ErrorDisplay error={error} />}

          <Section
            title="Digests"
            description={hasResults ? 'Click any value to copy it' : undefined}
            actions={
              hasResults ? (
                <CopyButton
                  size="sm"
                  variant="ghost"
                  label="Copy all"
                  value={() => digestReport(digests, uppercase)}
                />
              ) : undefined
            }
            dense
          >
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {ALGORITHMS.map((algorithm) => {
                const digest = digests[algorithm.id];
                return (
                  <li key={algorithm.id} className="bg-panel px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-[12.5px] font-medium text-ink">{algorithm.label}</span>
                      <Badge>{algorithm.bits} bit</Badge>
                      {!algorithm.secure && <Badge tone="warn">not for security</Badge>}
                      {copied === algorithm.id && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-success">
                          <Icon name="Check" size={12} /> Copied
                        </span>
                      )}
                      <span className="ml-auto shrink-0">
                        <CopyButton size="sm" variant="ghost" value={digest ? formatDigest(digest, uppercase) : ''} disabled={!digest} />
                      </span>
                    </div>
                    {digest ? (
                      <button
                        type="button"
                        title={`Copy the ${algorithm.label} digest`}
                        onClick={() => void copyDigest(algorithm.id, formatDigest(digest, uppercase))}
                        className={`selectable mt-1.5 block w-full break-all text-left font-mono text-[12.5px] transition-colors ${
                          copied === algorithm.id ? 'text-success' : 'text-ink hover:text-accent'
                        }`}
                      >
                        {formatDigest(digest, uppercase)}
                      </button>
                    ) : (
                      <p className="mt-1.5 break-all font-mono text-[12.5px] text-ink-faint">
                        {algorithm.digits} hex characters appear here
                      </p>
                    )}
                    <p className="mt-1 text-[11.5px] text-ink-faint">{algorithm.note}</p>
                  </li>
                );
              })}
            </ul>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Output">
            <div className="space-y-3">
              <Field label="Letter case">
                <Segmented
                  value={uppercase ? 'upper' : 'lower'}
                  onChange={(v) => setUppercase(v === 'upper')}
                  options={[
                    { value: 'lower', label: 'lowercase' },
                    { value: 'upper', label: 'UPPERCASE' },
                  ]}
                  className="w-full"
                />
              </Field>
              <Stat label="Bytes hashed" value={bytes.toLocaleString()} hint="UTF-8" />
            </div>
          </Section>

          <Section title="What gets hashed" description="The usual reasons two hashes disagree">
            <div className="space-y-3">
              <Field label="Line endings">
                <Select
                  value={lineEndings}
                  onChange={(e) => setLineEndings(e.target.value as LineEndings)}
                  options={[
                    { value: 'as-is', label: 'Exactly as typed' },
                    { value: 'lf', label: 'Convert to LF (Unix)' },
                    { value: 'crlf', label: 'Convert to CRLF (Windows)' },
                  ]}
                />
              </Field>
              <Field inline label="Trailing newline" hint="Matches echo text | shasum">
                <Switch checked={trailingNewline} onCheckedChange={setTrailingNewline} />
              </Field>
            </div>
          </Section>

          <Alert tone="warn" title="MD5 and SHA-1 are not secure">
            Both can be forged: two different inputs can be made to share a digest. Use them only to spot accidental
            corruption, and reach for SHA-256 whenever the answer has to be trusted.
          </Alert>

          <p className="flex items-start gap-2 text-[11.5px] text-ink-faint">
            <Icon name="Info" size={13} className="mt-[1px] shrink-0" />
            Hashing is one-way. There is no undo button here, and any site claiming to reverse a hash is only looking
            the value up in a table of common inputs.
          </p>
        </>
      }
    />
  );
}
