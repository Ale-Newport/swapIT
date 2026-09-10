import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/tool';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  IconButton,
  Input,
  Section,
  Switch,
  Textarea,
} from '@/components/ui';
import { buildQuery, duplicateKeys, groupPairs, parsePairs, type QueryPair } from './logic';

interface Row extends QueryPair {
  id: string;
}

const SAMPLE =
  'https://shop.example.com/search?q=running+shoes&tag=sale&tag=new&filter[price][min]=40&filter[price][max]=120&page=2&utm_source=news%20letter';

function toRows(pairs: QueryPair[]): Row[] {
  return pairs.map((p) => ({ ...p, id: crypto.randomUUID() }));
}

export default function QueryStringParser() {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [sortKeys, setSortKeys] = useState(false);
  const [encode, setEncode] = useState(true);
  const [leadingQuestionMark, setLeadingQuestionMark] = useState(true);

  const load = (text: string) => {
    setInput(text);
    setRows(toRows(parsePairs(text)));
  };

  const output = useMemo(
    () => buildQuery(rows, { sortKeys, encode, leadingQuestionMark }),
    [rows, sortKeys, encode, leadingQuestionMark],
  );

  const structured = useMemo(() => JSON.stringify(groupPairs(rows), null, 2), [rows]);
  const duplicates = useMemo(() => duplicateKeys(rows), [rows]);

  const updateRow = (id: string, patch: Partial<QueryPair>) =>
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        // A key pasted without "=" stops being valueless once it has a value,
        // and goes back to a bare key when the value is cleared again.
        if (patch.value !== undefined) next.valueless = row.valueless && patch.value === '';
        return next;
      }),
    );

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Query string or URL"
            description="Paste a whole URL, a path with a query, or just the query itself"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="ClipboardPaste"
                  onClick={async () => {
                    try {
                      load(await navigator.clipboard.readText());
                    } catch {
                      /* clipboard unavailable */
                    }
                  }}
                >
                  Paste
                </Button>
                <Button size="sm" variant="ghost" onClick={() => load(SAMPLE)}>
                  Sample
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="X"
                  onClick={() => {
                    setInput('');
                    setRows([]);
                  }}
                >
                  Clear
                </Button>
              </>
            }
          >
            <Textarea
              value={input}
              rows={3}
              placeholder="https://example.com/search?q=cats&page=2"
              onChange={(e) => load(e.target.value)}
            />
          </Section>

          <Section
            title="Parameters"
            description="Edit, add or remove — the rebuilt string follows"
            actions={
              <>
                {duplicates.length > 0 && (
                  <Badge tone="warn">
                    {duplicates.length} repeated key{duplicates.length === 1 ? '' : 's'}
                  </Badge>
                )}
                <Badge>{rows.length} total</Badge>
              </>
            }
          >
            {rows.length === 0 ? (
              <p className="text-[12.5px] text-ink-faint">
                No parameters yet. Paste a query string above, or add a row to build one from scratch.
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="w-[38%] text-[11px] uppercase tracking-wide text-ink-faint">Key</span>
                  <span className="flex-1 text-[11px] uppercase tracking-wide text-ink-faint">Value</span>
                  <span className="w-7" />
                </div>
                {rows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      spellCheck={false}
                      onChange={(e) => updateRow(row.id, { key: e.target.value })}
                      className="w-[38%] font-mono"
                    />
                    <Input
                      value={row.value}
                      spellCheck={false}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })}
                      className="flex-1 font-mono"
                    />
                    <IconButton
                      icon="Trash2"
                      label={`Remove ${row.key || 'parameter'}`}
                      size="sm"
                      onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <Button
                size="sm"
                icon="Plus"
                onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), key: '', value: '' }])}
              >
                Add parameter
              </Button>
            </div>
          </Section>

          <Section
            title="Rebuilt query string"
            actions={<CopyButton value={() => output} size="sm" variant="ghost" disabled={!output} />}
          >
            <p className="min-h-[44px] break-all rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px] leading-[1.6] text-ink selectable">
              {output || <span className="text-ink-faint">Add a parameter to build a query string.</span>}
            </p>
          </Section>

          <Section
            title="Structure"
            description="Repeated keys become arrays; a[b] and a[] become objects and lists"
            actions={<CopyButton value={() => structured} size="sm" variant="ghost" disabled={rows.length === 0} />}
          >
            <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[12px] leading-[1.6] text-ink selectable">
              {structured}
            </pre>
          </Section>
        </>
      }
      aside={
        <Section title="Rebuild options">
          <div className="space-y-1">
            <Field label="Sort keys" hint="Alphabetical, stable for repeated keys" inline>
              <Switch checked={sortKeys} onCheckedChange={setSortKeys} label="Sort keys" />
            </Field>
            <Field label="Percent-encode" hint="Off produces a readable, non-URL-safe string" inline>
              <Switch checked={encode} onCheckedChange={setEncode} label="Percent-encode" />
            </Field>
            <Field label="Leading ?" hint="Prefix the rebuilt string" inline>
              <Switch
                checked={leadingQuestionMark}
                onCheckedChange={setLeadingQuestionMark}
                label="Leading question mark"
              />
            </Field>
          </div>
          <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-faint">
            Values in the table are decoded, so <span className="font-mono">%20</span> and{' '}
            <span className="font-mono">+</span> both show as a space. Encoding is applied again when the string is
            rebuilt.
          </p>
        </Section>
      }
    />
  );
}
