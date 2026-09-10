import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  IconButton,
  Input,
  Section,
  Stat,
} from '@/components/ui';
import {
  EMPTY_PARTS,
  type Param,
  type UrlParts,
  buildParams,
  buildUrl,
  decodeSafe,
  defaultPort,
  host,
  hostLabels,
  isIpHost,
  origin,
  parseParams,
  parseUrl,
  segments,
} from './logic';

const SAMPLE =
  'https://reader:hunter2@api.example.com:8443/v2/orders%20list/42?status=open&tag=new&q=running+shoes#line-12';

interface ParamRow extends Param {
  id: string;
}

function toRows(params: Param[]): ParamRow[] {
  return params.map((p) => ({ ...p, id: crypto.randomUUID() }));
}

export default function UrlParser() {
  const [text, setText] = useState('');
  const [parts, setParts] = useState<UrlParts>(EMPTY_PARTS);
  const [params, setParams] = useState<ParamRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const load = (value: string) => {
    setText(value);
    if (!value.trim()) {
      setParts(EMPTY_PARTS);
      setParams([]);
      setError(null);
      return;
    }
    try {
      const next = parseUrl(value);
      setParts(next);
      setParams(toRows(parseParams(next.search)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /**
   * Any edit to a part or a parameter rewrites the URL in place. The query is
   * rebuilt only when the parameters themselves changed — editing the port must
   * never re-encode, reorder or otherwise touch the query the user pasted.
   */
  const apply = (patch: Partial<UrlParts>, nextParams?: ParamRow[]) => {
    const search = patch.search ?? (nextParams ? buildParams(nextParams) : parts.search);
    const next: UrlParts = { ...parts, ...patch, search };
    setParts(next);
    if (nextParams) setParams(nextParams);
    setText(buildUrl(next));
    setError(null);
  };

  const parsed = !error && (parts.hostname !== '' || parts.pathname !== '');
  const pathSegments = useMemo(() => segments(parts.pathname), [parts.pathname]);
  const labels = hostLabels(parts.hostname);
  const portNote = defaultPort(parts.protocol);

  return (
    <ToolShell
      main={
        <>
          <Section
            title="URL"
            description="Edit here, or edit any part below — both stay in sync"
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
                <CopyButton value={() => text} size="sm" variant="ghost" disabled={!text} />
              </>
            }
          >
            <Input
              value={text}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://example.com/path?query=value#hash"
              onChange={(e) => load(e.target.value)}
              className="font-mono"
            />
            {error && (
              <Alert tone="danger" className="mt-3" title="That is not a URL yet">
                {error}
              </Alert>
            )}
          </Section>

          <Section title="Parts">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Scheme" hint={portNote ? `default port ${portNote}` : 'no default port'}>
                <Input
                  value={parts.protocol}
                  spellCheck={false}
                  onChange={(e) => apply({ protocol: e.target.value.replace(/[:/]/g, '') })}
                  className="font-mono"
                />
              </Field>
              <Field label="Hostname" hint={isIpHost(parts.hostname) ? 'IP address' : `${labels.length} label${labels.length === 1 ? '' : 's'}`}>
                <Input
                  value={parts.hostname}
                  spellCheck={false}
                  onChange={(e) => apply({ hostname: e.target.value.trim() })}
                  className="font-mono"
                />
              </Field>
              <Field label="Port" hint={parts.port ? '' : portNote ? `implied ${portNote}` : ''}>
                <Input
                  value={parts.port}
                  spellCheck={false}
                  inputMode="numeric"
                  onChange={(e) => apply({ port: e.target.value.replace(/\D/g, '') })}
                  className="font-mono"
                />
              </Field>
              <Field label="Path" hint={`${pathSegments.length} segment${pathSegments.length === 1 ? '' : 's'}`}>
                <Input
                  value={parts.pathname}
                  spellCheck={false}
                  onChange={(e) => apply({ pathname: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field label="Username">
                <Input
                  value={parts.username}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => apply({ username: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field label="Password" hint={parts.password ? 'hidden until revealed' : 'none'}>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={parts.password}
                    type={showPassword ? 'text' : 'password'}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => apply({ password: e.target.value })}
                    className="font-mono"
                  />
                  <IconButton
                    icon={showPassword ? 'EyeOff' : 'Eye'}
                    label={showPassword ? 'Hide password' : 'Reveal password'}
                    size="sm"
                    onClick={() => setShowPassword((v) => !v)}
                  />
                </div>
              </Field>
              <Field label="Fragment" hint="the part after #">
                <Input
                  value={parts.hash}
                  spellCheck={false}
                  onChange={(e) => apply({ hash: e.target.value.replace(/^#/, '') })}
                  className="font-mono"
                />
              </Field>
              <Field label="Origin" hint="scheme + host + port, read-only">
                <Input value={origin(parts)} readOnly className="bg-canvas font-mono" />
              </Field>
            </div>
          </Section>

          <Section
            title="Query parameters"
            description="Values shown decoded; the URL is re-encoded when you edit"
            actions={<Badge>{params.length} total</Badge>}
          >
            {params.length === 0 ? (
              <p className="text-[12.5px] text-ink-faint">This URL has no query parameters.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="w-[38%] text-[11px] uppercase tracking-wide text-ink-faint">Key</span>
                  <span className="flex-1 text-[11px] uppercase tracking-wide text-ink-faint">Value</span>
                  <span className="w-7" />
                </div>
                {params.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      spellCheck={false}
                      onChange={(e) =>
                        apply({}, params.map((p) => (p.id === row.id ? { ...p, key: e.target.value } : p)))
                      }
                      className="w-[38%] font-mono"
                    />
                    <Input
                      value={row.value}
                      spellCheck={false}
                      onChange={(e) =>
                        apply(
                          {},
                          // Typing a value turns `?flag` into a normal `flag=…`
                          // pair; emptying it again restores the bare key.
                          params.map((p) =>
                            p.id === row.id
                              ? { ...p, value: e.target.value, valueless: p.valueless && e.target.value === '' }
                              : p,
                          ),
                        )
                      }
                      className="flex-1 font-mono"
                    />
                    <IconButton
                      icon="Trash2"
                      label={`Remove ${row.key || 'parameter'}`}
                      size="sm"
                      onClick={() => apply({}, params.filter((p) => p.id !== row.id))}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <Button
                size="sm"
                icon="Plus"
                onClick={() => apply({}, [...params, { id: crypto.randomUUID(), key: '', value: '' }])}
              >
                Add parameter
              </Button>
            </div>
          </Section>

          {pathSegments.length > 0 && (
            <Section title="Path segments" description="Percent-escapes decoded">
              <div className="space-y-1">
                {pathSegments.map((segment, index) => (
                  <div
                    key={`${index}-${segment}`}
                    className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5"
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-ink-faint">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink selectable">{segment}</span>
                    <CopyButton value={segment} size="sm" variant="ghost" className="w-[84px] shrink-0" />
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="Summary">
            {parsed ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat label="Host" value={host(parts) || '—'} />
                <Stat label="Scheme" value={parts.protocol || '—'} />
                <Stat label="Port" value={parts.port || (portNote ? `${portNote} (implied)` : '—')} />
                <Stat label="Parameters" value={params.length.toLocaleString()} />
                <Stat label="Segments" value={pathSegments.length.toLocaleString()} />
                <Stat label="Length" value={`${text.length.toLocaleString()} chars`} />
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint">Paste a URL to see its summary.</p>
            )}
          </Section>

          <Section title="Decoded fragment">
            <p className="break-all font-mono text-[12.5px] text-ink selectable">
              {parts.hash ? decodeSafe(parts.hash) : <span className="text-ink-faint">No fragment</span>}
            </p>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-faint">
              Credentials in a URL are sent in plain text and are stored in browser history — treat any password you see
              here as compromised.
            </p>
          </Section>
        </>
      }
    />
  );
}
